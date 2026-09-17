/**
 * Links to other websites, and whether they still lead anywhere.
 *
 * A site that links out slowly accumulates dead ends as the sites it points at
 * move or close. Checking them is easy; judging them is where care is needed:
 * plenty of sites refuse automated requests (403), rate-limit them (429) or
 * time out once, and none of that means the page is gone. So only an answer
 * that really says "gone" — 404, 410, or a domain that no longer exists —
 * counts, and only once it has said so on two checks at least a day apart.
 *
 * Free of I/O so the suite can drive it directly.
 */

export type LinkStatus = 'ok' | 'broken' | 'unsure';

export interface LinkRecord {
	url: string;
	status: LinkStatus;
	code: number | null;
	/** In words, for the card that asks you to fix it. */
	reason: string;
	checkedAt: string;
	/** Consecutive checks that found it gone. */
	failures: number;
	/** When it was first found gone, in this unbroken run of failures. */
	brokenSince?: string;
}

const BRACKETED = /\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/gi;
const AUTOLINK = /<(https?:\/\/[^\s>]+)>/gi;
const HREF = /\shref\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

/** Every distinct http(s) link in Markdown or HTML, in order of first appearance. */
export function externalLinks(text: string): string[] {
	const found: { at: number; url: string }[] = [];
	for (const re of [BRACKETED, AUTOLINK, HREF]) {
		for (const m of text.matchAll(re)) found.push({ at: m.index ?? 0, url: m[1] });
	}
	return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.url))];
}

/** What one check's answer means. `error` is the network error code when there was no answer. */
export function classify(code: number | null, error?: string): { status: LinkStatus; reason: string } {
	if (code !== null) {
		if (code >= 200 && code < 400) return { status: 'ok', reason: `HTTP ${code}` };
		if (code === 404) return { status: 'broken', reason: 'the page is not there any more (404)' };
		if (code === 410) return { status: 'broken', reason: 'the page has been removed (410)' };
		return { status: 'unsure', reason: `the site answered HTTP ${code}, which does not say whether the page exists` };
	}
	if (error === 'ENOTFOUND') return { status: 'broken', reason: 'the website’s address no longer exists' };
	return { status: 'unsure', reason: error === 'TimeoutError' ? 'the site did not answer in time' : 'the site could not be reached' };
}

export function nextRecord(
	prev: LinkRecord | undefined,
	url: string,
	result: { status: LinkStatus; code: number | null; reason: string },
	now: Date
): LinkRecord {
	const broken = result.status === 'broken';
	// "Unsure" neither confirms nor clears a failure: a site that is down today
	// and 404 again tomorrow is still the same dead link.
	const carry = result.status === 'unsure' && prev?.status === 'broken';
	return {
		url,
		status: carry ? 'broken' : result.status,
		code: result.code,
		reason: carry ? prev!.reason : result.reason,
		checkedAt: now.toISOString(),
		failures: broken ? (prev?.status === 'broken' ? prev.failures + 1 : 1) : carry ? prev!.failures : 0,
		brokenSince: broken || carry ? (prev?.brokenSince ?? now.toISOString()) : undefined
	};
}

const CONFIRM_AFTER_MS = 20 * 3600_000;

/** Gone on two checks, a day apart: worth asking about. */
export const isDead = (r: LinkRecord, now: Date) =>
	r.status === 'broken' &&
	r.failures >= 2 &&
	!!r.brokenSince &&
	now.getTime() - Date.parse(r.brokenSince) >= CONFIRM_AFTER_MS;

export const CHECK_EVERY_DAYS = 7;

export const isDue = (lastRun: string | null, now: Date, days = CHECK_EVERY_DAYS) =>
	!lastRun || now.getTime() - Date.parse(lastRun) >= days * 86_400_000 - 3600_000;
