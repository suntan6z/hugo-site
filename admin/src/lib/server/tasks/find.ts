import { DESCRIPTION_MIN, DESCRIPTION_MAX } from '../seo/rules.ts';
import { LANGS, type Lang } from '../langs.ts';
import { externalLinks } from '../seo/links.ts';

/**
 * The "things worth doing" list behind the home screen and focus mode.
 *
 * Each task is one small, finishable edit with a single field to fill — not a
 * report. That is the whole point: a list of problems gets ignored, a queue of
 * one-field questions gets finished. Anything that cannot be answered in one
 * card (a broken link, a future date) stays in the pre-publish checks instead.
 *
 * Tasks carry a stable `id` derived from what they point at, so skipping one
 * keeps it skipped across sessions and finishing it makes it disappear on its
 * own — no task state to keep in sync with reality.
 *
 * Pure: the caller supplies the corpus, the snooze list and the clock.
 */

export type TaskKind = 'alt-text' | 'gallery-alt' | 'translation' | 'description' | 'now-check' | 'dead-link';

export interface Task {
	id: string;
	kind: TaskKind;
	/** One line, in the second person: what to do. */
	title: string;
	/** Where it applies, in the reader's terms. */
	where: string;
	slug?: string;
	lang?: Lang;
	image?: string;
	city?: string;
	file?: string;
	current?: string;
	/** A standalone page, by name, for a task that is not about an article. */
	page?: string;
	/** A dead link: the address, why it is judged dead, and the front-matter field if it lives in one. */
	url?: string;
	reason?: string;
	field?: 'partner_url' | 'project_url';
	/** Ordering hint: lower is more worth doing. */
	weight: number;
}

export interface CorpusPost {
	slug: string;
	title: string;
	draft: boolean;
	date: string;
	translations: Record<Lang, { exists: boolean; title: string; description: string; body: string; untranslated: boolean }>;
	/** Outside links kept in front matter rather than in the text. */
	links?: { partner_url?: string; project_url?: string };
}

export interface CorpusPage {
	name: string;
	label: string;
	translations: Record<Lang, { exists: boolean; body: string }>;
}

export interface CorpusPhoto {
	city: string;
	cityName: string;
	file: string;
	alt: string;
}

export interface Corpus {
	posts: CorpusPost[];
	photos: CorpusPhoto[];
	/** When content/now.md was last changed, ISO date, or null if unknown. */
	nowUpdated: string | null;
	/** The standalone pages, for the links in them. */
	pages?: CorpusPage[];
	/** Outside links the link checker has judged dead. */
	deadLinks?: { url: string; reason: string }[];
}

/** Images in a body that carry no alt text at all. */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const NOW_STALE_DAYS = 120;
const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'French', it: 'Italian' };

export function findTasks(corpus: Corpus, snoozed: Record<string, string> = {}, now = new Date()): Task[] {
	const out: Task[] = [];

	for (const post of corpus.posts) {
		for (const lang of LANGS) {
			const t = post.translations[lang];
			if (!t.exists || t.untranslated) continue;

			for (const m of t.body.matchAll(IMAGE_RE)) {
				if (m[1].trim() !== '') continue;
				// External images are not ours to describe, but they still render.
				out.push({
					id: `alt-text:${post.slug}:${lang}:${m[2]}`,
					kind: 'alt-text',
					title: 'Describe this image',
					where: `${post.title} · ${LANG_NAME[lang]}`,
					slug: post.slug,
					lang,
					image: m[2],
					weight: 10
				});
			}

			const d = t.description.trim();
			if (d === '' || d.length < DESCRIPTION_MIN || d.length > DESCRIPTION_MAX) {
				out.push({
					id: `description:${post.slug}:${lang}`,
					kind: 'description',
					title: d === '' ? 'Write a description' : 'Tighten this description',
					where: `${post.title} · ${LANG_NAME[lang]}`,
					slug: post.slug,
					lang,
					current: t.description,
					weight: d === '' ? 20 : 40
				});
			}
		}

		// A draft has not been promised to anyone yet; leave its translations alone.
		if (!post.draft) {
			for (const lang of LANGS) {
				if (lang === 'en') continue;
				const t = post.translations[lang];
				if (t.exists && !t.untranslated) continue;
				out.push({
					id: `translation:${post.slug}:${lang}`,
					kind: 'translation',
					title: `Translate into ${LANG_NAME[lang]}`,
					where: post.title,
					slug: post.slug,
					lang,
					weight: 50
				});
			}
		}
	}

	// A dead link is one task per place it appears, so fixing one article does not hide another.
	const dead = new Map((corpus.deadLinks ?? []).map((d) => [d.url, d.reason]));
	if (dead.size > 0) {
		const deadIn = (text: string) => externalLinks(text).filter((u) => dead.has(u));
		const task = (id: string, where: string, url: string, extra: Partial<Task>): Task => ({
			id: `dead-link:${id}:${url}`,
			kind: 'dead-link',
			title: 'Fix a link that no longer works',
			where,
			url,
			reason: dead.get(url),
			weight: 25,
			...extra
		});
		for (const post of corpus.posts) {
			for (const lang of LANGS) {
				const t = post.translations[lang];
				if (!t.exists || t.untranslated) continue;
				for (const url of deadIn(t.body)) {
					out.push(task(`post:${post.slug}:${lang}`, `${post.title} · ${LANG_NAME[lang]}`, url, { slug: post.slug, lang }));
				}
			}
			for (const field of ['partner_url', 'project_url'] as const) {
				const url = post.links?.[field];
				if (url && dead.has(url)) {
					const label = field === 'partner_url' ? 'partner’s website' : 'project page';
					out.push(task(`post:${post.slug}:${field}`, `${post.title} · ${label}`, url, { slug: post.slug, field }));
				}
			}
		}
		for (const page of corpus.pages ?? []) {
			for (const lang of LANGS) {
				const t = page.translations[lang];
				if (!t.exists) continue;
				for (const url of deadIn(t.body)) {
					out.push(task(`page:${page.name}:${lang}`, `${page.label} page · ${LANG_NAME[lang]}`, url, { page: page.name, lang }));
				}
			}
		}
	}

	for (const photo of corpus.photos) {
		if (photo.alt.trim() !== '') continue;
		out.push({
			id: `gallery-alt:${photo.city}:${photo.file}`,
			kind: 'gallery-alt',
			title: 'Describe this photo',
			where: photo.cityName,
			city: photo.city,
			file: photo.file,
			weight: 15
		});
	}

	if (corpus.nowUpdated) {
		const days = Math.floor((now.getTime() - Date.parse(corpus.nowUpdated)) / 86_400_000);
		if (days >= NOW_STALE_DAYS) {
			out.push({
				id: `now-check:${corpus.nowUpdated}`,
				kind: 'now-check',
				title: 'Is your Now page still true?',
				where: `Last changed ${days} days ago`,
				current: corpus.nowUpdated,
				weight: 60
			});
		}
	}

	const live = out.filter((t) => {
		const until = snoozed[t.id];
		return !until || Date.parse(until) <= now.getTime();
	});
	// Cheapest and most valuable first, then stable by id so the queue does not
	// reshuffle under you between visits.
	return live.sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
}

/** How long a skipped task stays out of the way. */
export const SNOOZE_DAYS: Record<TaskKind, number> = {
	'alt-text': 30,
	'gallery-alt': 30,
	translation: 30,
	description: 60,
	'now-check': 90,
	'dead-link': 30
};

export const snoozeUntil = (kind: TaskKind, now = new Date()) =>
	new Date(now.getTime() + SNOOZE_DAYS[kind] * 86_400_000).toISOString();
