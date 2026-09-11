/**
 * Markdown ⇄ DeepL XML, so a machine translation cannot break an article.
 *
 * DeepL does not understand Markdown. Sent raw, it translates file names
 * inside ![alt](photo.jpg), "fixes" URLs, and moves or drops the ** of bold
 * text. So each line is converted to the XML that DeepL's tag handling does
 * understand, and converted back afterwards:
 *
 *   code, shortcodes, HTML, footnotes, URLs     →  <k i="n"/>        kept verbatim
 *   ![alt](target)                              →  <m i="n">alt</m>   alt translated
 *   [text](target)                              →  <l i="n">text</l>  text translated
 *   **bold**, *italic*                          →  <b>…</b>, <em>…</em>, moved with their words
 *
 * The target of every link and image never leaves this module: DeepL only
 * sees the index. Line structure is kept by translating line by line —
 * heading, list and quote markers stay outside the text sent — and fenced
 * code blocks and blank lines are never sent at all.
 *
 * Pure: no I/O, so the suite can drive it without a key.
 */

type Line =
	| { kind: 'raw'; text: string }
	| { kind: 'text'; prefix: string; suffix: string; xml: string; slots: string[] };

export interface Prepared {
	/** What to send, in order. */
	texts: string[];
	/** Reassembles the Markdown from DeepL's answers (same order as `texts`). */
	rebuild(translated: string[]): { markdown: string; warnings: string[] };
}

// Block markers that stay put: headings, list items, quotes, in any nesting.
const PREFIX = /^(\s*(?:(?:#{1,6}|[-*+]|\d{1,9}[.)])\s+|>\s?)*)/;
const FENCE = /^\s*(```|~~~)/;
// Private-use characters as placeholders: never in real text, and XML-safe.
const OPEN = '\uE000';
const CLOSE = '\uE001';

// Order matters: a code span may contain brackets, a link may contain a URL.
const TOKEN = new RegExp(
	[
		'(`+)[\\s\\S]*?\\1', // code span
		'\\{\\{[<%][\\s\\S]*?[%>]\\}\\}', // Hugo shortcode
		'\\[\\^[^\\]]+\\]', // footnote reference
		'!\\[([^\\]]*)\\]\\(([^)]*)\\)', // image
		'\\[([^\\]]+)\\]\\(([^)]*)\\)', // link
		'<https?:\\/\\/[^>\\s]+>', // autolink
		'<\\/?[A-Za-z][^>]*>', // raw HTML tag
		'https?:\\/\\/[^\\s<>()\\]]+[^\\s<>()\\].,;:!?\'"]' // bare URL, minus trailing punctuation
	].join('|'),
	'g'
);

export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const unescapeXml = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');

/** One line of text (no newline) to XML plus the targets it hides. */
export function lineToXml(text: string): { xml: string; slots: string[] } {
	const slots: string[] = [];
	const parts: string[] = [];
	const hold = (xml: string) => {
		parts.push(xml);
		return `${OPEN}${parts.length - 1}${CLOSE}`;
	};

	let s = text.replace(TOKEN, (m, _tick, alt, imgTarget, linkText, linkTarget) => {
		const i = slots.length;
		if (imgTarget !== undefined) {
			slots.push(imgTarget);
			return hold(`<m i="${i}">${escapeXml(alt)}</m>`);
		}
		if (linkTarget !== undefined) {
			slots.push(linkTarget);
			return hold(`<l i="${i}">${escapeXml(linkText)}</l>`);
		}
		slots.push(m);
		return hold(`<k i="${i}"/>`);
	});

	s = escapeXml(s)
		.replace(/\*\*(?=\S)([^*]+?)(?<=\S)\*\*/g, '<b>$1</b>')
		.replace(/(?<![*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])/g, '<em>$1</em>');

	s = s.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g'), (_, n) => parts[Number(n)]);
	return { xml: s, slots };
}

/** The inverse of lineToXml, tolerant of how DeepL writes tags back. */
export function xmlToLine(xml: string, slots: string[]): { text: string; missing: number[] } {
	const used = new Set<number>();
	const slot = (n: string) => {
		const i = Number(n);
		used.add(i);
		return slots[i] ?? '';
	};
	let s = xml
		.replace(/<k\s+i="(\d+)"\s*\/>|<k\s+i="(\d+)"\s*>\s*<\/k>/g, (_, a, b) => `${OPEN}${slot(a ?? b)}${CLOSE}`)
		.replace(/<m\s+i="(\d+)"\s*>([\s\S]*?)<\/m>/g, (_, n, alt) => `${OPEN}![${unescapeXml(alt)}](${slot(n)})${CLOSE}`)
		.replace(/<l\s+i="(\d+)"\s*>([\s\S]*?)<\/l>/g, (_, n, t) => `${OPEN}[${unescapeXml(t)}](${slot(n)})${CLOSE}`)
		.replace(/<\/?b>/g, '**')
		.replace(/<\/?em>/g, '*');

	// Unescape only what is outside the restored Markdown: a code span or URL
	// containing "&amp;" must come back exactly as it was written.
	s = s
		.split(new RegExp(`(${OPEN}[\\s\\S]*?${CLOSE})`))
		.map((part) => (part.startsWith(OPEN) ? part.slice(1, -1) : unescapeXml(part)))
		.join('');

	const missing = slots.map((_, i) => i).filter((i) => !used.has(i));
	// Never lose a link target or code span silently: put it back at the end.
	for (const i of missing) s += ` ${slotAsMarkdown(slots[i])}`;
	return { text: s, missing };
}

const slotAsMarkdown = (slot: string) => (/^[`<]|^https?:/.test(slot) ? slot : `(${slot})`);

export function prepareMarkdown(markdown: string): Prepared {
	const lines: Line[] = [];
	let fenced: string | null = null;

	for (const text of markdown.split('\n')) {
		const fence = text.match(FENCE);
		if (fenced) {
			lines.push({ kind: 'raw', text });
			if (fence && fence[1] === fenced) fenced = null;
			continue;
		}
		if (fence) {
			fenced = fence[1];
			lines.push({ kind: 'raw', text });
			continue;
		}
		const prefix = text.match(PREFIX)?.[1] ?? '';
		// Trailing spaces can be a hard line break; DeepL would trim them.
		const suffix = text.match(/\s*$/)?.[0] ?? '';
		const rest = text.slice(prefix.length, text.length - suffix.length);
		// Nothing a reader would translate: blank, a rule, only markup, or a
		// reference-link definition (its label must match the text exactly).
		if (!/\p{L}/u.test(rest) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(text) || /^\s*\[[^\]]+\]:\s/.test(text)) {
			lines.push({ kind: 'raw', text });
			continue;
		}
		const { xml, slots } = lineToXml(rest);
		// A line that is nothing but code/HTML/URLs has no words left for DeepL.
		if (!/\p{L}/u.test(xml.replace(/<k [^>]*\/>/g, '').replace(/<[^>]+>/g, ''))) {
			lines.push({ kind: 'raw', text });
			continue;
		}
		lines.push({ kind: 'text', prefix, suffix, xml, slots });
	}

	const textLines = lines.filter((l): l is Extract<Line, { kind: 'text' }> => l.kind === 'text');
	return {
		texts: textLines.map((l) => l.xml),
		rebuild(translated) {
			if (translated.length !== textLines.length) {
				throw new Error(`Expected ${textLines.length} translated lines, got ${translated.length}.`);
			}
			const warnings: string[] = [];
			let k = 0;
			const out = lines.map((l) => {
				if (l.kind === 'raw') return l.text;
				const { text, missing } = xmlToLine(translated[k++], l.slots);
				if (missing.length) warnings.push(`A link, image or code span moved to the end of: “${text.slice(0, 60)}…”`);
				return l.prefix + text.trim() + l.suffix;
			});
			return { markdown: out.join('\n'), warnings };
		}
	};
}
