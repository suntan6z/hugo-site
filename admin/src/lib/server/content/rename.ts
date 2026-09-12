import { LANGS, type Lang } from '../langs.ts';

/**
 * The pure half of renaming an article: what the old address should serve
 * afterwards, and how other articles' links to it are rewritten.
 *
 * Why redirects are not optional here: static/404.html bounces a path that is
 * missing its language prefix to /en/<path>, but deliberately leaves a path
 * that already has one alone — so a renamed /en/blog/<old>/ is not covered by
 * it. StaticHost also never prunes files a build no longer produces, so
 * without a stub the old URL keeps serving the old page at 200 forever:
 * stale, duplicated in search results, and never reaching the 404 fallback.
 *
 * Free of I/O so the suite can drive it directly.
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Where a renamed article's old address lives, one file per language prefix.
 *
 * They live in their own headless section so the content root stays the list
 * of real pages: `url` forces the output path regardless of where the file is.
 */
export const redirectPath = (oldSlug: string, lang: Lang) => `content/redirects/blog-${oldSlug}-${lang}.md`;

export function redirectStub(oldSlug: string, newSlug: string, lang: Lang): string {
	// Mirrors layouts/redirect/single.html's contract: `url` forces this exact
	// path (bypassing language prefixing), `redirect_to` is where it goes, and
	// build.list keeps it out of the sitemap and the search index.
	return [
		'---',
		'title: "Redirecting…"',
		'type: "redirect"',
		`url: "/${lang}/blog/${oldSlug}/"`,
		`redirect_to: "/${lang}/blog/${newSlug}/"`,
		'build:',
		'  list: false',
		'---',
		''
	].join('\n');
}

export const redirectStubs = (oldSlug: string, newSlug: string) =>
	LANGS.map((lang) => ({ path: redirectPath(oldSlug, lang), content: redirectStub(oldSlug, newSlug, lang) }));

/**
 * Rewrites links to a renamed article, with or without a language prefix, in
 * Markdown links and raw HTML alike. Anchors and query strings are preserved,
 * and a longer slug that merely starts with the old one is left alone.
 */
export function rewriteLinks(body: string, oldSlug: string, newSlug: string): string {
	const old = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return body.replace(
		new RegExp(`(/(?:en|fr|it))?/blog/${old}(/|(?=[)"'\\s#?]|$))`, 'g'),
		(_m, lang: string | undefined, tail: string) => `${lang ?? ''}/blog/${newSlug}${tail || '/'}`
	);
}

/**
 * A redirect left by an earlier rename points at the slug being renamed now.
 * Repointing it at the new one keeps one hop instead of a chain ending in a 404.
 */
export function repointStub(raw: string, oldSlug: string, newSlug: string): string | null {
	const m = raw.match(/^redirect_to:\s*"([^"]*)"\s*$/m);
	if (!m) return null;
	const next = rewriteLinks(m[1], oldSlug, newSlug);
	return next === m[1] ? null : raw.replace(m[0], `redirect_to: "${next}"`);
}
