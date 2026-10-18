/**
 * The subscriber list as a CSV a spreadsheet opens: the one thing the portal
 * holds that is in no repository, so the one worth being able to take away
 * (and to hand to someone who asks what is kept about them).
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */
export interface Row {
	email: string;
	createdAt: string;
	unsubscribed: boolean;
	/** The list they are on: en, fr or it. */
	lang?: string;
}

/**
 * One CSV cell. A cell that starts with = + - @ or a control character would be
 * read by a spreadsheet as a formula, and an address is typed by strangers on
 * the internet, so it is defused with a leading apostrophe before quoting.
 */
export function cell(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** "2026-09-01 10:00:00.000000+00" or an ISO instant, as a plain UTC date and time. */
export function when(raw: string): string {
	const t = Date.parse(raw.replace(' ', 'T').replace(/\+00$/, 'Z'));
	return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

/** Newest first, as the page lists them; CRLF line ends, as spreadsheets expect. */
export function toCsv(rows: Row[]): string {
	const lines = [['email', 'status', 'language', 'joined (UTC)'].map(cell).join(',')];
	for (const r of [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
		lines.push([r.email, r.unsubscribed ? 'unsubscribed' : 'subscribed', r.lang ?? 'en', when(r.createdAt)].map(cell).join(','));
	}
	return lines.join('\r\n') + '\r\n';
}
