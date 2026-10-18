/**
 * The Now page's content, as the portal edits it.
 *
 * Everything the page shows lives in content/now/now.json: a cover, a short
 * intro, one row per thing going on (a logo, a link, a label and a line of
 * text) and an archive of the years before. Every language sits side by side
 * in the same file, so a logo, a link or a year is set once and the three
 * versions cannot drift apart. layouts/now/single.html renders it; the
 * template's header comment and this file describe the same shape — change
 * one, change the other.
 *
 * Pure, and outside lib/server because the editor runs the checks in the
 * browser as you type.
 */
import { LANGS, type Lang } from './pages.ts';

export const NOW_DIR = 'content/now';
export const NOW_JSON = `${NOW_DIR}/now.json`;
/** The icon set, shared with the site's partial (layouts/partials/now-icon.html). */
export const NOW_ICONS = 'data/now_icons.json';

/** One piece of text in every language. Empty means "same as the English" on the site. */
export type Text = Record<Lang, string>;
export type CoverPosition = 'top' | 'center' | 'bottom';

export interface NowItem {
	/** `icon:<name>`, a site path (`/img/logo.svg`), a file in the bundle, or '' for the label's initial. */
	logo: string;
	/** Where the logo leads: an outside address, or a site path such as /contact/. Optional. */
	url: string;
	label: Text;
	text: Text;
}

export interface NowYear {
	year: string;
	text: Text;
	/** The lesson, in italics under the year. Optional. */
	note: Text;
}

export interface NowData {
	/** YYYY-MM-DD; the page shows the month and year. */
	updated: string;
	cover: { image: string; position: CoverPosition; alt: Text };
	intro: Text;
	items: NowItem[];
	archive: NowYear[];
}

export const POSITIONS: CoverPosition[] = ['top', 'center', 'bottom'];
/** Pictures the bundle may hold. SVG is for logos; the cover must be a photo the site can crop. */
export const NOW_IMAGE_RE = /\.(jpe?g|png|webp|svg)$/i;
export const COVER_RE = /\.(jpe?g|png|webp)$/i;

export const emptyText = (): Text => ({ en: '', fr: '', it: '' });
export const emptyItem = (): NowItem => ({ logo: '', url: '', label: emptyText(), text: emptyText() });
export const emptyYear = (year = ''): NowYear => ({ year, text: emptyText(), note: emptyText() });

export class NowError extends Error {}

/* ------------------------------------------------------------ the file */

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const text = (v: unknown): Text => {
	const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
	// A plain string is read as English, so a hand-edited file can start simple.
	if (typeof v === 'string') return { ...emptyText(), en: v };
	return Object.fromEntries(LANGS.map((l) => [l, str(o[l])])) as Text;
};
const list = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];

/** Reads now.json, filling in whatever is missing. A file that is not JSON at all is refused. */
export function parseNow(raw: string | null): NowData {
	let o: Record<string, unknown> = {};
	if (raw !== null && raw.trim()) {
		try {
			o = JSON.parse(raw);
		} catch {
			throw new NowError(`${NOW_JSON} is not valid JSON.`);
		}
		if (!o || typeof o !== 'object' || Array.isArray(o)) throw new NowError(`${NOW_JSON} should hold one object.`);
	}
	const cover = (o.cover && typeof o.cover === 'object' ? o.cover : {}) as Record<string, unknown>;
	const position = str(cover.position).toLowerCase();
	return {
		updated: str(o.updated),
		cover: {
			image: str(cover.image),
			position: (POSITIONS as string[]).includes(position) ? (position as CoverPosition) : 'center',
			alt: text(cover.alt)
		},
		intro: text(o.intro),
		items: list(o.items).map((i) => ({ logo: str(i.logo), url: str(i.url), label: text(i.label), text: text(i.text) })),
		archive: list(o.archive).map((y) => ({ year: str(y.year), text: text(y.text), note: text(y.note) }))
	};
}

/** parseNow for readers that only look (link check, task list): a broken file reads as empty. */
export function readNow(raw: string | null): NowData {
	try {
		return parseNow(raw);
	} catch {
		return parseNow(null);
	}
}

/**
 * The file as committed: fixed key order, two-space indent, trailing newline,
 * and text trimmed — so saving an untouched page changes nothing, and a diff
 * shows only what was edited.
 */
export function serializeNow(d: NowData): string {
	const t = (x: Text) => Object.fromEntries(LANGS.map((l) => [l, x[l].trim()]));
	const out = {
		updated: d.updated.trim(),
		cover: { image: d.cover.image.trim(), position: d.cover.position, alt: t(d.cover.alt) },
		intro: t(d.intro),
		items: d.items.map((i) => ({ logo: i.logo.trim(), url: i.url.trim(), label: t(i.label), text: t(i.text) })),
		archive: d.archive.map((y) => ({ year: y.year.trim(), text: t(y.text), note: t(y.note) }))
	};
	return `${JSON.stringify(out, null, 2)}\n`;
}

/* --------------------------------------------------------------- logos */

export type LogoKind = 'icon' | 'site' | 'file' | 'none';

export function logoKind(logo: string): LogoKind {
	if (!logo) return 'none';
	if (logo.startsWith('icon:')) return 'icon';
	if (logo.startsWith('/')) return 'site';
	return 'file';
}

/** The bundle files the page uses: the cover and every uploaded logo. */
export function usedFiles(d: NowData): string[] {
	const out = new Set<string>();
	if (d.cover.image) out.add(d.cover.image);
	for (const i of d.items) if (logoKind(i.logo) === 'file') out.add(i.logo);
	return [...out];
}

/** A file name that is safe to put in the bundle: lowercase, no path, one of the picture types. */
export const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.(jpe?g|png|webp|svg)$/;

/**
 * An SVG is served from the site's own origin, so it must not be able to run
 * anything if opened directly. Logos never need scripts, handlers or foreign
 * content; refuse rather than try to clean.
 */
export function unsafeSvg(bytes: Uint8Array): boolean {
	const s = new TextDecoder().decode(bytes).toLowerCase();
	return /<script|<foreignobject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object/.test(s);
}

/* --------------------------------------------------------------- dates */

/** Today in Paris, as YYYY-MM-DD: the day the page says it was updated. */
export const today = (now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "October 2026", "octobre 2026": what the page shows for `updated`. */
export function monthYear(iso: string, lang: Lang = 'en'): string | null {
	if (!DATE_RE.test(iso)) return null;
	const d = new Date(`${iso}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/* -------------------------------------------------------------- checks */

export interface NowFinding {
	severity: 'error' | 'warning';
	message: string;
	lang?: Lang;
}

const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'French', it: 'Italian' };
const URL_RE = /^(https?:\/\/[^\s]+|\/[^\s]*)$/;

/**
 * What stands between this version and saving it. Errors are what would
 * break the page; warnings are what a reader would notice (an untranslated
 * line shows in English, a missing logo becomes a letter).
 * `files` is what the bundle holds, uploads included.
 */
export function checkNow(d: NowData, files: string[], icons: string[] = []): NowFinding[] {
	const out: NowFinding[] = [];
	const has = new Set(files);
	const err = (message: string) => out.push({ severity: 'error', message });
	const warn = (message: string, lang?: Lang) => out.push({ severity: 'warning', message, lang });

	if (!DATE_RE.test(d.updated) || monthYear(d.updated) === null) err('The “last updated” date is not a date.');

	if (d.cover.image) {
		if (!COVER_RE.test(d.cover.image)) err('The cover must be a JPEG, PNG or WebP photo.');
		else if (!has.has(d.cover.image)) warn(`The cover picture ${d.cover.image} is not in the folder any more: upload it again or choose another.`);
		if (!d.cover.alt.en.trim()) warn('The cover has no description for people who cannot see it.');
	}

	if (d.items.length === 0) warn('There is nothing under “now”.');
	d.items.forEach((item, n) => {
		const name = item.label.en.trim() || `Row ${n + 1}`;
		if (!item.text.en.trim()) err(`${name}: the English text is empty.`);
		if (item.url && !URL_RE.test(item.url)) err(`${name}: the link should start with https:// or /.`);
		const kind = logoKind(item.logo);
		if (kind === 'file' && !has.has(item.logo)) warn(`${name}: the logo ${item.logo} is not in the folder any more.`);
		if (kind === 'icon' && icons.length && !icons.includes(item.logo.slice(5))) warn(`${name}: there is no icon called “${item.logo.slice(5)}”.`);
	});

	const years = new Set<string>();
	d.archive.forEach((y, n) => {
		const name = y.year.trim() || `Archive entry ${n + 1}`;
		if (!y.year.trim()) err(`Archive entry ${n + 1} has no year.`);
		else if (years.has(y.year.trim())) warn(`${y.year} appears twice in the archive.`);
		years.add(y.year.trim());
		if (!y.text.en.trim()) err(`${name}: the English text is empty.`);
	});

	for (const l of LANGS) {
		if (l === 'en') continue;
		const missing = untranslated(d, l);
		if (missing > 0) warn(`${missing} ${missing === 1 ? 'line is' : 'lines are'} not in ${LANG_NAME[l]} yet and will show in English.`, l);
	}
	return out;
}

/* ------------------------------------------------------- translations */

/**
 * Every text field, in a fixed order — the objects themselves, so writing to
 * one writes to the data. What machine translation fills and a dead link is
 * fixed in.
 */
export function textFields(d: NowData): Text[] {
	return [
		d.intro,
		d.cover.alt,
		...d.items.flatMap((i) => [i.label, i.text]),
		...d.archive.flatMap((y) => [y.text, y.note])
	];
}

/** How many fields have English but nothing in `lang`. */
export const untranslated = (d: NowData, lang: Lang) =>
	textFields(d).filter((t) => t.en.trim() && !t[lang].trim()).length;

/**
 * A link to this site's English pages, pointed at the same page in `lang`:
 * a machine-translated "[écrivez-moi](/en/contact/)" should go to /fr/contact/.
 */
export const localizeLinks = (s: string, lang: Lang) => s.replace(/\]\(\/en\//g, `](/${lang}/`);

/**
 * Everything one language of the page says, as one Markdown text: what the
 * link check reads. A logo's link is shared by every language and is
 * written as an autolink so it is found too.
 */
export function nowText(d: NowData, lang: Lang): string {
	const urls = d.items.map((i) => i.url).filter((u) => /^https?:\/\//.test(u)).map((u) => `<${u}>`);
	return [...textFields(d).map((t) => t[lang]), ...urls].filter((s) => s.trim()).join('\n\n');
}

/** `fix` applied to every text of one language, and to a logo link equal to `url`. */
export function fixLink(d: NowData, lang: Lang, url: string, next: string | null, fix: (s: string) => string): NowData {
	for (const t of textFields(d)) t[lang] = fix(t[lang]);
	for (const i of d.items) if (i.url === url) i.url = next ?? '';
	return d;
}
