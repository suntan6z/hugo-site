/**
 * Parsing for the Bing Webmaster Tools API.
 *
 * The API is a .NET WCF service exposed as JSON, which shows: results arrive
 * wrapped in a `d` property, and dates come back in the legacy Microsoft format
 * `/Date(1757548800000-0700)/`.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

export interface TrafficPoint {
	date: string; // YYYY-MM-DD
	clicks: number;
	impressions: number;
}

export interface QueryRow {
	query: string;
	clicks: number;
	impressions: number;
	avgClickPosition: number;
	avgImpressionPosition: number;
}

export interface PageRow {
	url: string;
	clicks: number;
	impressions: number;
}

/**
 * `/Date(1757548800000-0700)/` -> `2026-09-11`.
 *
 * The number is milliseconds since the Unix epoch in UTC; the trailing offset
 * is informational and must NOT be added, or every date shifts by hours and
 * points land on the wrong day.
 */
export function parseDotNetDate(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const m = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(v);
	if (!m) return null;
	const d = new Date(Number(m[1]));
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Bing wraps every payload in `d`; some methods return it null rather than []. */
export function unwrap(body: unknown): unknown[] {
	if (!body || typeof body !== 'object') return [];
	const d = (body as { d?: unknown }).d;
	return Array.isArray(d) ? d : [];
}

export function parseTraffic(body: unknown): TrafficPoint[] {
	return unwrap(body)
		.map((r) => {
			const row = r as Record<string, unknown>;
			const date = parseDotNetDate(row.Date);
			return date ? { date, clicks: num(row.Clicks), impressions: num(row.Impressions) } : null;
		})
		.filter((x): x is TrafficPoint => x !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseQueries(body: unknown): QueryRow[] {
	// One row per query per day; the dashboard wants totals per query.
	const totals = new Map<string, QueryRow>();
	for (const r of unwrap(body)) {
		const row = r as Record<string, unknown>;
		const query = str(row.Query);
		if (!query) continue;
		const prev = totals.get(query);
		const clicks = num(row.Clicks);
		const impressions = num(row.Impressions);
		if (!prev) {
			totals.set(query, {
				query,
				clicks,
				impressions,
				avgClickPosition: num(row.AvgClickPosition),
				avgImpressionPosition: num(row.AvgImpressionPosition)
			});
			continue;
		}
		// Positions are averages, so weight them by the rows they came from
		// rather than summing.
		const total = prev.impressions + impressions;
		prev.avgImpressionPosition =
			total > 0
				? (prev.avgImpressionPosition * prev.impressions +
						num(row.AvgImpressionPosition) * impressions) /
					total
				: prev.avgImpressionPosition;
		const totalClicks = prev.clicks + clicks;
		prev.avgClickPosition =
			totalClicks > 0
				? (prev.avgClickPosition * prev.clicks + num(row.AvgClickPosition) * clicks) / totalClicks
				: prev.avgClickPosition;
		prev.clicks = totalClicks;
		prev.impressions = total;
	}
	return [...totals.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export function parsePages(body: unknown): PageRow[] {
	const totals = new Map<string, PageRow>();
	for (const r of unwrap(body)) {
		const row = r as Record<string, unknown>;
		const url = str(row.Query) || str(row.Url);
		if (!url) continue;
		const prev = totals.get(url) ?? { url, clicks: 0, impressions: 0 };
		prev.clicks += num(row.Clicks);
		prev.impressions += num(row.Impressions);
		totals.set(url, prev);
	}
	return [...totals.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export const sum = (points: TrafficPoint[]) => ({
	clicks: points.reduce((n, p) => n + p.clicks, 0),
	impressions: points.reduce((n, p) => n + p.impressions, 0)
});

/** Click-through rate as a percentage, guarding the zero-impression case. */
export const ctr = (clicks: number, impressions: number) =>
	impressions > 0 ? (clicks / impressions) * 100 : 0;

/** Splits a series into two halves so the UI can show a trend. */
export function trend(points: TrafficPoint[]): { change: number; enough: boolean } {
	if (points.length < 4) return { change: 0, enough: false };
	const mid = Math.floor(points.length / 2);
	const a = sum(points.slice(0, mid)).clicks;
	const b = sum(points.slice(mid)).clicks;
	if (a === 0) return { change: b > 0 ? 100 : 0, enough: b > 0 };
	return { change: ((b - a) / a) * 100, enough: true };
}

/* ── Crawl health: what Bing's crawler found on the site ── */

export interface CrawlPoint {
	date: string; // YYYY-MM-DD
	/** Pages Bing fetched that day. */
	crawled: number;
	/** Fetches that failed, whatever the reason. */
	errors: number;
	/** Pages in Bing's index at the time. */
	indexed: number;
	blockedByRobots: number;
	dnsFailures: number;
	timeouts: number;
	notFound: number; // Code4xx
	serverErrors: number; // Code5xx
}

/** One row a day; sorted oldest first. */
export function parseCrawlStats(body: unknown): CrawlPoint[] {
	return unwrap(body)
		.map((r) => {
			const row = r as Record<string, unknown>;
			const date = parseDotNetDate(row.Date);
			return date
				? {
						date,
						crawled: num(row.CrawledPages),
						errors: num(row.CrawlErrors),
						indexed: num(row.InIndex),
						blockedByRobots: num(row.BlockedByRobotsTxt),
						dnsFailures: num(row.DnsFailures),
						timeouts: num(row.ConnectionTimeout),
						notFound: num(row.Code4xx),
						serverErrors: num(row.Code5xx)
					}
				: null;
		})
		.filter((x): x is CrawlPoint => x !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CrawlIssue {
	url: string;
	httpCode: number;
	/** Bing's own bit mask of what went wrong; the portal shows it as is. */
	issues: number;
	inLinks: number;
}

/** Pages Bing could not fetch or understand. An empty list is the good answer. */
export function parseCrawlIssues(body: unknown): CrawlIssue[] {
	return unwrap(body)
		.map((r) => {
			const row = r as Record<string, unknown>;
			const url = str(row.Url);
			return url ? { url, httpCode: num(row.HttpCode), issues: num(row.Issues), inLinks: num(row.InLinks) } : null;
		})
		.filter((x): x is CrawlIssue => x !== null)
		.sort((a, b) => b.inLinks - a.inLinks || a.url.localeCompare(b.url));
}

export interface SitemapRow {
	url: string;
	type: string;
	/** Bing's word: Success, Pending, an error. */
	status: string;
	submitted: string | null;
	lastCrawled: string | null;
	urlCount: number;
}

/** The sitemaps Bing knows of, with how it got on with each. */
export function parseFeeds(body: unknown): SitemapRow[] {
	return unwrap(body)
		.map((r) => {
			const row = r as Record<string, unknown>;
			const url = str(row.Url);
			return url
				? {
						url,
						type: str(row.Type) || 'Sitemap',
						status: str(row.Status) || 'Unknown',
						submitted: parseDotNetDate(row.Submitted),
						lastCrawled: parseDotNetDate(row.LastCrawled),
						urlCount: num(row.UrlCount)
					}
				: null;
		})
		.filter((x): x is SitemapRow => x !== null);
}
