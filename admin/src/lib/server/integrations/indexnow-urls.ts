/**
 * Which URLs a change touches, for IndexNow. Pure so the suite can check them
 * without a site address configured.
 */

/** All language variants of a blog post, which are separate indexable URLs. */
export const postUrls = (site: string, slug: string, langs: readonly string[]): string[] =>
	langs.map((l) => `${site}/${l}/blog/${slug}/`);

/**
 * The pages that list things: each language's home page and blog index. A new
 * article changes these as well, and they are where a crawler finds what is new.
 */
export const listUrls = (site: string, langs: readonly string[]): string[] =>
	langs.flatMap((l) => [`${site}/${l}/`, `${site}/${l}/blog/`]);

/** Just the home pages, which is what a gallery change touches. */
export const homeUrls = (site: string, langs: readonly string[]): string[] => langs.map((l) => `${site}/${l}/`);
