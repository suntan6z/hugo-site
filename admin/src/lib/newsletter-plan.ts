/**
 * What a newsletter send is made of, per language.
 *
 * A send is one email to each list that is switched on: its own language when
 * the article has a version in it, or else, if the author asks, the English one.
 * A list the article has no version for is simply not written to by default.
 * This is the whole of that logic, so the page only draws it and the server
 * only re-checks it.
 *
 * Pure, and outside lib/server because the newsletter page runs it as you type.
 */
import type { NewsletterLang } from './newsletter-email.ts';

export interface Translation {
	exists: boolean;
	title: string;
	description: string;
}

export interface ArticleLangs {
	translations: Record<NewsletterLang, Translation>;
	urls: Record<NewsletterLang, string>;
	imageUrl: string | null;
}

export interface ListInfo {
	lang: NewsletterLang;
	subscribers: number;
}

/** The words of one email, as the author may edit them. */
export interface Fields {
	subject: string;
	title: string;
	intro: string;
	note: string;
}

/** What the author decided about one list. */
export interface Choice {
	/** Write to this list at all. */
	on: boolean;
	/** The article has no version in its language: send it the English one instead. */
	english: boolean;
}

export interface Planned extends Fields {
	list: NewsletterLang;
	lang: NewsletterLang;
}

const LANGS: NewsletterLang[] = ['en', 'fr', 'it'];

/** Every language starts from the article's own words in that language; English always has some. */
export function initialFields(a: ArticleLangs): Record<NewsletterLang, Fields> {
	return Object.fromEntries(
		LANGS.map((l) => {
			const t = a.translations[l];
			return [l, { subject: t.title, title: t.title, intro: t.description, note: '' }];
		})
	) as Record<NewsletterLang, Fields>;
}

/** A list is on if the article exists in its language and anybody is on it; the English version is never assumed. */
export function initialChoices(a: ArticleLangs, lists: ListInfo[]): Record<NewsletterLang, Choice> {
	return Object.fromEntries(
		LANGS.map((l) => {
			const info = lists.find((x) => x.lang === l);
			return [l, { on: !!info && info.subscribers > 0 && (l === 'en' || a.translations[l].exists), english: false }];
		})
	) as Record<NewsletterLang, Choice>;
}

/** The language the email to this list is written in, or null when there is nothing to send it. */
export function contentLangFor(list: NewsletterLang, a: ArticleLangs, c: Choice): NewsletterLang | null {
	if (list === 'en' || a.translations[list].exists) return list;
	return c.english ? 'en' : null;
}

/** Why a list is not written to, for the page to say; null when it is. */
export function skipReason(list: NewsletterLang, a: ArticleLangs, c: Choice, subscribers: number): string | null {
	if (subscribers === 0) return 'Nobody is on this list yet.';
	if (!c.on) return 'Switched off.';
	if (contentLangFor(list, a, c) === null) return 'There is no version of the article in this language.';
	return null;
}

/** The emails to send: one per list that is on and has something to say. */
export function planSend(a: ArticleLangs, lists: ListInfo[], fields: Record<NewsletterLang, Fields>, choices: Record<NewsletterLang, Choice>): Planned[] {
	const out: Planned[] = [];
	for (const info of lists) {
		const c = choices[info.lang];
		if (skipReason(info.lang, a, c, info.subscribers) !== null) continue;
		const lang = contentLangFor(info.lang, a, c)!;
		out.push({ list: info.lang, lang, ...fields[lang] });
	}
	return out;
}

/** How many people the plan reaches. */
export const reach = (plan: Planned[], lists: ListInfo[]): number =>
	plan.reduce((n, p) => n + (lists.find((l) => l.lang === p.list)?.subscribers ?? 0), 0);

/** The lists that will be skipped although the author may expect them: a translation is missing and English was not chosen. */
export function missingTranslations(a: ArticleLangs, lists: ListInfo[], choices: Record<NewsletterLang, Choice>): NewsletterLang[] {
	return lists.filter((l) => l.lang !== 'en' && l.subscribers > 0 && !a.translations[l.lang].exists && !choices[l.lang].english).map((l) => l.lang);
}
