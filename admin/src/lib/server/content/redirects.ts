import { LANGS, type Lang } from '../langs.ts';

/**
 * The redirects a rename leaves behind (content/redirects/), read back as
 * something you can look after: which old address goes where, and whether
 * that still makes sense.
 *
 * A redirect is only ever written by rename.ts's redirectStub, one file per
 * language, so the three files for one old address are grouped back into one
 * row. Anything hand-written that does not follow that shape is still listed,
 * but only a blog redirect can be repointed from the portal.
 *
 * Free of I/O so the suite can drive it directly.
 */

export interface RedirectFile {
	path: string;
	/** The address it answers, e.g. /en/blog/old-name/ */
	from: string;
	/** Where it sends people, e.g. /en/blog/new-name/ */
	to: string;
}

export type RedirectProblem =
	/** It points at an article that no longer exists: a redirect into a 404. */
	| 'missing-target'
	/** It points at an address that is itself redirected: two hops, one of them wasted. */
	| 'chain'
	/** An article lives at the old address again, and two pages cannot share one URL. */
	| 'shadowed';

export interface RedirectGroup {
	/** The old article slug, or null for a redirect that is not a blog one. */
	oldSlug: string | null;
	/** Where the English version goes, as the representative target. */
	targetSlug: string | null;
	files: RedirectFile[];
	langs: Lang[];
	problems: RedirectProblem[];
}

const field = (raw: string, key: string) =>
	raw.match(new RegExp(`^${key}:\\s*"([^"]*)"\\s*$`, 'm'))?.[1] ?? null;

/** Reads one stub, or null when it is not a redirect at all. */
export function parseRedirect(path: string, raw: string): RedirectFile | null {
	if (!/^type:\s*"redirect"\s*$/m.test(raw)) return null;
	const from = field(raw, 'url');
	const to = field(raw, 'redirect_to');
	if (!from || !to) return null;
	return { path, from, to };
}

const BLOG = /^\/(en|fr|it)\/blog\/([a-z0-9-]+)\/$/;

export function blogSlugOf(url: string): { lang: Lang; slug: string } | null {
	const m = BLOG.exec(url);
	return m ? { lang: m[1] as Lang, slug: m[2] } : null;
}

/** Groups per old address, flags what is wrong, and sorts problems first. */
export function groupRedirects(files: RedirectFile[], articles: string[]): RedirectGroup[] {
	const known = new Set(articles);
	const byKey = new Map<string, RedirectFile[]>();
	for (const f of files) {
		const blog = blogSlugOf(f.from);
		const key = blog ? `blog:${blog.slug}` : `url:${f.from}`;
		byKey.set(key, [...(byKey.get(key) ?? []), f]);
	}
	const redirectedSlugs = new Set(
		[...byKey.keys()].filter((k) => k.startsWith('blog:')).map((k) => k.slice(5))
	);

	const groups = [...byKey.entries()].map(([key, group]): RedirectGroup => {
		const oldSlug = key.startsWith('blog:') ? key.slice(5) : null;
		const sorted = [...group].sort((a, b) => a.path.localeCompare(b.path));
		const en = sorted.find((f) => blogSlugOf(f.from)?.lang === 'en') ?? sorted[0];
		const targetSlug = blogSlugOf(en.to)?.slug ?? null;
		const problems: RedirectProblem[] = [];
		if (oldSlug) {
			const targets = new Set(sorted.map((f) => blogSlugOf(f.to)?.slug).filter(Boolean) as string[]);
			const lost = [...targets].filter((t) => !known.has(t));
			// A target that is gone but itself redirected still works, one hop later.
			if (lost.some((t) => !redirectedSlugs.has(t))) problems.push('missing-target');
			if (lost.some((t) => redirectedSlugs.has(t))) problems.push('chain');
			if (known.has(oldSlug)) problems.push('shadowed');
		}
		return {
			oldSlug,
			targetSlug,
			files: sorted,
			langs: LANGS.filter((l) => sorted.some((f) => blogSlugOf(f.from)?.lang === l)),
			problems
		};
	});

	return groups.sort(
		(a, b) =>
			b.problems.length - a.problems.length ||
			(a.oldSlug ?? a.files[0].from).localeCompare(b.oldSlug ?? b.files[0].from)
	);
}

export const PROBLEM_TEXT: Record<RedirectProblem, string> = {
	'missing-target': 'Points at an article that no longer exists, so visitors land on a 404.',
	chain: 'Points at an address that is itself redirected. Point it straight at the final article.',
	shadowed: 'An article uses this address again. Two pages cannot share one address, so remove this redirect.'
};
