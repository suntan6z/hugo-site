/**
 * Google PageSpeed Insights' answer, turned into what the portal shows.
 *
 * It runs Lighthouse against a public URL, from Google's servers, and reports lab
 * figures from that one run. For a page with enough real visitors it also carries
 * field data from Chrome users; a small site mostly has none, which is not a fault.
 *
 * Free of I/O so the suite can drive it directly.
 */

export type Rating = 'good' | 'needs' | 'poor' | 'unknown';

export interface SpeedResult {
	/** Lighthouse category scores, 0 to 100. */
	scores: { performance: number | null; accessibility: number | null; seo: number | null; bestPractices: number | null };
	/** Lab figures from this run. */
	lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null };
	/** Google's verdict on real Chrome users' experience, when it has enough of them to say. */
	field: 'FAST' | 'AVERAGE' | 'SLOW' | null;
	finalUrl: string;
	/** When Google ran it. */
	at: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const score = (v: unknown): number | null => {
	const n = num(v);
	return n === null ? null : Math.round(n * 100);
};

/** `{ lighthouseResult: { categories, audits }, loadingExperience }`; null when there is no Lighthouse result. */
export function parseSpeed(body: unknown): SpeedResult | null {
	const b = body as { lighthouseResult?: Record<string, unknown>; loadingExperience?: Record<string, unknown>; analysisUTCTimestamp?: unknown } | null;
	const lh = b?.lighthouseResult;
	if (!lh || typeof lh !== 'object') return null;
	const cats = (lh.categories ?? {}) as Record<string, { score?: unknown }>;
	const audits = (lh.audits ?? {}) as Record<string, { numericValue?: unknown }>;
	const overall = b?.loadingExperience?.overall_category;
	return {
		scores: {
			performance: score(cats.performance?.score),
			accessibility: score(cats.accessibility?.score),
			seo: score(cats.seo?.score),
			bestPractices: score(cats['best-practices']?.score)
		},
		lab: {
			lcpMs: num(audits['largest-contentful-paint']?.numericValue),
			cls: num(audits['cumulative-layout-shift']?.numericValue),
			tbtMs: num(audits['total-blocking-time']?.numericValue),
			fcpMs: num(audits['first-contentful-paint']?.numericValue)
		},
		field: overall === 'FAST' || overall === 'AVERAGE' || overall === 'SLOW' ? overall : null,
		finalUrl: typeof lh.finalUrl === 'string' ? lh.finalUrl : '',
		at: typeof b?.analysisUTCTimestamp === 'string' ? b.analysisUTCTimestamp : null
	};
}

/** Google's published thresholds for the Core Web Vitals and their companions. */
const LIMITS = {
	lcpMs: [2500, 4000],
	fcpMs: [1800, 3000],
	tbtMs: [200, 600],
	cls: [0.1, 0.25]
} as const;

export function rate(metric: keyof typeof LIMITS, value: number | null): Rating {
	if (value === null) return 'unknown';
	const [good, needs] = LIMITS[metric];
	return value <= good ? 'good' : value <= needs ? 'needs' : 'poor';
}

/** A category score the way Lighthouse colours it: 90 and up is good, 50 to 89 needs work. */
export function rateScore(score: number | null): Rating {
	if (score === null) return 'unknown';
	return score >= 90 ? 'good' : score >= 50 ? 'needs' : 'poor';
}

/** `2.4 s` for a time in milliseconds, `340 ms` under a second. */
export function ms(v: number | null): string {
	if (v === null) return '–';
	return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}
