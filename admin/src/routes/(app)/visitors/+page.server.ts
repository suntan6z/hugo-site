import type { PageServerLoad, Actions } from './$types';
import { fetchVisitors, refreshVisitors } from '$lib/server/integrations/litlyx.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';

export const load: PageServerLoad = async () => {
	const [visitors, posts] = await Promise.all([fetchVisitors(), listPosts()]);
	const titles = Object.fromEntries(posts.map((p) => [p.slug, p.title]));
	const articles = visitors.data
		? Object.entries(visitors.data.byArticle)
				.filter(([slug]) => slug in titles)
				.map(([slug, v]) => ({ slug, title: titles[slug], ...v }))
				.sort((a, b) => b.total - a.total)
		: [];
	return {
		visitors,
		articles,
		// Articles nobody opened in the window: worth a newsletter mention, a share, or a better title.
		unread: visitors.data
			? posts.filter((p) => !p.draft && !(p.slug in visitors.data!.byArticle)).map((p) => ({ slug: p.slug, title: p.title }))
			: [],
		litlyxHost: integrations.litlyxHost,
		siteUrl: integrations.siteUrl
	};
};

export const actions: Actions = {
	refresh: async () => {
		refreshVisitors();
		return { refreshed: true };
	}
};
