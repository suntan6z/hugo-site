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
	| { kind: 'featured-image'; slug: string; image: string }
	| { kind: 'translation'; slug: string; lang: Lang; title: string; description: string; body: string }
	| { kind: 'gallery-alt'; city: string; file: string; alt: string };

/** Fills one image's empty alt text, leaving the rest of the body byte-identical. */
export function setAltText(body: string, image: string, alt: string): string {
	const target = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`!\\[\\]\\(${target}((?:\\s+"[^"]*")?)\\)`);
	// Brackets would end the alt text early and break the link that follows.
	const safe = alt.replace(/[[\]]/g, '').trim();
	return body.replace(re, (_m, title: string) => `![${safe}](${image}${title})`);
}
