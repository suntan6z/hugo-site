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
	{ key: 'thunderbolt', label: 'Thunderbolt' },
	{ key: 'trakt', label: 'Trakt' },
	{ key: 'appleMusic', label: 'Apple Music' }
] as const;

export type SocialKey = (typeof SOCIALS)[number]['key'];
export type Socials = Record<SocialKey, string>;

export class SiteParamsError extends Error {}

/** `params` is the shared table; each language has its own. */
export type Table = 'params' | `languages.${Lang}.params`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineFor = (key: string) => new RegExp(`^(\\s*${escapeRe(key)}\\s*=\\s*)"((?:[^"\\\\]|\\\\.)*)"(\\s*(?:#.*)?)$`);
const unescape = (s: string) => s.replace(/\\(["\\])/g, '$1');
/** A TOML basic string: only the quote and the backslash need escaping once newlines are ruled out. */
const escape = (s: string) => s.replace(/[\\"]/g, '\\$&');

/** The line range of one table: [first line after its header, end). */
function tableRange(lines: string[], table: Table): [number, number] {
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
