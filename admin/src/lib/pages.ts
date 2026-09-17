/**
 * The site's standalone pages — About, Now, Contact, Privacy policy — as the
 * portal edits them.
 *
 * Unlike articles these are hand-built HTML (goldmark passes it through), with
 * the site's own classes and, on Contact, the form static/js/main.js drives.
 * So they are edited as source with a live preview, never through the visual
 * Markdown editor, and saving checks the two things raw HTML most easily
 * breaks: an element left unclosed, and an id the form script looks for.
 *
 * Pure, and outside lib/server because the editor runs the checks and the
 * "last updated" stamp in the browser as you type.
 */

export const LANGS = ['en', 'fr', 'it'] as const;
export type Lang = (typeof LANGS)[number];

export const PAGES = [
	{ name: 'about', label: 'About', blurb: 'Who you are, and the timeline beside it' },
	{ name: 'now', label: 'Now', blurb: 'What you are working on, reading and using' },
	{ name: 'contact', label: 'Contact', blurb: 'The words around the contact form' },
	{ name: 'privacy-policy', label: 'Privacy policy', blurb: 'What the site collects, and why' }
] as const;

export type PageName = (typeof PAGES)[number]['name'];

export const isPageName = (s: string): s is PageName => PAGES.some((p) => p.name === s);
export const pageLabel = (name: PageName) => PAGES.find((p) => p.name === name)!.label;

/** English keeps the plain name, as for every translated file on the site. */
export const pageFile = (name: PageName, lang: Lang) =>
	lang === 'en' ? `content/${name}.md` : `content/${name}.${lang}.md`;

/** Same thresholds as the articles' pre-publish checks (seo/rules.ts). */
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;

/**
 * Elements static/js/main.js reaches for by id on the contact page. Without
 * one, sending throws before the message leaves — which is exactly how the
 * French and Italian forms broke when the honeypot was added in English only.
 */
export const CONTACT_IDS = [
	'contact-form', 'contact-website', 'firstName', 'firstName-error', 'lastName', 'lastName-error',
	'email', 'email-error', 'phone', 'phone-country', 'subject', 'subject-error', 'custom-subject-wrap',
	'message', 'message-error', 'char-count', 'submit-btn', 'form-title', 'form-note', 'form-success'
];

export interface PageFinding {
	severity: 'error' | 'warning';
	message: string;
}

// Elements that never have a closing tag, and two that HTML lets you leave open.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const OPTIONAL_CLOSE = new Set(['p', 'li', 'option']);

/**
 * The first element that is opened and never closed, or closed without being
 * open. Not a validator — a browser forgives far more — but an unclosed <div>
 * in hand-written HTML silently swallows the footer, and this catches that.
 */
export function unbalanced(html: string): string | null {
	// Comments, scripts and styles can hold anything; blank them but keep line breaks.
	const blank = (m: string) => m.replace(/[^\n]/g, ' ');
	const src = html.replace(/<!--[\s\S]*?-->/g, blank).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, blank);
	const lineAt = (i: number) => src.slice(0, i).split('\n').length;
	const stack: { tag: string; line: number }[] = [];

	for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
		const [, closing, name, selfClosing] = m;
		const tag = name.toLowerCase();
		if (VOID.has(tag)) continue;
		const line = lineAt(m.index ?? 0);
		if (!closing) {
			if (!selfClosing) stack.push({ tag, line });
			continue;
		}
		const at = stack.map((s) => s.tag).lastIndexOf(tag);
		if (at === -1) return `A </${tag}> on line ${line} closes nothing that is open.`;
		const skipped = stack.slice(at + 1).find((s) => !OPTIONAL_CLOSE.has(s.tag));
		if (skipped) return `The <${skipped.tag}> on line ${skipped.line} is not closed before </${tag}> on line ${line}.`;
		stack.length = at;
	}
	const left = stack.find((s) => !OPTIONAL_CLOSE.has(s.tag));
	return left ? `The <${left.tag}> on line ${left.line} is never closed.` : null;
}

const idsIn = (html: string) => new Set([...html.matchAll(/\sid\s*=\s*["']?([^"'\s>]+)/g)].map((m) => m[1]));

/**
 * What stands between this version and saving it. `before` is the committed
 * body, so an id that was already missing is a warning to fix, while removing
 * one that works today is refused.
 */
export function checkPage(
	name: PageName,
	t: { title: string; description: string; body: string },
	before: string | null = null
): PageFinding[] {
	const out: PageFinding[] = [];
	if (!t.title.trim()) out.push({ severity: 'error', message: 'The title is empty.' });
	if (!t.body.trim()) out.push({ severity: 'error', message: 'The page is empty.' });

	const d = t.description.trim().length;
	if (d === 0) out.push({ severity: 'warning', message: 'No description: search results will make one up.' });
	else if (d < DESCRIPTION_MIN || d > DESCRIPTION_MAX) {
		out.push({ severity: 'warning', message: `The description is ${d} characters; ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} reads best in search results.` });
	}

	const shape = unbalanced(t.body);
	if (shape) out.push({ severity: 'warning', message: `${shape} The layout below it may break.` });

	if (name === 'contact') {
		const now = idsIn(t.body);
		const was = before === null ? null : idsIn(before);
		const gone = CONTACT_IDS.filter((id) => !now.has(id));
		const removed = gone.filter((id) => was?.has(id));
		const absent = gone.filter((id) => !was?.has(id));
		if (removed.length) {
			out.push({
				severity: 'error',
				message: `The contact form stops working without id="${removed.join('", id="')}". Put ${removed.length === 1 ? 'it' : 'them'} back.`
			});
		}
		if (absent.length) {
			out.push({ severity: 'warning', message: `The contact form is missing id="${absent.join('", id="')}", so sending it may fail.` });
		}
	}
	return out;
}

/* -------------------------------------------------------- "last updated" */

type Stamp = { re: RegExp; format: (d: Date) => string };

const month = (lang: string, d: Date) => new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(d);
const monthYear = (lang: string) => (d: Date) => `${month(lang, d)} ${d.getUTCFullYear()}`;
const dayMonthYear = (lang: string) => (d: Date) => `${d.getUTCDate()} ${month(lang, d)} ${d.getUTCFullYear()}`;

/** How each page says when it last changed, in the words each language already uses. */
const STAMPS: Partial<Record<PageName, Record<Lang, Stamp>>> = {
	now: {
		en: { re: /(Last updated )(\p{L}+ \d{4})/u, format: monthYear('en') },
		fr: { re: /(Mis à jour en )(\p{L}+ \d{4})/u, format: monthYear('fr') },
		it: { re: /(Aggiornato a )(\p{L}+ \d{4})/u, format: monthYear('it') }
	},
	'privacy-policy': {
		en: { re: /(Last updated: )(\p{L}+ \d{1,2}, \d{4})/u, format: (d) => `${month('en', d)} ${d.getUTCDate()}, ${d.getUTCFullYear()}` },
		fr: { re: /(Dernière mise à jour : )(\d{1,2} \p{L}+ \d{4})/u, format: dayMonthYear('fr') },
		it: { re: /(Ultimo aggiornamento: )(\d{1,2} \p{L}+ \d{4})/u, format: dayMonthYear('it') }
	}
};

/** The date the page shows, or null if this page has no "last updated" line. */
export function stampOf(name: PageName, lang: Lang, body: string): string | null {
	const s = STAMPS[name]?.[lang];
	return s ? (body.match(s.re)?.[2] ?? null) : null;
}

/** The body with its "last updated" line set to `date`, or null if it has none. */
export function restamp(name: PageName, lang: Lang, body: string, date: Date): string | null {
	const s = STAMPS[name]?.[lang];
	if (!s || !s.re.test(body)) return null;
	return body.replace(s.re, (_m, lead: string) => `${lead}${s.format(date)}`);
}
