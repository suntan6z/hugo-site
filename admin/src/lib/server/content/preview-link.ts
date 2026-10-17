import { renderMarkdown, buildPreviewDoc } from '../../preview/render.ts';
import { LANGS, type Lang } from '../langs.ts';

/**
 * A draft shown to someone without an account: what the shared page says, and
 * for how long the link works. Pure; previews.ts keeps the links and the route
 * serves the page.
 *
 * What a link shows is the article as the author left it: the autosave if there
 * is one (it exists exactly while there is work not yet saved for real, and is
 * dropped by the save), otherwise what is committed.
 */

export const PREVIEW_DAYS = 7;
const DAY_MS = 86_400_000;

/** 24 random bytes, base64url: 32 characters, nothing a person could guess. */
export const isToken = (s: string): boolean => /^[A-Za-z0-9_-]{32}$/.test(s);

export interface PreviewLink {
	token: string;
	slug: string;
	createdAt: string;
	expiresAt: string;
}

export const expiryFrom = (now = new Date()): string => new Date(now.getTime() + PREVIEW_DAYS * DAY_MS).toISOString();
export const isLive = (l: PreviewLink, now = new Date()): boolean => Date.parse(l.expiresAt) > now.getTime();

export interface ArticleLike {
	date: string;
	category: string;
	translations: Record<Lang, { title: string; body: string; exists?: boolean; untranslated?: boolean }>;
}

export interface Shown {
	lang: Lang;
	title: string;
	date: string;
	category: string;
	body: string;
	/** Languages with something to read, in the site's order. */
	available: Lang[];
	source: 'autosave' | 'saved';
	savedAt: string | null;
}

/** An autosaved snapshot, if that is what it is: it came from a browser, so it is checked. */
function snapshotOf(x: unknown): ArticleLike | null {
	if (!x || typeof x !== 'object') return null;
	const o = x as Record<string, unknown>;
	const t = o.translations as Record<string, Record<string, unknown>> | undefined;
	if (typeof o.date !== 'string' || !t || typeof t !== 'object') return null;
	const translations = {} as ArticleLike['translations'];
	for (const l of LANGS) {
		const e = t[l];
		translations[l] = {
			title: typeof e?.title === 'string' ? e.title : '',
			body: typeof e?.body === 'string' ? e.body : '',
			untranslated: e?.untranslated === true
		};
	}
	return { date: o.date, category: typeof o.category === 'string' ? o.category : '', translations };
}

/** What to show for `lang`, falling back to English when that language has nothing yet. */
export function contentFor(saved: ArticleLike, draft: { savedAt: string; post: unknown } | null, lang: string): Shown {
	const snap = draft ? snapshotOf(draft.post) : null;
	const a = snap ?? saved;
	const has = (l: Lang) => {
		const t = a.translations[l];
		return !!t && !t.untranslated && (t.exists ?? true) && t.body.trim() !== '';
	};
	const available = LANGS.filter(has);
	const want = (LANGS as readonly string[]).includes(lang) ? (lang as Lang) : 'en';
	const shown = has(want) ? want : 'en';
	const t = a.translations[shown];
	return {
		lang: shown,
		title: t.title,
		date: a.date,
		category: a.category,
		body: t.body,
		available,
		source: snap ? 'autosave' : 'saved',
		savedAt: snap && draft ? draft.savedAt : null
	};
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'Français', it: 'Italiano' };

/** The whole page a visitor to a shared link receives. */
export function previewPage(opts: {
	shown: Shown;
	link: PreviewLink;
	siteCss: string;
	siteUrl: string;
	/** `/preview/<token>`: where this link lives, for the language switch and the images. */
	base: string;
}): string {
	const { shown, link, base } = opts;
	const until = new Date(link.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const langs = shown.available.length > 1
		? `<nav class="pvb-langs" aria-label="Language">${shown.available
				.map((l) => (l === shown.lang ? `<b>${LANG_NAME[l]}</b>` : `<a href="${esc(base)}?lang=${l}">${LANG_NAME[l]}</a>`))
				.join('')}</nav>`
		: '';
	const banner = `<div class="pvb"><span><b>Draft</b> — not published. Anyone with this link can read it until ${esc(until)}.</span>${langs}</div>
<style>
  .pvb { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; align-items: center; justify-content: space-between; padding: .55rem 1rem; background: hsl(42 100% 90%); color: hsl(35 60% 20%); border-bottom: 1px solid hsl(40 70% 68%); font: 600 .82rem/1.4 system-ui, sans-serif; }
  .pvb-langs { display: flex; gap: .8rem; }
  .pvb a { color: inherit; } .pvb b { font-weight: 800; }
</style>`;
	return buildPreviewDoc({
		html: renderMarkdown(shown.body, { slug: link.slug, siteUrl: opts.siteUrl, imageBase: `${base}/img/` }),
		title: shown.title,
		date: shown.date,
		category: shown.category,
		siteCss: opts.siteCss,
		theme: 'light',
		lang: shown.lang,
		head: '<meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" />',
		banner
	});
}
