import { LANGS, type Lang } from '../langs.ts';

/**
 * Line-preserving editor for the settings the portal exposes in hugo.toml: the
 * footer's profile links, the homepage quote and each language's description.
 *
 * Same philosophy as the front-matter and i18n editors: hugo.toml is
 * hand-maintained and commented, so a save rewrites only the quoted value on
 * the lines that change. It never adds or removes lines — a key that is not
 * already there is an error, not something to guess a place for.
 *
 * Every read and write names its table, so `description` under
 * [languages.fr.params] is never confused with a key of the same name
 * anywhere else.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

/**
 * In footer order. The keys are duplicated in layouts/partials/footer.html
 * (lowercased there, as Hugo reads them) and must exist in hugo.toml [params].
 */
export const SOCIALS = [
	{ key: 'linkedin', label: 'LinkedIn' },
	{ key: 'mastodon', label: 'Mastodon' },
	{ key: 'github', label: 'GitHub' },
	{ key: 'trakt', label: 'Trakt' },
	{ key: 'appleMusic', label: 'Apple Music' }
] as const;

export type SocialKey = (typeof SOCIALS)[number]['key'];
export type Socials = Record<SocialKey, string>;

export class SiteParamsError extends Error {}

/** `root` is what sits above the first table (the site title); `params` is the shared table; each language has its own. */
export type Table = 'root' | 'params' | `languages.${Lang}.params`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineFor = (key: string) => new RegExp(`^(\\s*${escapeRe(key)}\\s*=\\s*)"((?:[^"\\\\]|\\\\.)*)"(\\s*(?:#.*)?)$`);
const unescape = (s: string) => s.replace(/\\(["\\])/g, '$1');
/** A TOML basic string: only the quote and the backslash need escaping once newlines are ruled out. */
const escape = (s: string) => s.replace(/[\\"]/g, '\\$&');

/** The line range of one table: [first line after its header, end). */
function tableRange(lines: string[], table: Table): [number, number] {
	if (table === 'root') {
		const first = lines.findIndex((l) => l.trim().startsWith('['));
		return [0, first === -1 ? lines.length : first];
	}
	const header = lines.findIndex((l) => l.trim() === `[${table}]`);
	if (header === -1) throw new SiteParamsError(`hugo.toml has no [${table}] table`);
	let end = header + 1;
	while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
	return [header + 1, end];
}

function locate(lines: string[], table: Table, key: string): { index: number; match: RegExpExecArray } {
	const [start, end] = tableRange(lines, table);
	const re = lineFor(key);
	const found: { index: number; match: RegExpExecArray }[] = [];
	for (let i = start; i < end; i++) {
		const match = re.exec(lines[i]);
		if (match) found.push({ index: i, match });
	}
	if (found.length === 0) throw new SiteParamsError(`hugo.toml [${table}] has no ${key} = "…" line`);
	if (found.length > 1) throw new SiteParamsError(`hugo.toml [${table}] sets ${key} more than once`);
	return found[0];
}

function split(raw: string): string[] {
	if (raw.includes('\r\n')) throw new SiteParamsError('hugo.toml uses CRLF line endings');
	return raw.split('\n');
}

/** One quoted value, unescaped. */
export function readString(raw: string, table: Table, key: string): string {
	return unescape(locate(split(raw), table, key).match[2]);
}

/**
 * Rewrites quoted values in place. Returns the new file and which keys changed;
 * an unchanged file comes back byte-for-byte. A value that cannot live on one
 * TOML line is refused rather than mangled.
 */
export function writeStrings(
	raw: string,
	table: Table,
	values: Record<string, string>
): { raw: string; changed: string[] } {
	const lines = split(raw);
	const changed: string[] = [];
	for (const [key, value] of Object.entries(values)) {
		if (/[\u0000-\u001f\u007f]/.test(value)) {
			throw new SiteParamsError(`${key}: line breaks and control characters cannot be saved.`);
		}
		const { index, match } = locate(lines, table, key);
		if (unescape(match[2]) === value) continue;
		lines[index] = `${match[1]}"${escape(value)}"${match[3]}`;
		changed.push(key);
	}
	return { raw: lines.join('\n'), changed };
}

export function readSocials(raw: string): Socials {
	return Object.fromEntries(SOCIALS.map(({ key }) => [key, readString(raw, 'params', key)])) as Socials;
}

/** Why a submitted link will not do, or null. Empty is fine: it hides the icon. */
export function whyNotUrl(value: string): string | null {
	if (value === '') return null;
	// Nothing that would need escaping inside a TOML string or an href.
	if (/["\\\s]/.test(value)) return 'A link cannot contain spaces, quotes or backslashes.';
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return 'That is not a web address. It should start with https://';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'It should start with https://';
	return null;
}

/**
 * Applies the submitted links. Returns the new file and which keys changed;
 * an unchanged file comes back byte-for-byte. Throws on an invalid link, so a
 * caller that skipped validation cannot write one.
 */
export function writeSocials(raw: string, next: Partial<Socials>): { raw: string; changed: SocialKey[] } {
	const values: Record<string, string> = {};
	for (const { key } of SOCIALS) {
		const value = next[key];
		if (value === undefined) continue;
		const bad = whyNotUrl(value);
		if (bad) throw new SiteParamsError(`${key}: ${bad}`);
		values[key] = value;
	}
	const r = writeStrings(raw, 'params', values);
	return { raw: r.raw, changed: r.changed as SocialKey[] };
}

/* ------------------------------------------------------- homepage and SEO */

/**
 * What the homepage says above the fold, and what search results and link
 * previews say about the site. The quote is shared (it is Snowden's wording,
 * deliberately not translated); the description is per language.
 */
export interface SiteText {
	quote: string;
	quoteAuthor: string;
	/** The article the quote's "read the article" link opens. */
	quoteArticle: string;
	description: Record<Lang, string>;
}

export const DESCRIPTION_IDEAL: [number, number] = [120, 160];

export function readSiteText(raw: string): SiteText {
	return {
		quote: readString(raw, 'params', 'quote'),
		quoteAuthor: readString(raw, 'params', 'quoteAuthor'),
		quoteArticle: readString(raw, 'params', 'quoteArticle'),
		description: Object.fromEntries(
			LANGS.map((l) => [l, readString(raw, `languages.${l}.params`, 'description')])
		) as Record<Lang, string>
	};
}

/** Folds what a <textarea> sends into one line: TOML strings here are single-line. */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Why this cannot be saved, or null. `articles` are the slugs that exist. */
export function whyNotSiteText(t: SiteText, articles: string[]): string | null {
	if (!t.quote) return 'The quote cannot be empty — the homepage has a place for it.';
	if (t.quote.length > 600) return `The quote is ${t.quote.length} characters; keep it under 600 so it fits the homepage.`;
	if (!t.quoteAuthor) return 'Say who the quote is by.';
	if (t.quoteAuthor.length > 100) return 'The author’s name is too long.';
	if (!articles.includes(t.quoteArticle)) return 'Pick the article the quote links to.';
	for (const l of LANGS) {
		const d = t.description[l];
		if (!d) return `The ${l.toUpperCase()} description cannot be empty: it is what search results show.`;
		if (d.length > 300) return `The ${l.toUpperCase()} description is ${d.length} characters; search results cut it at about 160.`;
	}
	return null;
}

export function writeSiteText(raw: string, next: SiteText): { raw: string; changed: string[] } {
	let out = writeStrings(raw, 'params', {
		quote: next.quote,
		quoteAuthor: next.quoteAuthor,
		quoteArticle: next.quoteArticle
	});
	const changed = [...out.changed];
	for (const l of LANGS) {
		out = writeStrings(out.raw, `languages.${l}.params`, { description: next.description[l] });
		changed.push(...out.changed.map((k) => `${k} (${l})`));
	}
	return { raw: out.raw, changed };
}

/* ------------------------------------------------------ title and navigation */

export const TITLE_MAX = 60;
export const MENU_LABEL_MAX = 24;

export const readTitle = (raw: string) => readString(raw, 'root', 'title');

export function whyNotTitle(title: string): string | null {
	if (!title) return 'The site needs a name: it is in every page title and the footer.';
	if (title.length > TITLE_MAX) return `The name is ${title.length} characters; search results cut a page title at about 60, and this goes in it.`;
	return null;
}

export function writeTitle(raw: string, title: string): { raw: string; changed: boolean } {
	const r = writeStrings(raw, 'root', { title });
	return { raw: r.raw, changed: r.changed.length > 0 };
}

/**
 * The navigation, as the portal edits it: which pages are in the menu and in
 * what order (shared by the three languages, so the menu never changes shape
 * between them) and what each is called in each language. Pages are not added
 * or removed here: a menu entry needs a page that exists, and that is a change
 * to the site, not a setting.
 */
export interface Menu {
	/** Page references in menu order, e.g. "/about". */
	order: string[];
	names: Record<Lang, Record<string, string>>;
}

interface MenuBlock {
	pageRef: string;
	name: string;
	weight: number;
	nameLine: number;
	weightLine: number;
}

const WEIGHT_LINE = /^(\s*weight\s*=\s*)(\d+)(\s*(?:#.*)?)$/;

/** The `[[languages.<l>.menus.main]]` entries of one language, in file order. */
function menuBlocks(lines: string[], lang: Lang): MenuBlock[] {
	const header = `[[languages.${lang}.menus.main]]`;
	const out: MenuBlock[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() !== header) continue;
		let end = i + 1;
		while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
		let name: [number, string] | null = null;
		let pageRef: string | null = null;
		let weight: [number, number] | null = null;
		for (let j = i + 1; j < end; j++) {
			const n = lineFor('name').exec(lines[j]);
			const p = lineFor('pageRef').exec(lines[j]);
			const w = WEIGHT_LINE.exec(lines[j]);
			if (n) name = [j, unescape(n[2])];
			if (p) pageRef = unescape(p[2]);
			if (w) weight = [j, Number(w[2])];
		}
		if (!name || !pageRef || !weight) throw new SiteParamsError(`${header} needs name, pageRef and weight lines`);
		out.push({ pageRef, name: name[1], weight: weight[1], nameLine: name[0], weightLine: weight[0] });
	}
	if (out.length === 0) throw new SiteParamsError(`hugo.toml has no ${header} entries`);
	return out;
}

export function readMenu(raw: string): Menu {
	const lines = split(raw);
	const per = Object.fromEntries(LANGS.map((l) => [l, menuBlocks(lines, l)])) as Record<Lang, MenuBlock[]>;
	const refs = (l: Lang) => per[l].map((b) => b.pageRef).sort().join(' ');
	for (const l of LANGS) {
		if (refs(l) !== refs('en')) throw new SiteParamsError(`The ${l.toUpperCase()} menu lists different pages from the English one.`);
	}
	const order = per.en
		.map((b, i) => ({ b, i }))
		.sort((a, b) => a.b.weight - b.b.weight || a.i - b.i)
		.map((x) => x.b.pageRef);
	return {
		order,
		names: Object.fromEntries(LANGS.map((l) => [l, Object.fromEntries(per[l].map((b) => [b.pageRef, b.name]))])) as Menu['names']
	};
}

/** Why this menu cannot be saved, or null. `current` is what the file has now. */
export function whyNotMenu(next: Menu, current: Menu): string | null {
	if ([...next.order].sort().join(' ') !== [...current.order].sort().join(' ')) {
		return 'The menu has to keep the same pages; only their names and order can change.';
	}
	for (const l of LANGS) {
		for (const ref of current.order) {
			const name = next.names[l]?.[ref] ?? '';
			if (!name) return `Every entry needs a name in ${l.toUpperCase()}.`;
			if (/[\u0000-\u001f\u007f]/.test(name)) return 'A name cannot contain line breaks.';
			if (name.length > MENU_LABEL_MAX) return `“${name}” is too long for a menu (${MENU_LABEL_MAX} characters at most).`;
		}
	}
	return null;
}

/**
 * Applies names and order. Order is written as weights 1…n in every language,
 * so the three menus always agree; the blocks stay where they are in the file.
 * Only a line that changes is touched, and an unchanged menu is byte-for-byte
 * the same file.
 */
export function writeMenu(raw: string, next: Menu): { raw: string; changed: string[] } {
	const lines = split(raw);
	const changed = new Set<string>();
	for (const l of LANGS) {
		for (const b of menuBlocks(lines, l)) {
			const name = next.names[l][b.pageRef];
			const nameMatch = lineFor('name').exec(lines[b.nameLine])!;
			if (name !== undefined && name !== b.name) {
				lines[b.nameLine] = `${nameMatch[1]}"${escape(name)}"${nameMatch[3]}`;
				changed.add(`menu names (${l})`);
			}
			const weight = next.order.indexOf(b.pageRef) + 1;
			if (weight > 0 && weight !== b.weight) {
				const m = WEIGHT_LINE.exec(lines[b.weightLine])!;
				lines[b.weightLine] = `${m[1]}${weight}${m[3]}`;
				changed.add('menu order');
			}
		}
	}
	return { raw: lines.join('\n'), changed: [...changed] };
}
