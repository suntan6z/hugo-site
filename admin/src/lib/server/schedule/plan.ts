/**
 * Publishing later, and announcing it once it is actually live.
 *
 * Two steps, deliberately separate. Flipping an article to published is a
 * commit; the newsletter can only go out after StaticHost has rebuilt, or the
 * link in it 404s for every subscriber. So a scheduled item publishes when its
 * time comes, and is announced on a later pass, once the live site shows it.
 *
 * Pure: the caller supplies the list and the clock.
 */

export type ScheduleState = 'pending' | 'published' | 'announced' | 'failed';

export interface Scheduled {
	slug: string;
	/** When to publish, ISO. */
	at: string;
	/** Send the newsletter once the article is live. */
	newsletter: boolean;
	state: ScheduleState;
	createdAt: string;
	publishedAt?: string;
	announcedAt?: string;
	sha?: string;
	error?: string;
	/** Attempts made to publish or announce, so a broken item cannot spin forever. */
	tries?: number;
}

export const MAX_TRIES = 5;
const YEAR_MS = 365 * 86_400_000;

/**
 * Articles go live at one moment only: 9:00 in Paris, on a day after today.
 * The Scaleway trigger runs once a morning to match (and once more half an
 * hour later for the newsletter), because every call keeps the container
 * awake, and billed, for a quarter of an hour.
 */
export const PUBLISH_HOUR = 9;
export const PUBLISH_TZ = 'Europe/Paris';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day it is in Paris at `now`, as YYYY-MM-DD. */
export const todayIn = (now = new Date(), tz = PUBLISH_TZ): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Minutes `tz` is ahead of UTC at the instant `ms`. */
function offsetAt(ms: number, tz: string): number {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		})
			.formatToParts(new Date(ms))
			.map((x) => [x.type, x.value])
	);
	return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms) / 60_000;
}

/**
 * 9:00 in Paris on `day` (YYYY-MM-DD), as an ISO instant, or null if `day` is
 * not a real date. Daylight saving changes at 2–3 a.m., so 9:00 is never
 * ambiguous; the offset is read at 9:00 UTC that day, which is the same one.
 */
export function morningOf(day: string): string | null {
	const m = DAY_RE.exec(day);
	if (!m) return null;
	const [y, mo, d] = [+m[1], +m[2], +m[3]];
	const wall = Date.UTC(y, mo - 1, d, PUBLISH_HOUR);
	// Date.UTC rolls 31 February over into March; a real date survives the trip.
	if (new Date(wall).getUTCDate() !== d || new Date(wall).getUTCMonth() !== mo - 1) return null;
	return new Date(wall - offsetAt(wall, PUBLISH_TZ) * 60_000).toISOString();
}

/** Why this day will not do, or null if it will. */
export function whyNotDay(day: string, now = new Date()): string | null {
	const at = morningOf(day);
	if (!at) return 'That is not a date.';
	// Same-day is refused even before 9:00: a morning you could still catch is
	// one Publish now does better.
	if (day <= todayIn(now)) return 'Pick a day after today.';
	if (Date.parse(at) > now.getTime() + YEAR_MS) return 'That is more than a year away.';
	return null;
}

export const dueToPublish = (items: Scheduled[], now = new Date()): Scheduled[] =>
	items.filter((i) => i.state === 'pending' && (i.tries ?? 0) < MAX_TRIES && Date.parse(i.at) <= now.getTime());

/**
 * Published and waiting to be announced. `liveSlugs` is what the built site
 * actually serves, so an announcement can never point at a page that is not
 * there yet.
 */
export const dueToAnnounce = (items: Scheduled[], liveSlugs: string[]): Scheduled[] =>
	items.filter(
		(i) => i.state === 'published' && i.newsletter && (i.tries ?? 0) < MAX_TRIES && liveSlugs.includes(i.slug)
	);

/** What the editor shows for an article: its own entry, if it still matters. */
export const forSlug = (items: Scheduled[], slug: string): Scheduled | null =>
	items.find((i) => i.slug === slug && (i.state === 'pending' || i.state === 'published' || i.state === 'failed')) ??
	null;

/** Keeps the list from growing forever: finished work older than a month goes. */
export function prune(items: Scheduled[], now = new Date()): Scheduled[] {
	const cutoff = now.getTime() - 30 * 86_400_000;
	return items.filter((i) => {
		if (i.state === 'pending') return true;
		const done = Date.parse(i.announcedAt ?? i.publishedAt ?? i.createdAt);
		return Number.isNaN(done) || done > cutoff;
	});
}

/** An item that no longer needs anything done to it. */
export const isSettled = (i: Scheduled): boolean =>
	i.state === 'announced' || (i.state === 'published' && !i.newsletter) || (i.tries ?? 0) >= MAX_TRIES;
