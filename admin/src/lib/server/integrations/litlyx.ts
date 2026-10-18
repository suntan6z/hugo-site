import { integrations } from '../env.ts';
import { memo, invalidate } from '../cache.ts';
import {
	parseCounts, parseTimeline, viewsByArticle, change, externalReferrers, mergePaths, labelled,
	parseDurations, weightedAverage, parseLive,
	type CountRow, type ArticleViews, type DurationRow
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
 * What a shareable link may read is decided per endpoint by Litlyx (`flag:allowShare`
 * in its source). Pages, referrers, countries, devices, browsers, systems, campaigns,
 * entry and exit pages, time on page, bounce rate, session length and live visitors
 * are open to it. Custom events, their metadata and the raw visit export are not, so
 * they are not here.
 *
 * The same numbers the site already collects; nothing new is tracked here.
 */

export const isConfigured = () => !!integrations.litlyxToken;

const DAY = 86_400_000;
const TTL_MS = 10 * 60_000;
const LIVE_TTL_MS = 60_000;

export class LitlyxError extends Error {}

interface CallOptions {
	from: number;
	to: number;
	limit?: number;
	slice?: 'day';
	/** Query-string parameters some endpoints take (`utm_type`, `linkId`). */
	query?: Record<string, string>;
}

async function call(path: string, h: CallOptions): Promise<unknown> {
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
	const qs = h.query ? `?${new URLSearchParams(h.query)}` : '';
	let r: Response;
	try {
		r = await fetch(`${host}/api/${path}${qs}`, { headers, signal: AbortSignal.timeout(15_000) });
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

/** Who the visitors were and how they came, beyond the pages they read. */
export interface Breakdown {
	devices: CountRow[];
	browsers: CountRow[];
	systems: CountRow[];
	/** UTM tags the site was linked with, when anyone used them. */
	sources: CountRow[];
	mediums: CountRow[];
	campaigns: CountRow[];
	/** Where visits began and ended. */
	entryPages: CountRow[];
	exitPages: CountRow[];
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
	breakdown: Breakdown;
	/** How long readers stay on each page, longest-read first. */
	durations: DurationRow[];
	engagement: {
		/** Percent of visits that read a single page. */
		bounceRate: number | null;
		/** Average length of a visit, in seconds. */
		sessionSeconds: number | null;
	};
	/**
	 * The parts Litlyx did not answer (an endpoint this version lacks, a timeout).
	 * Each is left empty rather than failing the page; the page says which.
	 */
	unavailable: string[];
	fetchedAt: string;
}

export interface VisitorResult {
	configured: boolean;
	error: string | null;
	data: VisitorData | null;
}

type Window = { from: number; to: number };

/** The answer of one optional call, or the fallback and a note of what is missing. */
async function optional<T>(name: string, missing: string[], fallback: T, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch {
		missing.push(name);
		return fallback;
	}
}

/** Everything beyond the six numbers the page cannot do without. Each part stands alone. */
async function loadExtras(window: Window, visitDays: { date: string; count: number }[]) {
	const missing: string[] = [];
	const counts = (name: string, path: string, limit: number, query?: Record<string, string>) =>
		optional<CountRow[]>(name, missing, [], async () => parseCounts(await call(path, { ...window, limit, query })));

	const [devices, browsers, systems, sources, mediums, campaigns, entryPages, exitPages, durations, bounce, stay] = await Promise.all([
		counts('devices', 'data/devices', 10),
		counts('browsers', 'data/browsers', 10),
		counts('systems', 'data/oss', 10),
		counts('campaign sources', 'data/utm', 10, { utm_type: 'source' }),
		counts('campaign mediums', 'data/utm', 10, { utm_type: 'medium' }),
		counts('campaigns', 'data/utm', 10, { utm_type: 'campaign' }),
		counts('entry pages', 'data/entry_pages', 50),
		counts('exit pages', 'data/exit_pages', 50),
		optional<DurationRow[]>('time on page', missing, [], async () => parseDurations(await call('data/pages_durations', { ...window, limit: 500 }))),
		optional<number | null>('bounce rate', missing, null, async () =>
			weightedAverage(parseTimeline(await call('timeline/bouncing_rate', { ...window, slice: 'day' }), window.from, window.to), visitDays)
		),
		optional<number | null>('visit length', missing, null, async () =>
			weightedAverage(parseTimeline(await call('timeline/sessions_duration', { ...window, slice: 'day' }), window.from, window.to), visitDays)
		)
	]);

	return {
		breakdown: {
			devices: labelled(devices),
			browsers: labelled(browsers),
			systems: labelled(systems),
			sources: labelled(sources),
			mediums: labelled(mediums),
			campaigns: labelled(campaigns),
			entryPages: mergePaths(entryPages).slice(0, 10),
			exitPages: mergePaths(exitPages).slice(0, 10)
		} satisfies Breakdown,
		durations,
		engagement: { bounceRate: bounce, sessionSeconds: stay },
		unavailable: missing
	};
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
	const extras = await loadExtras(window, visitDays);

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
		...extras,
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

/**
 * People on the site in the last five minutes, or null when Litlyx cannot say. Cached
 * for a minute, apart from the ten-minute numbers, so it is current without a request
 * on every page view.
 */
export async function fetchLive(): Promise<number | null> {
	if (!isConfigured()) return null;
	try {
		return await memo('litlyx:live', LIVE_TTL_MS, async () => {
			const now = Date.now();
			return parseLive(await call('share/live_users', { from: now - 5 * 60_000, to: now, query: { linkId: integrations.litlyxToken } }));
		});
	} catch {
		return null;
	}
}

export const refreshVisitors = () => invalidate('litlyx:');
