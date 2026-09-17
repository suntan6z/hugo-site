import type { PageServerLoad } from './$types';
import { listPosts } from '$lib/server/content/post.ts';
import { readScheduled } from '$lib/server/schedule/runner.ts';
import { fetchVisitors } from '$lib/server/integrations/litlyx.ts';

export const load: PageServerLoad = async () => {
	const [posts, scheduled] = await Promise.all([listPosts(), readScheduled()]);
	return {
		posts,
		// Which articles are waiting to go out, so the list says so before you
		// open one and wonder why it is still a draft.
		scheduled: Object.fromEntries(
			scheduled.filter((i) => i.state === 'pending').map((i) => [i.slug, i.at])
		),
		// Streamed, not awaited: the list shows at once and the numbers fill in.
		views: fetchVisitors().then((r) =>
			r.data ? { days: r.data.days, bySlug: Object.fromEntries(Object.entries(r.data.byArticle).map(([s, v]) => [s, v.total])) } : null
		)
	};
};
