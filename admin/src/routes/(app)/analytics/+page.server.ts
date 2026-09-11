import type { PageServerLoad, Actions } from './$types';
import { fetchBing, refreshBing, sum, ctr, trend } from '$lib/server/integrations/bing.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { invalidate } from '$lib/server/cache.ts';

export const load: PageServerLoad = async () => {
	const [bing, posts] = await Promise.all([fetchBing(), listPosts()]);

	// Join Bing's page URLs back to articles, which is the view that actually
	// informs what to write next — and, per language, where translating pays.
	const byPost = bing.data
		? bing.data.pages
				.map((p) => {
					const m = /\/(en|fr|it)\/blog\/([^/?#]+)\/?/.exec(p.url);
					return m ? { lang: m[1], slug: m[2], ...p } : null;
				})
				.filter((x): x is { lang: string; slug: string; url: string; clicks: number; impressions: number } => x !== null)
		: [];

	const known = new Set(posts.map((p) => p.slug));
	const perPost = [...
		byPost
			.filter((r) => known.has(r.slug))
			.reduce((map, r) => {
				const prev = map.get(r.slug) ?? { slug: r.slug, clicks: 0, impressions: 0, langs: {} as Record<string, number> };
				prev.clicks += r.clicks;
				prev.impressions += r.impressions;
				// Broken down by impressions, not clicks: a site early in its life
				// has impressions long before it has clicks, and a language column
				// of zeros would say nothing.
				prev.langs[r.lang] = (prev.langs[r.lang] ?? 0) + r.impressions;
				map.set(r.slug, prev);
				return map;
			}, new Map<string, { slug: string; clicks: number; impressions: number; langs: Record<string, number> }>())
			.values()
	].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

	const titles = Object.fromEntries(posts.map((p) => [p.slug, p.title]));
	const totals = bing.data ? sum(bing.data.traffic) : { clicks: 0, impressions: 0 };

	return {
		bing,
		siteUrl: integrations.siteUrl,
		totals: { ...totals, ctr: ctr(totals.clicks, totals.impressions) },
		trend: bing.data ? trend(bing.data.traffic) : { change: 0, enough: false },
		perPost: perPost.slice(0, 15),
		titles
	};
};

export const actions: Actions = {
	refresh: async () => {
		await refreshBing();
		invalidate('bing:');
		return { refreshed: true };
	}
};
