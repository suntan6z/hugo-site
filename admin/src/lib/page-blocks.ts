/**
 * Where the editable text of a standalone page lives in its HTML source.
 *
 * The pages editor lets you click words on the rendered page and type. The page
 * itself stays hand-written HTML, and re-serialising it from a browser DOM
 * would reformat every line (attribute quotes, `<br />`, entities, whitespace)
 * and bury a one-word edit in a diff of the whole file. So nothing is
 * re-serialised: this module finds each *text block* by its offsets in the
 * source, and an edit replaces only that block's inner HTML. Everything outside
 * stays byte for byte what it was.
 *
 * A text block is an element made only of text and inline markup (a heading, a
 * paragraph, a list item, a leaf `div`, a button-like link…) that contains no
 * `id` — the contact form's script finds its fields by id, and an edit must not
 * be able to drop one (the element's own id sits on its start tag, which an edit
 * never touches; text that a script writes itself is not offered). Blocks never nest: the outermost wins, so a `<p>` holding
 * a `<strong>` is one block, and the bold is edited inside it. What is not a
 * block (structure, forms, icons, images) is simply not editable here; the
 * HTML view is for those.
 *
 * Pure, and outside lib/server because the editor runs it in the browser, on
 * every keystroke, against the very string that gets saved.
 */

export interface Block {
	/** Position among the page's blocks, in document order. This is the handle. */
	id: number;
	tag: string;
	/** The start tag is html[tagStart, tagEnd). */
	tagStart: number;
	tagEnd: number;
	/** The inner HTML is html[start, end). */
	start: number;
	end: number;
	/** The whole element is html[tagStart, outerEnd). */
	outerEnd: number;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const OPTIONAL_CLOSE = new Set(['p', 'li', 'option', 'dt', 'dd']);

/** Markup that may sit inside a block's text. */
const INLINE = new Set([
	'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q',
	's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
]);

/** Elements that can be a block when everything inside them is inline. */
const TEXT_TAGS = new Set([
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'dt', 'dd', 'td', 'th', 'figcaption', 'legend', 'summary',
	'label', 'a', 'button', 'div', 'span', 'blockquote'
]);

/** Blocks that can be copied or deleted as a unit without leaving the page broken. */
const REPEATABLE = new Set(['p', 'li', 'h2', 'h3', 'h4', 'dt', 'dd']);

const NAMES: Record<string, string> = {
	h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading',
	p: 'Paragraph', li: 'List item', dt: 'Term', dd: 'Definition', td: 'Table cell', th: 'Table cell',
	figcaption: 'Caption', legend: 'Label', summary: 'Question', label: 'Label', a: 'Link', button: 'Button',
	blockquote: 'Quote'
};
export const blockName = (tag: string) => NAMES[tag] ?? 'Text';
export const isRepeatable = (tag: string) => REPEATABLE.has(tag);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;
const HAS_ID = /\sid\s*=/i;
const OWN_ID = /\sid\s*=\s*["']?([^"'\s>]+)/i;
/** Text a script on the page writes itself (a counter, a clock, error messages): editing it would be undone at once. */
const SCRIPT_TEXT = /^(?:char-count|local-time)$|-error$/;

/** Comments, scripts and styles can hold anything: blank them, keeping every offset. */
function blanked(html: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, ' ');
	return html.replace(/<!--[\s\S]*?-->/g, blank).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, blank);
}

interface Open {
	tag: string;
	tagStart: number;
	tagEnd: number;
	blocky: boolean;
	hasId: boolean;
	ownId: string | null;
}

export function scanBlocks(html: string): Block[] {
	const src = blanked(html);
	const stack: Open[] = [];
	const found: Omit<Block, 'id'>[] = [];

	const taint = (blocky: boolean, hasId: boolean) => {
		for (const s of stack) {
			if (blocky) s.blocky = true;
			if (hasId) s.hasId = true;
		}
	};

	for (const m of src.matchAll(TAG)) {
		const [whole, closing, name, selfClosing] = m;
		const tag = name.toLowerCase();
		const at = m.index ?? 0;

		if (!closing) {
			const id = HAS_ID.test(whole);
			if (VOID.has(tag) || selfClosing) {
				// A void or self-closed element is a child like any other; only <br> is text-like.
				if (tag !== 'br' && tag !== 'wbr') taint(true, id);
				else taint(false, id);
				continue;
			}
			taint(!INLINE.has(tag), id);
			stack.push({ tag, tagStart: at, tagEnd: at + whole.length, blocky: false, hasId: false, ownId: OWN_ID.exec(whole)?.[1] ?? null });
			continue;
		}

		const i = stack.map((s) => s.tag).lastIndexOf(tag);
		if (i === -1) continue;
		const open = stack[i];
		// Elements left open above it (a <p> or <li> with no end tag) end here, and are not blocks.
		const clean = stack.slice(i + 1).every((s) => OPTIONAL_CLOSE.has(s.tag));
		const inSvg = stack.slice(0, i).some((s) => s.tag === 'svg' || s.tag === 'select' || s.tag === 'textarea');
		stack.length = i;

		if (!TEXT_TAGS.has(tag) || open.blocky || open.hasId || !clean || inSvg) continue;
		if (open.ownId && SCRIPT_TEXT.test(open.ownId)) continue;
		const inner = html.slice(open.tagEnd, at);
		if (inner.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '') continue;
		found.push({ tag, tagStart: open.tagStart, tagEnd: open.tagEnd, start: open.tagEnd, end: at, outerEnd: at + whole.length });
	}

	// Outermost wins: drop whatever sits inside a block already kept.
	found.sort((a, b) => a.tagStart - b.tagStart);
	const blocks: Block[] = [];
	let until = -1;
	for (const f of found) {
		if (f.tagStart < until) continue;
		blocks.push({ ...f, id: blocks.length });
		until = f.outerEnd;
	}
	return blocks;
}

/** One `<img>` in the page, by where its tag sits. Pictures are edited by their attributes, never their content. */
export interface ImgTag {
	id: number;
	tagStart: number;
	tagEnd: number;
}

export function scanImages(html: string): ImgTag[] {
	const out: ImgTag[] = [];
	for (const m of blanked(html).matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
		out.push({ id: out.length, tagStart: m.index ?? 0, tagEnd: (m.index ?? 0) + m[0].length });
	}
	return out;
}

/**
 * The html with `data-ed="<id>"` on every block's start tag and `data-edimg` on
 * every picture, for the editing frame. Taking them out again gives the source.
 */
export function annotate(html: string): string {
	const marks: { at: number; attr: string }[] = [
		...scanBlocks(html).map((b) => ({ at: b.tagEnd - 1, attr: ` data-ed="${b.id}"` })),
		// The mark goes before a closing slash and the space ahead of it, so that taking it out restores the tag exactly.
		...scanImages(html).map((i) => ({ at: i.tagStart + html.slice(i.tagStart, i.tagEnd).search(/\s*\/?>$/), attr: ` data-edimg="${i.id}"` }))
	].sort((a, b) => a.at - b.at);
	let out = '';
	let from = 0;
	for (const m of marks) {
		out += html.slice(from, m.at) + m.attr;
		from = m.at;
	}
	return out + html.slice(from);
}

const block = (html: string, id: number) => scanBlocks(html).find((b) => b.id === id);

export function innerOf(html: string, id: number): string | null {
	const b = block(html, id);
	return b ? html.slice(b.start, b.end) : null;
}

/** The block's inner HTML replaced, and nothing else touched. */
export function patchInner(html: string, id: number, inner: string): string {
	const b = block(html, id);
	return b ? html.slice(0, b.start) + inner + html.slice(b.end) : html;
}

const attrRe = (name: string) => new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const unescAttr = (v: string) => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

const readAttr = (tag: string, name: string): string | null => {
	const m = attrRe(name).exec(tag);
	return m ? unescAttr(m[2].replace(/^["']|["']$/g, '')) : null;
};

/** A tag with one attribute set or added; the rest of it is kept as written, including a closing slash. */
const withAttr = (tag: string, name: string, value: string): string => {
	const re = attrRe(name);
	if (re.test(tag)) return tag.replace(re, (_m, lead: string) => `${lead}"${escAttr(value)}"`);
	return tag.replace(/(\s*\/?>)$/, ` ${name}="${escAttr(value)}"$1`);
};

/** An attribute on the block's own start tag, or null. */
export function attrOf(html: string, id: number, name: string): string | null {
	const b = block(html, id);
	return b ? readAttr(html.slice(b.tagStart, b.tagEnd), name) : null;
}

/** An attribute on the block's own start tag set or added; the rest of the tag is kept as written. */
export function patchAttr(html: string, id: number, name: string, value: string): string {
	const b = block(html, id);
	if (!b) return html;
	return html.slice(0, b.tagStart) + withAttr(html.slice(b.tagStart, b.tagEnd), name, value) + html.slice(b.tagEnd);
}

export function imgAttr(html: string, id: number, name: string): string | null {
	const t = scanImages(html).find((i) => i.id === id);
	return t ? readAttr(html.slice(t.tagStart, t.tagEnd), name) : null;
}

export function patchImgAttr(html: string, id: number, name: string, value: string): string {
	const t = scanImages(html).find((i) => i.id === id);
	return t ? html.slice(0, t.tagStart) + withAttr(html.slice(t.tagStart, t.tagEnd), name, value) + html.slice(t.tagEnd) : html;
}

/**
 * The lines a block occupies when it stands alone on them, so that copying or
 * removing it leaves no blank or half-indented line behind. Null when other
 * markup shares its line.
 */
function ownLines(html: string, b: Block): [number, number] | null {
	let a = b.tagStart;
	while (a > 0 && (html[a - 1] === ' ' || html[a - 1] === '\t')) a--;
	if (a > 0 && html[a - 1] !== '\n') return null;
	let e = b.outerEnd;
	while (e < html.length && (html[e] === ' ' || html[e] === '\t')) e++;
	if (e < html.length && html[e] !== '\n') return null;
	return [a, e < html.length ? e + 1 : e];
}

export function removeBlock(html: string, id: number): string {
	const b = block(html, id);
	if (!b || !REPEATABLE.has(b.tag)) return html;
	const [a, e] = ownLines(html, b) ?? [b.tagStart, b.outerEnd];
	return html.slice(0, a) + html.slice(e);
}

/** A copy of the block straight after it, to be rewritten in place. */
export function duplicateBlock(html: string, id: number): string {
	const b = block(html, id);
	if (!b || !REPEATABLE.has(b.tag)) return html;
	const lines = ownLines(html, b);
	if (lines) {
		const [a, e] = lines;
		const text = html.slice(a, e);
		// The last line of a file has no newline to copy; add one between the two.
		return text.endsWith('\n') ? html.slice(0, e) + text + html.slice(e) : html.slice(0, e) + '\n' + text + html.slice(e);
	}
	const outer = html.slice(b.tagStart, b.outerEnd);
	return html.slice(0, b.outerEnd) + outer + html.slice(b.outerEnd);
}
