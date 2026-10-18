/**
 * The site's daily health check: what it looks at, when something counts as wrong,
 * and when to say so. The checks themselves (HTTP, TLS) are in uptime.ts; this is
 * the judging, free of I/O so the suite can drive it directly.
 *
 * It is a daily look, not live monitoring: it runs inside the morning trigger that
 * already wakes the container, because waking it more often is what the bill is
 * sensitive to (see DEPLOY.md, "What it costs"). It cannot see an outage that begins
 * and ends between two runs.
 */

export type CheckKind = 'page' | 'form' | 'certificate';

export interface Check {
	name: string;
	kind: CheckKind;
	ok: boolean;
	/** How long the answer took, when there was one. */
	ms: number | null;
	/** One line a person can read: what was seen. */
	detail: string;
	/** Certificates only. */
	daysLeft?: number | null;
}

export interface HealthReport {
	at: string;
	checks: Check[];
}

/** One line of the record kept between runs. */
export interface HealthEntry {
	at: string;
	ok: boolean;
	problems: string[];
}

/** A certificate this close to its end is a problem to fix now; the renewal that should have happened has not. */
export const CERT_WARN_DAYS = 14;
/** Close enough to mention, far enough not to alarm. */
export const CERT_NOTICE_DAYS = 30;
const DAY = 86_400_000;
const KEEP = 60;

/** `Dec 31 23:59:59 2026 GMT`, as Node reports a certificate's end, as milliseconds; null if unreadable. */
export function parseCertDate(s: unknown): number | null {
	if (typeof s !== 'string') return null;
	const t = Date.parse(s);
	return Number.isNaN(t) ? null : t;
}

export function daysUntil(validToMs: number, nowMs: number): number {
	return Math.floor((validToMs - nowMs) / DAY);
}

export function certCheck(host: string, validToMs: number | null, nowMs: number, error?: string): Check {
	const name = `Certificate for ${host}`;
	if (validToMs === null) {
		return { name, kind: 'certificate', ok: false, ms: null, daysLeft: null, detail: `could not be read${error ? `: ${error}` : ''}` };
	}
	const daysLeft = daysUntil(validToMs, nowMs);
	const until = new Date(validToMs).toISOString().slice(0, 10);
	return {
		name,
		kind: 'certificate',
		ok: daysLeft > CERT_WARN_DAYS,
		ms: null,
		daysLeft,
		detail: daysLeft < 0 ? `expired on ${until}` : daysLeft === 0 ? `expires today (${until})` : `valid for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}, until ${until}`
	};
}

export function pageCheck(name: string, status: number | null, ms: number, error?: string): Check {
	if (status === null) return { name, kind: 'page', ok: false, ms, detail: error ? `no answer: ${error}` : 'no answer' };
	const ok = status >= 200 && status < 300;
	return { name, kind: 'page', ok, ms, detail: `HTTP ${status} in ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}` };
}

/** The names of the checks that failed. */
export const problemsOf = (r: HealthReport): string[] => r.checks.filter((c) => !c.ok).map((c) => c.name);

/**
 * Whether to send an email: when something is wrong now that was not wrong at the
 * last look, or the set of things wrong has changed. The same fault is not repeated
 * every morning.
 */
export function shouldAlert(prev: HealthReport | null, next: HealthReport): boolean {
	const now = problemsOf(next);
	if (now.length === 0) return false;
	const before = new Set(prev ? problemsOf(prev) : []);
	return now.some((p) => !before.has(p));
}

/** Whether the last look is old enough for another. */
export function isDue(lastAt: string | null, now: Date, hours = 20): boolean {
	if (!lastAt) return true;
	const t = Date.parse(lastAt);
	return Number.isNaN(t) || now.getTime() - t >= hours * 3_600_000;
}

export function alertMessage(report: HealthReport): { subject: string; text: string } {
	const bad = report.checks.filter((c) => !c.ok);
	return {
		subject: `Site health: ${bad.length} thing${bad.length === 1 ? '' : 's'} to look at`,
		text:
			`The daily check of lorenzo.loconsole.eu found ${bad.length === 1 ? 'a problem' : 'problems'} (${report.at}):\n\n` +
			bad.map((c) => `- ${c.name}: ${c.detail}`).join('\n') +
			'\n\nThis is a daily look, not live monitoring. The portal home screen shows the same list and can check again.\n'
	};
}

/** The newest `KEEP` runs, oldest first. */
export function addHistory(history: HealthEntry[], report: HealthReport): HealthEntry[] {
	const problems = problemsOf(report);
	return [...history, { at: report.at, ok: problems.length === 0, problems }].slice(-KEEP);
}

/** Certificates close enough to expiry to mention but not yet a fault. */
export function certNotices(report: HealthReport): Check[] {
	return report.checks.filter((c) => c.kind === 'certificate' && c.ok && typeof c.daysLeft === 'number' && c.daysLeft <= CERT_NOTICE_DAYS);
}
