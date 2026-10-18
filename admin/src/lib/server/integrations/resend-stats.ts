/**
 * What happened to a broadcast, worked out from Resend's per-recipient lists.
 *
 * `GET /broadcasts/{id}/recipients?type=…` lists the people for whom one thing
 * happened (delivered, bounced, opened, …), so a count is the length of a list.
 * Opens and clicks only exist when tracking is switched on for the sending domain;
 * the site's privacy policy says it is not, so they are shown only when they are
 * there, never promised.
 *
 * Free of I/O so the suite can drive it directly.
 */

/**
 * Resend writes a contact's date as `2026-10-06 23:47:56.678+00` (a space, and an
 * offset with no minutes), which a browser cannot read: it shows "Invalid Date".
 * Returns the same instant as ISO 8601, or '' for anything unreadable.
 */
export function isoDate(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(raw.trim());
	if (!m) return '';
	let zone = m[4] ?? 'Z';
	if (/^[+-]\d{2}$/.test(zone)) zone += ':00';
	else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
	const iso = `${m[1]}T${m[2]}${m[3] ? m[3].slice(0, 4) : ''}${zone}`;
	return Number.isNaN(Date.parse(iso)) ? '' : iso;
}

export const STAT_TYPES = ['delivered', 'bounced', 'complained', 'unsubscribed', 'opened', 'clicked'] as const;
export type StatType = (typeof STAT_TYPES)[number];

export interface RecipientRow {
	id?: string;
	email?: string;
	/** Times the event happened (opens, clicks). */
	count?: number;
	bounce_type?: string | null;
	clicked_links?: { url?: string; clicks?: number }[];
}

export interface LinkStat {
	url: string;
	/** Clicks in all. */
	clicks: number;
	/** Different people who clicked it. */
	people: number;
}

export interface BroadcastStats {
	/** Who the broadcast went to when it was sent. */
	sentTo: number;
	delivered: number;
	bounced: number;
	/** Of the bounces, the ones that will never work (a mistyped or closed address). */
	hardBounced: number;
	complained: number;
	unsubscribed: number;
	opened: number;
	clicked: number;
	/** Whole percent of `sentTo`, or null when `sentTo` is not known. */
	deliveredPct: number | null;
	/** True when Resend recorded any open or click: tracking is on for the domain. */
	tracked: boolean;
	links: LinkStat[];
}

const pct = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 100) : null);

/** Clicked links, added up across everyone who clicked, most-clicked first. */
export function linkStats(rows: RecipientRow[]): LinkStat[] {
	const by = new Map<string, LinkStat>();
	for (const r of rows) {
		for (const l of r.clicked_links ?? []) {
			if (typeof l?.url !== 'string' || l.url === '') continue;
			const clicks = typeof l.clicks === 'number' && l.clicks > 0 ? l.clicks : 1;
			const s = by.get(l.url) ?? { url: l.url, clicks: 0, people: 0 };
			s.clicks += clicks;
			s.people += 1;
			by.set(l.url, s);
		}
	}
	return [...by.values()].sort((a, b) => b.clicks - a.clicks || b.people - a.people);
}

/** The lists Resend returned, one per event, as the figures the page shows. */
export function summarise(lists: Record<StatType, RecipientRow[]>, sentTo: number): BroadcastStats {
	const delivered = lists.delivered.length;
	const opened = lists.opened.length;
	const clicked = lists.clicked.length;
	return {
		sentTo,
		delivered,
		bounced: lists.bounced.length,
		hardBounced: lists.bounced.filter((r) => r.bounce_type === 'permanent').length,
		complained: lists.complained.length,
		unsubscribed: lists.unsubscribed.length,
		opened,
		clicked,
		deliveredPct: pct(delivered, sentTo),
		tracked: opened > 0 || clicked > 0,
		links: linkStats(lists.clicked)
	};
}
