/**
 * Litlyx's answers, turned into what the portal shows.
 *
 * The dashboard's data endpoints are internal to Litlyx rather than a
 * published API, and their shapes differ by endpoint and version: a timeline
 * row may carry its day as `_id` (a string, or `{ date }`) or as `date`. So
 * everything here is tolerant — an unexpected row is skipped, never thrown on.
 *
 * Free of I/O so the suite can drive it directly.
 */

export interface CountRow {
	key: string;
	count: number;
}

export interface DayPoint {
	/** YYYY-MM-DD, UTC. */
	date: string;
	count: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** `[{ _id: "/en/now/", count: 12 }, …]`, largest first. */
export function parseCounts(body: unknown): CountRow[] {
	if (!Array.isArray(body)) return [];
	const rows: CountRow[] = [];
	for (const r of body) {
		if (!r || typeof r !== 'object') continue;
		const o = r as Record<string, unknown>;
		const count = num(o.count);
		if (count === null) continue;
		const key = o._id === null || o._id === undefined || o._id === '' ? '' : String(o._id);
		rows.push({ key, count });
	}
	return rows.sort((a, b) => b.count - a.count);
}

function dayOf(v: unknown): string | null {
	if (v && typeof v === 'object' && 'date' in v) return dayOf((v as { date: unknown }).date);
	if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
	if (typeof v !== 'string') return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** One point per day, oldest first, with days Litlyx left out filled in as zero. */
export function parseTimeline(body: unknown, from: number, to: number): DayPoint[] {
	const byDay = new Map<string, number>();
	if (Array.isArray(body)) {
		for (const r of body) {
			if (!r || typeof r !== 'object') continue;
			const o = r as Record<string, unknown>;
			const date = dayOf(o._id ?? o.date);
			const count = num(o.count);
			if (!date || count === null) continue;
			byDay.set(date, (byDay.get(date) ?? 0) + count);
		}
	}
	const out: DayPoint[] = [];
	for (let t = Date.UTC(...ymd(from)); t <= to; t += 86_400_000) {
		const date = new Date(t).toISOString().slice(0, 10);
		out.push({ date, count: byDay.get(date) ?? 0 });
	}
	return out;
}

const ymd = (ms: number): [number, number, number] => {
	const d = new Date(ms);
	return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
};

/** The path of a page as Litlyx recorded it, which may be a whole URL. */
export function pathOf(page: string): string {
	try {
		return /^https?:\/\//i.test(page) ? new URL(page).pathname : page.split(/[?#]/)[0] || '/';
	} catch {
		return page;
	}
}

export interface ArticleViews {
	total: number;
	langs: Record<string, number>;
}

/** Page views folded into articles, across languages. Anything that is not an article is left out. */
export function viewsByArticle(pages: CountRow[]): Record<string, ArticleViews> {
	const out: Record<string, ArticleViews> = {};
	for (const p of pages) {
		const m = /^\/(en|fr|it)\/blog\/([a-z0-9-]+)\/?$/.exec(pathOf(p.key));
		if (!m) continue;
		const a = (out[m[2]] ??= { total: 0, langs: {} });
		a.total += p.count;
		a.langs[m[1]] = (a.langs[m[1]] ?? 0) + p.count;
	}
	return out;
}

/** Percentage change, or null when there is nothing to compare against. */
export function change(now: number, before: number): number | null {
	return before === 0 ? null : Math.round(((now - before) / before) * 100);
}

/** Referrers without the site itself: moving between its own pages is not a source of visitors. */
export function externalReferrers(rows: CountRow[], siteHost: string): CountRow[] {
	const merged = new Map<string, number>();
	for (const r of rows) {
		let host = r.key.trim();
		try {
			if (/^https?:\/\//i.test(host)) host = new URL(host).hostname;
		} catch {
			/* keep as written */
		}
		host = host.replace(/^www\./, '');
		if (host === siteHost.replace(/^www\./, '')) continue;
		const key = host === '' || host === 'self' ? 'Direct or unknown' : host;
		merged.set(key, (merged.get(key) ?? 0) + r.count);
	}
	return [...merged.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Same URL written two ways (whole, or just the path) is one page. */
export function mergePaths(rows: CountRow[]): CountRow[] {
	const m = new Map<string, number>();
	for (const r of rows) m.set(pathOf(r.key), (m.get(pathOf(r.key)) ?? 0) + r.count);
	return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Litlyx leaves a field empty when it could not tell (an unusual browser, no UTM tag); name it rather than show a blank row. */
export function labelled(rows: CountRow[], unknown = 'Unknown'): CountRow[] {
	const m = new Map<string, number>();
	for (const r of rows) {
		const key = r.key.trim() === '' || r.key.toLowerCase() === 'unknown' ? unknown : r.key;
		m.set(key, (m.get(key) ?? 0) + r.count);
	}
	return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export interface ShareRow extends CountRow {
	/** Whole percent of the rows' total. */
	share: number;
}

/** Each row with its share of the whole list, for a bar beside the number. */
export function withShare(rows: CountRow[]): ShareRow[] {
	const total = rows.reduce((n, r) => n + r.count, 0);
	return rows.map((r) => ({ ...r, share: total === 0 ? 0 : Math.round((r.count / total) * 100) }));
}

export interface DurationRow {
	key: string;
	/** How many times a reader's stay on it was measured. */
	measured: number;
	/** The average stay, in seconds. */
	seconds: number;
}

/**
 * `[{ _id: "/en/now/", count: 12, avgSeconds: 48 }, …]`: how long readers stay on
 * each page. The same page under several spellings is merged, its average weighted
 * by how often each was measured.
 */
export function parseDurations(body: unknown): DurationRow[] {
	if (!Array.isArray(body)) return [];
	const by = new Map<string, { measured: number; total: number }>();
	for (const r of body) {
		if (!r || typeof r !== 'object') continue;
		const o = r as Record<string, unknown>;
		const measured = num(o.count);
		const seconds = num(o.avgSeconds);
		if (measured === null || seconds === null || measured <= 0 || seconds < 0 || o._id === null || o._id === undefined) continue;
		const key = pathOf(String(o._id));
		const acc = by.get(key) ?? { measured: 0, total: 0 };
		acc.measured += measured;
		acc.total += measured * seconds;
		by.set(key, acc);
	}
	return [...by.entries()]
		.map(([key, a]) => ({ key, measured: a.measured, seconds: Math.round(a.total / a.measured) }))
		.sort((a, b) => b.measured - a.measured);
}

/**
 * A day-by-day figure (a bounce rate, an average stay) turned into one for the whole
 * period, each day counting as much as it had visits. Null when there were none.
 */
export function weightedAverage(values: DayPoint[], weights: DayPoint[]): number | null {
	const w = new Map(weights.map((p) => [p.date, p.count]));
	let sum = 0;
	let n = 0;
	for (const v of values) {
		const weight = w.get(v.date) ?? 0;
		sum += v.count * weight;
		n += weight;
	}
	return n === 0 ? null : Math.round((sum / n) * 10) / 10;
}

/** How many people are on the site right now: a bare number, or nothing usable. */
export function parseLive(body: unknown): number | null {
	const n = num(body);
	return n === null || n < 0 ? null : Math.round(n);
}

/** `1 min 5 s` for a stay, so a table of them reads at a glance. */
export function stayLabel(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '–';
	if (seconds < 60) return `${Math.round(seconds)} s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return s === 0 ? `${m} min` : `${m} min ${s} s`;
}
