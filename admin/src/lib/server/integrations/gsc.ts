import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';
import { memo } from '../cache.ts';
import {
	GOOGLE_TOKEN_URL, parseServiceAccount, signAssertion, dateWindow
} from './gsc-auth.ts';
import {
	parseDaily, parseQueries, parsePages, parseSitemaps, parseInspection,
	type DayRow, type QueryRow, type PageRow, type SitemapRow, type Inspection
} from './gsc-parse.ts';

export * from './gsc-parse.ts';

/**
 * Google Search Console: how the site does in Google's results, which sitemaps it
 * knows, and whether a page is in its index.
 *
 * Read-only, as a service account (see gsc-auth.ts). The same shape as bing.ts:
 * a disk cache, because the numbers move once a day, and a result object instead of
 * a throw, so a Google outage is a missing block and not a broken page.
 */

const WEBMASTERS = () => `${integrations.gscApiUrl || 'https://www.googleapis.com'}/webmasters/v3`;
const INSPECTION = () => `${integrations.gscApiUrl || 'https://searchconsole.googleapis.com'}/v1`;
const DISK_TTL_MS = 6 * 60 * 60 * 1000;
const DAYS = 28;

export const isConfigured = () => !!integrations.gscServiceAccount && !!integrations.gscSiteUrl;

export class GoogleError extends Error {}

/** The access token, kept until a few minutes before Google would refuse it. */
async function accessToken(): Promise<string> {
	return memo('gsc:token', 50 * 60_000, async () => {
		const account = parseServiceAccount(integrations.gscServiceAccount);
		if (!account) throw new GoogleError('GSC_SERVICE_ACCOUNT_B64 is not the base64 of a service account key file.');
		const url = integrations.gscTokenUrl || GOOGLE_TOKEN_URL;
		const r = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion: signAssertion(account, Date.now(), url)
			}),
			signal: AbortSignal.timeout(15_000)
		});
		const body = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
		if (!r.ok || !body.access_token) {
			throw new GoogleError(`Google refused the service account: ${body.error_description ?? `HTTP ${r.status}`}.`);
		}
		return body.access_token;
	});
}

async function call(url: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<unknown> {
	const r = await fetch(url, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${await accessToken()}`,
			Accept: 'application/json',
			...(init.body ? { 'Content-Type': 'application/json' } : {})
		},
		body: init.body ? JSON.stringify(init.body) : undefined,
		signal: AbortSignal.timeout(20_000)
	});
	const text = await r.text();
	if (!r.ok) {
		let reason = '';
		try {
			reason = String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? '');
		} catch {
			/* not JSON */
		}
		// 403 is nearly always "the service account is not a user of this property", which is worth saying plainly.
		if (r.status === 403) {
			throw new GoogleError(`Google says no (403)${reason ? `: ${reason}` : ''}. Add the service account’s email as a user of ${integrations.gscSiteUrl} in Search Console.`);
		}
		throw new GoogleError(`Google answered HTTP ${r.status}${reason ? `: ${reason}` : ''}.`);
	}
	return text ? JSON.parse(text) : {};
}

const site = () => encodeURIComponent(integrations.gscSiteUrl);

const query = (dimension: 'date' | 'query' | 'page', rowLimit: number) => () => {
	const { startDate, endDate } = dateWindow(Date.now(), DAYS);
	return call(`${WEBMASTERS()}/sites/${site()}/searchAnalytics/query`, {
		method: 'POST',
		body: { startDate, endDate, dimensions: [dimension], rowLimit }
	});
};

interface Cached<T> {
	at: string;
	value: T;
}

/** Disk-cached, so Google's quota is not spent on every page view, and yesterday's numbers beat an error page. */
async function cached<T>(name: string, run: () => Promise<unknown>, parse: (body: unknown) => T): Promise<Cached<T>> {
	const diskKey = `cache/gsc-${name}`;
	return memo(`gsc:${name}`, 10 * 60_000, async () => {
		const hit = await store.get<Cached<T>>(diskKey);
		if (hit && Date.now() - Date.parse(hit.at) < DISK_TTL_MS) return hit;
		try {
			const fresh = { at: new Date().toISOString(), value: parse(await run()) };
			await store.put(diskKey, fresh);
			return fresh;
		} catch (e) {
			if (hit) return hit;
			throw e;
		}
	});
}

export interface GoogleData {
	days: DayRow[];
	queries: QueryRow[];
	pages: PageRow[];
	sitemaps: SitemapRow[];
	fetchedAt: string;
	stale: boolean;
}

export interface GoogleResult {
	configured: boolean;
	data: GoogleData | null;
	error: string | null;
}

export async function fetchGoogle(): Promise<GoogleResult> {
	if (!isConfigured()) return { configured: false, data: null, error: null };
	try {
		const [days, queries, pages] = await Promise.all([
			cached('daily', query('date', 100), parseDaily),
			cached('queries', query('query', 50), parseQueries),
			cached('pages', query('page', 100), parsePages)
		]);
		// Sitemaps are a bonus: a property that cannot list them still shows its numbers.
		const sitemaps = await cached('sitemaps', () => call(`${WEBMASTERS()}/sites/${site()}/sitemaps`, { method: 'GET' }), parseSitemaps).catch(() => null);
		const fetchedAt = [days.at, queries.at, pages.at].sort()[0];
		return {
			configured: true,
			error: null,
			data: {
				days: days.value,
				queries: queries.value,
				pages: pages.value,
				sitemaps: sitemaps?.value ?? [],
				fetchedAt,
				stale: Date.now() - Date.parse(fetchedAt) > DISK_TTL_MS
			}
		};
	} catch (e) {
		return { configured: true, data: null, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function refreshGoogle(): Promise<void> {
	for (const n of ['daily', 'queries', 'pages', 'sitemaps']) await store.del(`cache/gsc-${n}`);
}

/**
 * Whether one page is in Google's index, straight from Google (the URL Inspection API,
 * about two thousand a day). Remembered for ten minutes so a double click is one question.
 * Never throws: a refusal comes back as `error`.
 */
export async function inspectUrl(url: string): Promise<{ inspection: Inspection | null; error: string | null }> {
	if (!isConfigured()) return { inspection: null, error: 'Google Search Console is not connected.' };
	try {
		const body = await memo(`gsc:inspect:${url}`, 10 * 60_000, () =>
			call(`${INSPECTION()}/urlInspection/index:inspect`, {
				method: 'POST',
				body: { inspectionUrl: url, siteUrl: integrations.gscSiteUrl, languageCode: 'en' }
			})
		);
		return { inspection: parseInspection(body), error: null };
	} catch (e) {
		return { inspection: null, error: e instanceof Error ? e.message : String(e) };
	}
}
