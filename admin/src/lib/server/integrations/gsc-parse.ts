/**
 * Google Search Console's answers, turned into what the portal shows.
 *
 * Tolerant like the other parsers: a row that is not what it should be is skipped,
 * never thrown on. Free of I/O so the suite can drive it directly.
 */

export interface DayRow {
	date: string; // YYYY-MM-DD
	clicks: number;
	impressions: number;
	/** Average position in results (1 is the top). */
	position: number;
}

export interface QueryRow {
	query: string;
	clicks: number;
	impressions: number;
	position: number;
}

export interface PageRow {
	url: string;
	clicks: number;
	impressions: number;
	position: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

interface Row {
	keys: string[];
	clicks: number;
	impressions: number;
	position: number;
}

/** `{ rows: [{ keys: [...], clicks, impressions, ctr, position }] }`, or an empty list when there is nothing. */
function rowsOf(body: unknown): Row[] {
	const rows = (body as { rows?: unknown } | null)?.rows;
	if (!Array.isArray(rows)) return [];
	const out: Row[] = [];
	for (const r of rows) {
		if (!r || typeof r !== 'object') continue;
		const o = r as Record<string, unknown>;
		if (!Array.isArray(o.keys) || o.keys.some((k) => typeof k !== 'string')) continue;
		out.push({ keys: o.keys as string[], clicks: num(o.clicks), impressions: num(o.impressions), position: num(o.position) });
	}
	return out;
}

const byClicks = <T extends { clicks: number; impressions: number }>(a: T, b: T) => b.clicks - a.clicks || b.impressions - a.impressions;

/** One row per day (the query asked for the `date` dimension), oldest first. */
export function parseDaily(body: unknown): DayRow[] {
	return rowsOf(body)
		.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.keys[0] ?? ''))
		.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseQueries(body: unknown): QueryRow[] {
	return rowsOf(body)
		.filter((r) => (r.keys[0] ?? '') !== '')
		.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }))
		.sort(byClicks);
}

export function parsePages(body: unknown): PageRow[] {
	return rowsOf(body)
		.filter((r) => /^https?:\/\//.test(r.keys[0] ?? ''))
		.map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }))
		.sort(byClicks);
}

export interface SitemapRow {
	path: string;
	type: string;
	pending: boolean;
	errors: number;
	warnings: number;
	submitted: string | null;
	lastRead: string | null;
	/** URLs the sitemap offered, and how many of them Google indexed (all types added up). */
	offered: number;
	indexed: number;
}

const day = (v: unknown): string | null => {
	const t = typeof v === 'string' ? Date.parse(v) : NaN;
	return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

/** `{ sitemap: [{ path, lastSubmitted, lastDownloaded, isPending, errors, warnings, contents: [{ submitted, indexed }] }] }`. */
export function parseSitemaps(body: unknown): SitemapRow[] {
	const list = (body as { sitemap?: unknown } | null)?.sitemap;
	if (!Array.isArray(list)) return [];
	const out: SitemapRow[] = [];
	for (const s of list) {
		if (!s || typeof s !== 'object') continue;
		const o = s as Record<string, unknown>;
		const path = str(o.path);
		if (!path) continue;
		const contents = Array.isArray(o.contents) ? (o.contents as Record<string, unknown>[]) : [];
		// The API sends these counts as strings.
		const total = (k: string) => contents.reduce((n, c) => n + (Number(c?.[k]) || 0), 0);
		out.push({
			path,
			type: str(o.type) || (o.isSitemapsIndex ? 'sitemapIndex' : 'sitemap'),
			pending: o.isPending === true,
			errors: Number(o.errors) || 0,
			warnings: Number(o.warnings) || 0,
			submitted: day(o.lastSubmitted),
			lastRead: day(o.lastDownloaded),
			offered: total('submitted'),
			indexed: total('indexed')
		});
	}
	return out;
}

export interface Inspection {
	/** PASS, NEUTRAL, FAIL, PARTIAL or VERDICT_UNSPECIFIED. */
	verdict: string;
	/** Google's own sentence for the state, e.g. "Submitted and indexed". */
	coverage: string;
	indexing: string;
	robots: string;
	fetchState: string;
	lastCrawl: string | null;
	crawledAs: string;
	googleCanonical: string;
	userCanonical: string;
}

/** `{ inspectionResult: { indexStatusResult: { verdict, coverageState, … } } }`. Null when Google gave no index result. */
export function parseInspection(body: unknown): Inspection | null {
	const r = (body as { inspectionResult?: { indexStatusResult?: unknown } } | null)?.inspectionResult?.indexStatusResult;
	if (!r || typeof r !== 'object') return null;
	const o = r as Record<string, unknown>;
	if (!str(o.verdict) && !str(o.coverageState)) return null;
	return {
		verdict: str(o.verdict) || 'VERDICT_UNSPECIFIED',
		coverage: str(o.coverageState),
		indexing: str(o.indexingState),
		robots: str(o.robotsTxtState),
		fetchState: str(o.pageFetchState),
		lastCrawl: day(o.lastCrawlTime),
		crawledAs: str(o.crawledAs),
		googleCanonical: str(o.googleCanonical),
		userCanonical: str(o.userCanonical)
	};
}

/** What to tell the reader, in words, for a verdict. */
export function verdictLabel(verdict: string): { text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' } {
	switch (verdict) {
		case 'PASS':
			return { text: 'On Google', tone: 'ok' };
		case 'PARTIAL':
			return { text: 'Partly on Google', tone: 'warn' };
		case 'NEUTRAL':
			return { text: 'Not on Google', tone: 'warn' };
		case 'FAIL':
			return { text: 'Problem', tone: 'bad' };
		default:
			return { text: 'Unknown', tone: 'plain' };
	}
}

export const sum = (days: DayRow[]) => ({
	clicks: days.reduce((n, d) => n + d.clicks, 0),
	impressions: days.reduce((n, d) => n + d.impressions, 0)
});

/** Average position over a period, each day weighted by its impressions; null with none. */
export function averagePosition(days: DayRow[]): number | null {
	const total = days.reduce((n, d) => n + d.impressions, 0);
	return total === 0 ? null : Math.round((days.reduce((n, d) => n + d.position * d.impressions, 0) / total) * 10) / 10;
}
