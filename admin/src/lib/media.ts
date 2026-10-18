/**
 * What images the site has, where each lives, and what uses it.
 *
 * The images are scattered by design: an article's pictures sit in its own
 * bundle, the gallery's in one folder per city, the logo and favicons in
 * static/img, the homepage photo in assets/img. Nothing says which are still
 * used. This answers that from the text the site is written in, so the Library
 * can show what a picture is for, find the ones nothing refers to, and refuse
 * to delete one something still shows.
 *
 * Pure, and outside lib/server because the Library page filters and groups in
 * the browser; the thin module beside the repo supplies the file list and text.
 */

export const IMAGE_RE = /\.(jpe?g|png|webp|gif|svg|ico|avif)$/i;
/** Formats a canvas can re-encode without losing something (animation, alpha, vectors). */
export const BITMAP_RE = /\.(jpe?g|png|webp)$/i;

export type Group = 'articles' | 'gallery' | 'site' | 'hero' | 'now';

export interface UsedBy {
	/** What to show: "Article · Colors of solidarity", "Contact page", "Footer". */
	label: string;
	href?: string;
}

export interface MediaEntry {
	/** Repo path, the handle for everything. */
	path: string;
	name: string;
	group: Group;
	/** The bundle, city or "site" the picture belongs to. */
	owner: string;
	usedBy: UsedBy[];
	unused: boolean;
	/** A new file can take its place under the same name. */
	canReplace: boolean;
	/** It can be deleted from here: only an article or Now picture nothing refers to. */
	canDelete: boolean;
}

export interface TextFile {
	path: string;
	text: string;
}

export interface Names {
	/** slug → article title */
	articles: Record<string, string>;
	/** gallery slug → city name */
	cities: Record<string, string>;
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function groupOf(path: string): Group | null {
	if (!IMAGE_RE.test(path)) return null;
	if (/^content\/blog\/[^/]+\/[^/]+$/.test(path)) return 'articles';
	if (/^content\/gallery\/[^/]+\/[^/]+$/.test(path)) return 'gallery';
	if (/^content\/now\/[^/]+$/.test(path)) return 'now';
	if (/^assets\/img\/[^/]+$/.test(path)) return 'hero';
	if (/^static\/img\/[^/]+$/.test(path)) return 'site';
	return null;
}

/** A readable name for a file that refers to images: "Contact page", "Footer", "Stylesheet". */
export function describeFile(path: string): UsedBy {
	let m: RegExpExecArray | null;
	if (path.startsWith('content/now/')) return { label: 'Now page', href: '/pages/now' };
	if ((m = /^content\/([a-z-]+)(?:\.(?:fr|it))?\.md$/.exec(path))) {
		const name = m[1];
		return { label: `${name === 'privacy-policy' ? 'Privacy policy' : name[0].toUpperCase() + name.slice(1)} page`, href: `/pages/${name}` };
	}
	if ((m = /^layouts\/partials\/([a-z-]+)\.html$/.exec(path))) return { label: `${m[1][0].toUpperCase()}${m[1].slice(1).replace(/-/g, ' ')} (every page)` };
	if (path === 'layouts/index.html') return { label: 'Homepage' };
	if (path.startsWith('layouts/')) return { label: 'Site layout' };
	if (path === 'static/css/main.css') return { label: 'Stylesheet' };
	if (path === 'static/js/main.js') return { label: 'Site script' };
	if (path === 'hugo.toml') return { label: 'Site settings' };
	return { label: path };
}

/**
 * Does `text` mention this picture? A bundle picture is named relative to its
 * article, so the file name is the reference; a static file is named by its
 * served path. The name must stand alone: `a.png` is not in `data.png`.
 */
export function mentions(text: string, path: string, group: Group): boolean {
	const name = base(path);
	const needle = group === 'site' ? `/img/${name}` : name;
	const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?<![A-Za-z0-9._-])${esc}(?![A-Za-z0-9_-])`).test(text);
}

/** The slug of a blog bundle file, or null. */
const articleOf = (p: string) => /^content\/blog\/([^/]+)\//.exec(p)?.[1] ?? null;

export function buildLibrary(images: string[], texts: TextFile[], names: Names): MediaEntry[] {
	const out: MediaEntry[] = [];
	for (const path of images) {
		const group = groupOf(path);
		if (!group) continue;
		const name = base(path);
		let owner = 'site';
		let usedBy: UsedBy[] = [];

		if (group === 'articles') {
			const slug = articleOf(path)!;
			owner = slug;
			// Only the article's own files can name its pictures.
			const dir = `content/blog/${slug}/`;
			const hit = texts.some((t) => t.path.startsWith(dir) && /\.md$/.test(t.path) && mentions(t.text, path, group));
			if (hit) usedBy = [{ label: `Article · ${names.articles[slug] ?? slug}`, href: `/posts/${slug}` }];
		} else if (group === 'gallery') {
			const city = /^content\/gallery\/([^/]+)\//.exec(path)![1];
			owner = city;
			usedBy = [{ label: `Gallery · ${names.cities[city] ?? city}`, href: `/gallery/${city}` }];
		} else if (group === 'now') {
			// The Now page names its cover and logos in now.json, by file name.
			owner = 'now';
			const hit = texts.some((t) => t.path === 'content/now/now.json' && mentions(t.text, path, group));
			if (hit) usedBy = [{ label: 'Now page', href: '/pages/now' }];
		} else if (group === 'hero') {
			usedBy = [{ label: 'Homepage photo', href: '/settings' }];
		} else {
			const seen = new Set<string>();
			for (const t of texts) {
				if (!mentions(t.text, path, group)) continue;
				const d = describeFile(t.path);
				if (!seen.has(d.label)) {
					seen.add(d.label);
					usedBy.push(d);
				}
			}
		}

		out.push({
			path,
			name,
			group,
			owner,
			usedBy,
			unused: usedBy.length === 0,
			// The homepage photo is a pair of files replaced together, from Settings;
			// gallery photos are ordered and captioned with their city.
			canReplace: group === 'articles' || group === 'site' || group === 'now',
			canDelete: (group === 'articles' || group === 'now') && usedBy.length === 0
		});
	}
	return out.sort((a, b) => a.group.localeCompare(b.group) || a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export const GROUP_LABEL: Record<Group, string> = {
	articles: 'Articles',
	gallery: 'Gallery',
	site: 'Site',
	hero: 'Homepage photo',
	now: 'Now page'
};

/**
 * Whether `incoming` may take the place of the file at `path`: the same kind
 * of file, since every reference is by name and a `.png` that became a `.jpg`
 * would leave them all pointing at nothing.
 */
export function sameKind(path: string, incomingName: string): boolean {
	const ext = (s: string) => s.slice(s.lastIndexOf('.') + 1).toLowerCase().replace('jpeg', 'jpg');
	return ext(path) === ext(incomingName);
}
