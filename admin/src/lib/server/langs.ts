/**
 * The site's languages, in the order they are shown.
 *
 * One pure module with no SvelteKit imports, so anything that needs the list
 * — including code the test runner loads directly — can have it without
 * dragging in the repo and its environment.
 */
export const LANGS = ['en', 'fr', 'it'] as const;
export type Lang = (typeof LANGS)[number];
