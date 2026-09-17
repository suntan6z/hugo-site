import type { Lang } from '../langs.ts';

/**
 * What one answered card changes, and the text transformations that apply it.
 *
 * Kept apart from session.ts so the transformations can be tested directly:
 * session.ts reads and writes the repo, this file only rewrites strings.
 */

export type Edit =
	| { kind: 'alt-text'; slug: string; lang: Lang; image: string; alt: string }
	| { kind: 'description'; slug: string; lang: Lang; description: string }
	| { kind: 'translation'; slug: string; lang: Lang; title: string; description: string; body: string }
	| { kind: 'gallery-alt'; city: string; file: string; alt: string }
	| {
			kind: 'dead-link';
			/** An article (by slug) or a standalone page (by name). */
			target: { type: 'post'; slug: string } | { type: 'page'; name: string };
			/** The language file whose text holds the link; absent for a front-matter field. */
			lang?: Lang;
			/** A front-matter link shared by every language, e.g. an Erasmus+ partner's site. */
			field?: 'partner_url' | 'project_url';
			url: string;
			/** Where it should point now, or null to keep the words and drop the link. */
			next: string | null;
	  };

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Repoints every link to `url` in a body, or with `next` null removes the link
 * and keeps its words. Markdown links and HTML anchors alike; a longer URL that
 * merely starts with this one is left alone.
 */
export function replaceLink(body: string, url: string, next: string | null): string {
	const u = literal(url);
	if (next !== null) {
		return body
			.replace(new RegExp(`(\\]\\(\\s*<?)${u}(?=>?(?:\\s+"[^"]*")?\\s*\\))`, 'g'), (_m, a: string) => `${a}${next}`)
			.replace(new RegExp(`(\\shref\\s*=\\s*["'])${u}(?=["'])`, 'g'), (_m, a: string) => `${a}${next}`)
			.replace(new RegExp(`<${u}>`, 'g'), `<${next}>`);
	}
	return body
		.replace(new RegExp(`\\[((?:[^\\]\\\\]|\\\\.)*)\\]\\(\\s*<?${u}>?(?:\\s+"[^"]*")?\\s*\\)`, 'g'), '$1')
		.replace(new RegExp(`<a\\b[^>]*\\shref\\s*=\\s*["']${u}["'][^>]*>([\\s\\S]*?)</a>`, 'gi'), '$1');
}

/** Fills one image's empty alt text, leaving the rest of the body byte-identical. */
export function setAltText(body: string, image: string, alt: string): string {
	const target = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`!\\[\\]\\(${target}((?:\\s+"[^"]*")?)\\)`);
	// Brackets would end the alt text early and break the link that follows.
	const safe = alt.replace(/[[\]]/g, '').trim();
	return body.replace(re, (_m, title: string) => `![${safe}](${image}${title})`);
}
