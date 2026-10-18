import type { PageServerLoad, Actions } from './$types';
import { fetchVisitors, fetchLive, refreshVisitors, withShare, stayLabel } from '$lib/server/integrations/litlyx.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';

export const load: PageServerLoad = async () => {
	const [visitors, posts, live] = await Promise.all([fetchVisitors(), listPosts(), fetchLive()]);
	const titles = Object.fromEntries(posts.map((p) => [p.slug, p.title]));
	const articles = visitors.data
		? Object.entries(visitors.data.byArticle)
				.filter(([slug]) => slug in titles)
				.map(([slug, v]) => ({ slug, title: titles[slug], ...v }))
				.sort((a, b) => b.total - a.total)
		: [];

	// The numbers as the page shows them. The helpers live under lib/server, which the
	// browser may not import, so shares and stays are worked out here.
	const b = visitors.data?.breakdown;
	const who = b && {
		devices: withShare(b.devices),
		browsers: withShare(b.browsers),
		systems: withShare(b.systems)
	};
	const campaigns = b && {
		sources: withShare(b.sources),
		mediums: withShare(b.mediums),
		campaigns: withShare(b.campaigns)
	};
	const visit = visitors.data?.engagement;

	return {
		visitors,
		articles,
		// Articles nobody opened in the window: worth a newsletter mention, a share, or a better title.
		unread: visitors.data
			? posts.filter((p) => !p.draft && !(p.slug in visitors.data!.byArticle)).map((p) => ({ slug: p.slug, title: p.title }))
			: [],
		who,
		campaigns,
		entryPages: b?.entryPages ?? [],
		exitPages: b?.exitPages ?? [],
		stays: (visitors.data?.durations ?? []).slice(0, 10).map((d) => ({ ...d, stay: stayLabel(d.seconds) })),
		engagement: visit && {
			bounceRate: visit.bounceRate === null ? null : Math.round(visit.bounceRate),
			visitLength: visit.sessionSeconds === null ? null : stayLabel(visit.sessionSeconds)
		},
		live,
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
