/**
 * Line-preserving editor for i18n/{en,fr,it}.toml.
 *
 * Same philosophy as the front-matter editor: the files are hand-maintained
 * and carry section comments worth keeping, so editing rewrites only the lines
 * that change. A full re-serialise would discard the comments and reshuffle
 * 96 keys into one enormous diff.
 *
 * The shape is narrow by design — every entry is `[key]` followed by
 * `other = "…"` — because that is exactly what the corpus contains and what
 * Hugo's go-i18n reader expects here. Anything else is rejected rather than
 * silently mangled.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

export type Lang = 'en' | 'fr' | 'it';
export const LANGS: Lang[] = ['en', 'fr', 'it'];

type Line =
	| { kind: 'key'; key: string; raw: string }
	| { kind: 'value'; raw: string }
	| { kind: 'comment'; raw: string }
	| { kind: 'blank'; raw: string };

const KEY_RE = /^\[("?)([A-Za-z0-9_+-]+)\1\]\s*$/;
const VALUE_RE = /^other\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/;

export class I18nError extends Error {}

const unescape = (s: string) => s.replace(/\\(["\\])/g, '$1');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Keys that are not bare identifiers must stay quoted, e.g. cat_Erasmus+. */
const needsQuotes = (key: string) => !/^[A-Za-z0-9_-]+$/.test(key);
export const renderKeyHeader = (key: string) =>
	needsQuotes(key) ? `["${key}"]` : `[${key}]`;

export class I18nFile {
	private lines: Line[];
	private readonly trailingNewline: boolean;

	private constructor(lines: Line[], trailingNewline: boolean) {
		this.lines = lines;
		this.trailingNewline = trailingNewline;
	}

	static parse(raw: string): I18nFile {
		if (raw.includes('\r\n')) throw new I18nError('file uses CRLF line endings');
		const trailingNewline = raw.endsWith('\n');
		const src = trailingNewline ? raw.slice(0, -1) : raw;

		const lines: Line[] = src.split('\n').map((raw): Line => {
			if (raw.trim() === '') return { kind: 'blank', raw };
			if (raw.trimStart().startsWith('#')) return { kind: 'comment', raw };
			const km = KEY_RE.exec(raw);
			if (km) return { kind: 'key', key: km[2], raw };
			if (VALUE_RE.test(raw)) return { kind: 'value', raw };
			throw new I18nError(`unrecognised line: ${JSON.stringify(raw)}`);
		});

		return new I18nFile(lines, trailingNewline);
	}

	serialize(): string {
		return this.lines.map((l) => l.raw).join('\n') + (this.trailingNewline ? '\n' : '');
	}

	/** Keys in file order. */
	keys(): string[] {
		return this.lines.filter((l) => l.kind === 'key').map((l) => (l as { key: string }).key);
	}

	get(key: string): string | undefined {
		const i = this.indexOfKey(key);
		if (i === -1) return undefined;
		const v = this.lines[i + 1];
		if (!v || v.kind !== 'value') return undefined;
		return unescape(VALUE_RE.exec(v.raw)![1]);
	}

	entries(): Record<string, string> {
		return Object.fromEntries(this.keys().map((k) => [k, this.get(k) ?? '']));
	}

	/** Updates a key in place, or appends it at the end of the file. */
	set(key: string, value: string): this {
		const raw = `other = "${escape(value)}"`;
		const i = this.indexOfKey(key);
		if (i !== -1 && this.lines[i + 1]?.kind === 'value') {
			this.lines[i + 1] = { kind: 'value', raw };
			return this;
		}
		// Append after the final non-blank line, so the file does not grow a run
		// of trailing blank lines as keys are added.
		let at = this.lines.length;
		while (at > 0 && this.lines[at - 1].kind === 'blank') at--;
		this.lines.splice(at, 0, { kind: 'key', key, raw: renderKeyHeader(key) }, { kind: 'value', raw });
		return this;
	}

	remove(key: string): this {
		const i = this.indexOfKey(key);
		if (i === -1) return this;
		const hasValue = this.lines[i + 1]?.kind === 'value';
		this.lines.splice(i, hasValue ? 2 : 1);
		return this;
	}

	private indexOfKey(key: string): number {
		return this.lines.findIndex((l) => l.kind === 'key' && l.key === key);
	}
}

/** `%city%` and `%n%` are substituted at render time and must survive translation. */
export function placeholders(value: string): string[] {
	return [...value.matchAll(/%[a-z_]+%/g)].map((m) => m[0]).sort();
}

export interface DriftReport {
	missing: { lang: Lang; key: string }[];
	extra: { lang: Lang; key: string }[];
	empty: { lang: Lang; key: string }[];
	placeholderMismatch: { lang: Lang; key: string; expected: string[]; found: string[] }[];
}

/**
 * A key present in one file and absent from another makes `i18n` render an
 * empty string in that language — silently, with no build error. This is the
 * check that stops that happening.
 */
export function checkDrift(files: Record<Lang, I18nFile>): DriftReport {
	const report: DriftReport = { missing: [], extra: [], empty: [], placeholderMismatch: [] };
	const reference = files.en.keys();
	const referenceSet = new Set(reference);

	for (const lang of LANGS) {
		const keys = new Set(files[lang].keys());
		if (lang !== 'en') {
			for (const k of reference) if (!keys.has(k)) report.missing.push({ lang, key: k });
			for (const k of keys) if (!referenceSet.has(k)) report.extra.push({ lang, key: k });
		}
		for (const k of keys) {
			const v = files[lang].get(k) ?? '';
			if (v.trim() === '') {
				// Empty in every language means the string is deliberately unused —
				// hero_intro2 is an optional second paragraph, and its template
				// guards with `{{ with i18n … }}` so nothing renders. Only an
				// inconsistent gap is a problem: that one language silently shows
				// nothing where the others show text.
				const emptyEverywhere = LANGS.every((l) => (files[l].get(k) ?? '').trim() === '');
				if (!emptyEverywhere) report.empty.push({ lang, key: k });
			} else if (lang !== 'en' && referenceSet.has(k)) {
				const expected = placeholders(files.en.get(k) ?? '');
				const found = placeholders(v);
				if (expected.join() !== found.join()) {
					report.placeholderMismatch.push({ lang, key: k, expected, found });
				}
			}
		}
	}
	return report;
}

export const driftCount = (r: DriftReport) =>
	r.missing.length + r.extra.length + r.empty.length + r.placeholderMismatch.length;
