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

/** Why this moment will not do, or null if it will. */
export function whyNot(at: string, now = new Date()): string | null {
	const t = Date.parse(at);
	if (Number.isNaN(t)) return 'That is not a date and time.';
	// The picker's resolution is one minute and its value is the start of that
	// minute, so choosing "now" at :45 arrives 45 seconds old — plus however
	// long the press took. Two minutes of slack covers that without letting a
	// genuinely past time through.
	if (t < now.getTime() - 120_000) return 'That is in the past.';
	if (t > now.getTime() + YEAR_MS) return 'That is more than a year away.';
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
