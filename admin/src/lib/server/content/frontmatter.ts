/**
 * Line-preserving YAML front-matter editor for the Hugo content bundles.
 *
 * This is deliberately NOT a general YAML library. It exists because
 * layouts/partials/auto-untranslated-pages.html parses front matter with the
 * regex `(?s)\A---\n(.*?)\n---` and hands the result to transform.Unmarshal:
 * if a file we write drifts even slightly (a CRLF, a BOM, a leading blank
 * line), Hugo stops synthesising the FR/IT placeholder pages for that bundle
 * and reports no error at all. So the safe move is to touch as few bytes as
 * possible.
 *
 * Two properties of the real corpus drive the design:
 *
 *   - 9 of 66 content files end without a trailing newline and 57 end with
 *     one. Bodies are therefore preserved byte-for-byte, never normalised.
 *   - content/blog/chat-control-eu/index.fr.md (and .it.md) carry explanatory
 *     `#` comments inside the front matter. Re-emitting the block from a key
 *     order would delete them, so lines are kept and edited in place instead.
 *
 * js-yaml is not used on purpose: its loader turns `2026-09-08` into a JS Date
 * (silently attaching a timezone) and its dumper reorders keys and rewrites
 * dates as ISO timestamps.
 */

/** Canonical key order, taken from the 13 existing blog posts. */
export const POST_ORDER = [
	'title',
	'date',
	'slug',
	'category',
	'draft',
	'description',
	'featured_image',
	'read_time',
	'excerpt',
	'untranslated',
	'partner_name',
	'partner_url',
	'partner_logo_url',
	'project_url',
	'eu_funding_text'
] as const;

/** Keys written as bare YAML scalars rather than quoted strings. */
const BARE_KEYS = new Set(['date', 'draft', 'untranslated']);

/** The closed category enum. Also mirrored in i18n/*.toml and layouts/blog/list.html. */
export const CATEGORIES = ['Technology', 'Cybersecurity', 'Personal', 'Erasmus+'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Scalar = string | boolean;

type Line =
	| { kind: 'pair'; key: string; raw: string }
	| { kind: 'nested'; raw: string }
	| { kind: 'comment'; raw: string }
	| { kind: 'blank'; raw: string };

const FM_RE = /^---\n([\s\S]*?)\n---(\n?)/;
const PAIR_RE = /^([A-Za-z0-9_]+):[ \t]*(.*)$/;

export class FrontMatterError extends Error {}

export class FrontMatter {
	private lines: Line[];
	/** Everything after the closing delimiter, preserved byte-for-byte. */
	private bodyText: string;
	/** Whether the closing `---` was followed by a newline in the source. */
	private readonly closeEol: string;

	private constructor(lines: Line[], body: string, closeEol: string) {
		this.lines = lines;
		this.bodyText = body;
		this.closeEol = closeEol;
	}

	get body(): string {
		return this.bodyText;
	}

	/**
	 * Replaces the Markdown body. Left untouched by every other method, so a
	 * metadata-only edit never perturbs a single byte below the front matter.
	 */
	setBody(body: string): this {
		this.bodyText = body;
		return this;
	}

	static parse(raw: string): FrontMatter {
		if (raw.charCodeAt(0) === 0xfeff) {
			throw new FrontMatterError('file starts with a BOM; Hugo\u2019s front-matter regex will not match');
		}
		if (raw.includes('\r\n')) {
			throw new FrontMatterError('file uses CRLF line endings; Hugo\u2019s front-matter regex will not match');
		}
		const m = FM_RE.exec(raw);
		if (!m) throw new FrontMatterError('no `---` front-matter block at the start of the file');

		const lines: Line[] = m[1].split('\n').map((raw): Line => {
			if (raw.trim() === '') return { kind: 'blank', raw };
			if (/^[ \t]*#/.test(raw)) return { kind: 'comment', raw };
			if (/^[ \t]/.test(raw)) return { kind: 'nested', raw };
			const pm = PAIR_RE.exec(raw);
			if (!pm) throw new FrontMatterError(`unparseable front-matter line: ${JSON.stringify(raw)}`);
			return { kind: 'pair', key: pm[1], raw };
		});

		return new FrontMatter(lines, raw.slice(m[0].length), m[2]);
	}

	/** Reconstructs the file. `serialize(parse(x)) === x` for any unmodified document. */
	serialize(): string {
		return `---\n${this.lines.map((l) => l.raw).join('\n')}\n---${this.closeEol}${this.bodyText}`;
	}

	/** Top-level keys, in document order. */
	keys(): string[] {
		return this.lines.filter((l) => l.kind === 'pair').map((l) => (l as { key: string }).key);
	}

	has(key: string): boolean {
		return this.indexOf(key) !== -1;
	}

	get(key: string): Scalar | undefined {
		const i = this.indexOf(key);
		if (i === -1) return undefined;
		const pm = PAIR_RE.exec(this.lines[i].raw)!;
		return parseScalar(pm[2]);
	}

	/** Reads a key that owns an indented block (currently only gallery's `build:`). */
	getNestedRaw(key: string): string | undefined {
		const i = this.indexOf(key);
		if (i === -1) return undefined;
		const end = this.blockEnd(i);
		return this.lines.slice(i, end).map((l) => l.raw).join('\n');
	}

	/**
	 * Sets a key, rewriting only that one line. A new key is inserted at its
	 * POST_ORDER position; a key outside POST_ORDER is appended after the last
	 * existing pair, so nothing already in the file is disturbed.
	 */
	set(key: string, value: Scalar): this {
		const raw = `${key}: ${formatScalar(key, value)}`;
		const i = this.indexOf(key);
		if (i !== -1) {
			this.lines[i] = { kind: 'pair', key, raw };
			return this;
		}
		this.lines.splice(this.insertionPoint(key), 0, { kind: 'pair', key, raw });
		return this;
	}

	/** Sets when `value` is meaningful, removes the key when it is empty. */
	setOrRemove(key: string, value: Scalar | undefined | null): this {
		if (value === undefined || value === null || value === '') return this.remove(key);
		return this.set(key, value);
	}

	/** Removes a key together with any indented block it owns. */
	remove(key: string): this {
		const i = this.indexOf(key);
		if (i === -1) return this;
		this.lines.splice(i, this.blockEnd(i) - i);
		return this;
	}

	/** Every top-level key as a plain object. Nested blocks are reported as `true`. */
	toObject(): Record<string, Scalar> {
		const out: Record<string, Scalar> = {};
		for (const l of this.lines) {
			if (l.kind !== 'pair') continue;
			const pm = PAIR_RE.exec(l.raw)!;
			out[l.key] = pm[2] === '' ? true : parseScalar(pm[2]);
		}
		return out;
	}

	private indexOf(key: string): number {
		return this.lines.findIndex((l) => l.kind === 'pair' && l.key === key);
	}

	/** Index just past the pair at `i` and any nested/comment lines it owns. */
	private blockEnd(i: number): number {
		let end = i + 1;
		while (end < this.lines.length && this.lines[end].kind === 'nested') end++;
		return end;
	}

	private insertionPoint(key: string): number {
		const rank = POST_ORDER.indexOf(key as (typeof POST_ORDER)[number]);
		if (rank === -1) return lastPairEnd(this.lines);

		let point = -1;
		for (let i = 0; i < this.lines.length; i++) {
			const l = this.lines[i];
			if (l.kind !== 'pair') continue;
			const r = POST_ORDER.indexOf(l.key as (typeof POST_ORDER)[number]);
			if (r !== -1 && r < rank) point = this.blockEnd(i);
		}
		return point === -1 ? 0 : point;
	}
}

function lastPairEnd(lines: Line[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].kind === 'pair' || lines[i].kind === 'nested') return i + 1;
	}
	return lines.length;
}

/** Parses a YAML scalar as written in this corpus: quoted string, bool, or bare text. */
export function parseScalar(raw: string): Scalar {
	const v = raw.trim();
	if (v === 'true') return true;
	if (v === 'false') return false;
	if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
		return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
	}
	return v;
}

/**
 * Formats a scalar the way the corpus writes it: dates and booleans bare,
 * everything else double-quoted with only `\` and `"` escaped, so accents,
 * em-dashes and emoji stay literal UTF-8.
 */
export function formatScalar(key: string, value: Scalar): string {
	if (typeof value === 'boolean') return String(value);
	if (BARE_KEYS.has(key)) {
		if (key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			throw new FrontMatterError(`date must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
		}
		return value;
	}
	if (value.includes('\n')) {
		throw new FrontMatterError(`front-matter value for "${key}" must be single-line`);
	}
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
