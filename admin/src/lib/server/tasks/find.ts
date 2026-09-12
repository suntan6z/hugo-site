import { DESCRIPTION_MIN, DESCRIPTION_MAX } from '../seo/rules.ts';
import { LANGS, type Lang } from '../langs.ts';

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

export type TaskKind = 'alt-text' | 'gallery-alt' | 'translation' | 'featured-image' | 'description' | 'now-check';

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
	/** Ordering hint: lower is more worth doing. */
	weight: number;
}

export interface CorpusPost {
	slug: string;
	title: string;
	draft: boolean;
	date: string;
	featured_image?: string;
	/** Bundle images that could reasonably be the article's face. */
	images: string[];
	/** The Erasmus+ partner's logo, which never can be. */
	partner_logo_url?: string;
	translations: Record<Lang, { exists: boolean; title: string; description: string; body: string; untranslated: boolean }>;
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

		// A partner logo is not a thumbnail, and an article whose only image is
		// one has nothing to choose: asking would be a question with no right answer.
		const candidates = post.images.filter((i) => i !== post.partner_logo_url);
		if (!post.featured_image && candidates.length > 0) {
			out.push({
				id: `featured-image:${post.slug}`,
				kind: 'featured-image',
				title: 'Choose the thumbnail',
				where: post.title,
				slug: post.slug,
				weight: 30
			});
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
	'featured-image': 30,
	description: 60,
	'now-check': 90
};

export const snoozeUntil = (kind: TaskKind, now = new Date()) =>
	new Date(now.getTime() + SNOOZE_DAYS[kind] * 86_400_000).toISOString();
