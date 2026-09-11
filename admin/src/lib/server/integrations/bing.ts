import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';
import { memo } from '../cache.ts';
import {
	parseTraffic, parseQueries, parsePages,
	type TrafficPoint, type QueryRow, type PageRow
} from './bing-parse.ts';

export * from './bing-parse.ts';

/**
 * Bing Webmaster Tools.
 *
 * A .NET service exposed as JSON: every call is a GET with the key in the
 * query string, and results come back wrapped in `d`. There is no date-range
 * parameter — each method returns a fixed recent window — so the portal slices
 * what it needs from what it gets.
 *
 * Responses are cached in object storage as well as in process, because the
 * API has a daily quota and the numbers only change once a day anyway.
 */

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const DISK_TTL_MS = 6 * 60 * 60 * 1000; // numbers update daily; 6h is plenty
const MEM_TTL_MS = 10 * 60 * 1000;

export const isConfigured = () => !!integrations.bingApiKey;

interface Cached<T> {
	at: string;
	value: T;
}

async function call(method: string): Promise<unknown> {
	const key = integrations.bingApiKey;
	if (!key) throw new Error('BING_API_KEY is not configured.');

	const url =
		`${BASE}/${method}` +
		`?apikey=${encodeURIComponent(key)}` +
		`&siteUrl=${encodeURIComponent(integrations.siteUrl)}`;

	const r = await fetch(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(15_000)
	});
	if (!r.ok) {
		const body = (await r.text()).slice(0, 300);
		// 401 here almost always means the key is fine but the site is not
		// verified under this account, which is worth saying plainly.
		throw new Error(
			r.status === 401
				? `Bing rejected the request (401). Check that ${integrations.siteUrl} is verified in Bing Webmaster Tools under the account that issued the key.`
				: `Bing ${method} failed: ${r.status} ${body}`
		);
	}
	return r.json();
}

/** Disk-cached fetch, so a quota-limited API is not hit on every page view. */
async function cached<T>(method: string, parse: (body: unknown) => T): Promise<Cached<T>> {
	const diskKey = `cache/bing-${method}`;
	return memo(`bing:${method}`, MEM_TTL_MS, async () => {
		const hit = await store.get<Cached<T>>(diskKey);
		if (hit && Date.now() - Date.parse(hit.at) < DISK_TTL_MS) return hit;

		try {
			const fresh = { at: new Date().toISOString(), value: parse(await call(method)) };
			await store.put(diskKey, fresh);
			return fresh;
		} catch (e) {
			// Serving yesterday's numbers beats showing an error page.
			if (hit) return hit;
			throw e;
		}
	});
}

export interface BingData {
	traffic: TrafficPoint[];
	queries: QueryRow[];
	pages: PageRow[];
	fetchedAt: string;
	stale: boolean;
}

export interface BingResult {
	configured: boolean;
	data: BingData | null;
	error: string | null;
}

export async function fetchBing(): Promise<BingResult> {
	if (!isConfigured()) return { configured: false, data: null, error: null };

	try {
		const [traffic, queries, pages] = await Promise.all([
			cached('GetRankAndTrafficStats', parseTraffic),
			cached('GetQueryStats', parseQueries),
			cached('GetPageStats', parsePages)
		]);
		const fetchedAt = [traffic.at, queries.at, pages.at].sort()[0];
		return {
			configured: true,
			error: null,
			data: {
				traffic: traffic.value,
				queries: queries.value,
				pages: pages.value,
				fetchedAt,
				stale: Date.now() - Date.parse(fetchedAt) > DISK_TTL_MS
			}
		};
	} catch (e) {
		return { configured: true, data: null, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Drops the cached responses so the next load re-fetches. */
export async function refreshBing(): Promise<void> {
	for (const m of ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats']) {
		await store.del(`cache/bing-${m}`);
	}
}
