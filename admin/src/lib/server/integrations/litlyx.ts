import { integrations } from '../env.ts';
import { memo, invalidate } from '../cache.ts';
import {
	parseCounts, parseTimeline, viewsByArticle, change, externalReferrers, pathOf,
	type CountRow, type ArticleViews
} from './litlyx-parse.ts';

export * from './litlyx-parse.ts';

/**
 * Visitor numbers from the self-hosted Litlyx dashboard (litlyx.loconsole.eu).
 *
 * Litlyx publishes a token API only for its hosted service. A self-hosted
 * dashboard answers its own data endpoints to two kinds of caller: a signed-in
 * user, or a shareable link. The portal is the second — LITLYX_TOKEN is the id
 * of a shareable link made for it, optionally with a password — which also
 * means it can read numbers and nothing else: no settings, no project changes.
 *
 * The same numbers the site already collects; nothing new is tracked here.
 */

export const isConfigured = () => !!integrations.litlyxToken;

const DAY = 86_400_000;
const TTL_MS = 10 * 60_000;

export class LitlyxError extends Error {}

async function call(path: string, h: { from: number; to: number; limit?: number; slice?: 'day' }): Promise<unknown> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'x-shared-link': integrations.litlyxToken,
		'x-shared-from': String(h.from),
		'x-shared-to': String(h.to),
		// Required even where it means nothing: an aggregation given no limit fails.
		'x-limit': String(h.limit ?? 100)
	};
	if (integrations.litlyxSharePassword) headers['x-shared-pass'] = integrations.litlyxSharePassword;
	if (h.slice) headers['x-shared-slice'] = h.slice;

	const host = integrations.litlyxHost.replace(/\/$/, '');
	let r: Response;
	try {
		r = await fetch(`${host}/api/${path}`, { headers, signal: AbortSignal.timeout(15_000) });
	} catch {
		throw new LitlyxError(`Litlyx at ${host} could not be reached.`);
	}
	const text = await r.text();
	if (!r.ok) {
		let reason = '';
		try {
			reason = String((JSON.parse(text) as { message?: unknown }).message ?? '');
		} catch {
			/* not JSON */
		}
		if (/password/i.test(reason)) throw new LitlyxError('Litlyx wants the shareable link’s password: set LITLYX_SHARE_PASSWORD.');
		if (/shared link/i.test(reason)) throw new LitlyxError('Litlyx does not recognise LITLYX_TOKEN as a shareable link. Make one in the dashboard and copy its id.');
		throw new LitlyxError(`Litlyx answered HTTP ${r.status}${reason ? `: ${reason}` : ''}.`);
	}
	try {
		return JSON.parse(text);
	} catch {
		// A Nuxt app answers unknown paths with its HTML shell and a 200.
		throw new LitlyxError(`${host} did not answer like a Litlyx dashboard. LITLYX_HOST should be the dashboard's address.`);
	}
}

export interface DailyVisits {
	date: string;
	views: number;
	visits: number;
}

export interface VisitorData {
	days: number;
	/** Every page load. */
	views: number;
	/** Sessions: one person reading several pages is one visit. */
	visits: number;
	/** Visits against the period of the same length just before. */
	trend: number | null;
	daily: DailyVisits[];
	pages: CountRow[];
	referrers: CountRow[];
	countries: CountRow[];
	byArticle: Record<string, ArticleViews>;
	fetchedAt: string;
}

export interface VisitorResult {
	configured: boolean;
	error: string | null;
	data: VisitorData | null;
}

/** Same URL written two ways (whole, or just the path) is one page. */
function mergePaths(rows: CountRow[]): CountRow[] {
	const m = new Map<string, number>();
	for (const r of rows) m.set(pathOf(r.key), (m.get(pathOf(r.key)) ?? 0) + r.count);
	return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

async function load(days: number): Promise<VisitorData> {
	const now = Date.now();
	const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
	const from = today - (days - 1) * DAY;
	const window = { from, to: now };
	const before = { from: from - days * DAY, to: from - 1 };

	const [views, visits, visitsBefore, pages, referrers, countries] = await Promise.all([
		call('timeline/visits', { ...window, slice: 'day' }),
		call('timeline/sessions', { ...window, slice: 'day' }),
		call('timeline/sessions', { ...before, slice: 'day' }),
		call('data/pages', { ...window, limit: 500 }),
		call('data/referrers', { ...window, limit: 50 }),
		call('data/countries', { ...window, limit: 10 })
	]);

	const viewDays = parseTimeline(views, from, now);
	const visitDays = parseTimeline(visits, from, now);
	const sum = (xs: { count: number }[]) => xs.reduce((n, x) => n + x.count, 0);
	const pageRows = mergePaths(parseCounts(pages));
	const siteHost = (() => {
		try {
			return new URL(integrations.siteUrl).hostname;
		} catch {
			return '';
		}
	})();

	return {
		days,
		views: sum(viewDays),
		visits: sum(visitDays),
		trend: change(sum(visitDays), sum(parseTimeline(visitsBefore, before.from, before.to))),
		daily: viewDays.map((d, i) => ({ date: d.date, views: d.count, visits: visitDays[i]?.count ?? 0 })),
		pages: pageRows,
		referrers: externalReferrers(parseCounts(referrers), siteHost).slice(0, 10),
		countries: parseCounts(countries).slice(0, 10),
		byArticle: viewsByArticle(pageRows),
		fetchedAt: new Date().toISOString()
	};
}

/** The last 28 days, cached for ten minutes. Never throws: a failure comes back as `error`. */
export async function fetchVisitors(days = 28): Promise<VisitorResult> {
	if (!isConfigured()) return { configured: false, error: null, data: null };
	try {
		return { configured: true, error: null, data: await memo(`litlyx:visitors:${days}`, TTL_MS, () => load(days)) };
	} catch (e) {
		return { configured: true, error: e instanceof Error ? e.message : String(e), data: null };
	}
}

export const refreshVisitors = () => invalidate('litlyx:');
