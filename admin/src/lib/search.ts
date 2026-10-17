/**
 * What the command palette matches, and how it ranks.
 *
 * Everything the portal holds — articles, pages, cities, interface strings, its
 * own screens and a few actions — becomes one flat list of items, and a query
 * is a handful of words that must each be found somewhere in an item. Accents
 * and capitals do not matter ("a propos" finds "À propos"), a word may be
 * started rather than finished ("gal" finds "Gallery"), and a title beats a
 * description.
 *
 * Pure, and outside lib/server because the palette runs it in the browser on
 * every keystroke against a list it fetched once.
 */

export type Kind = 'action' | 'screen' | 'article' | 'page' | 'gallery' | 'string';

export interface Item {
	kind: Kind;
	title: string;
	/** A second line: the date, the key, what it is. Searched too, less eagerly. */
	hint?: string;
	/** More words to find it by that are not shown: the slug, a description. */
	keywords?: string;
	/** Where it goes. */
	href?: string;
	/** Or a thing to do, named for the host to carry out. */
	action?: string;
}

/** One character at a time, so that positions in the result are positions in the original. */
const fold = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] ?? c;
export const norm = (s: string) => Array.from(s, fold).join('');

const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Higher is better; null when a word of the query is nowhere in the item. */
export function score(item: Item, tokens: string[]): number | null {
	const title = norm(item.title);
	const titleWords = words(item.title);
	const other = norm(`${item.hint ?? ''} ${item.keywords ?? ''}`);
	const otherWords = words(`${item.hint ?? ''} ${item.keywords ?? ''}`);
	let total = 0;
	for (const t of tokens) {
		let best = 0;
		if (title.startsWith(t)) best = 130;
		else if (titleWords.some((w) => w.startsWith(t))) best = 100;
		else if (title.includes(t)) best = 60;
		else if (otherWords.some((w) => w.startsWith(t))) best = 40;
		else if (other.includes(t)) best = 25;
		if (best === 0) return null;
		total += best;
	}
	// Where you can go and what you can do beat a sentence that happens to contain the words.
	return total + (item.kind === 'screen' || item.kind === 'action' ? 6 : item.kind === 'article' || item.kind === 'page' ? 3 : 0);
}

export const tokensOf = (query: string) => norm(query).split(/\s+/).filter(Boolean);

export function search(items: Item[], query: string, limit = 12): Item[] {
	const tokens = tokensOf(query);
	if (tokens.length === 0) return [];
	return items
		.map((item, i) => ({ item, i, s: score(item, tokens) }))
		.filter((x): x is { item: Item; i: number; s: number } => x.s !== null)
		.sort((a, b) => b.s - a.s || a.i - b.i)
		.slice(0, limit)
		.map((x) => x.item);
}

/** `text` split into runs, those that match a word of the query flagged, for <mark>. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
	const tokens = tokensOf(query);
	const n = norm(text);
	const hit = new Array<boolean>(text.length).fill(false);
	for (const t of tokens) {
		for (let at = n.indexOf(t); at !== -1; at = n.indexOf(t, at + 1)) for (let k = at; k < at + t.length; k++) hit[k] = true;
	}
	const out: { text: string; hit: boolean }[] = [];
	for (let i = 0; i < text.length; i++) {
		const last = out[out.length - 1];
		if (last && last.hit === hit[i]) last.text += text[i];
		else out.push({ text: text[i], hit: hit[i] });
	}
	return out;
}

export const KIND_LABEL: Record<Kind, string> = {
	action: 'Do',
	screen: 'Go to',
	article: 'Article',
	page: 'Page',
	gallery: 'Gallery',
	string: 'Text'
};
