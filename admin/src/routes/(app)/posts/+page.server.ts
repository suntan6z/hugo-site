import type { PageServerLoad } from './$types';
import { listPosts } from '$lib/server/content/post.ts';
import { readScheduled } from '$lib/server/schedule/runner.ts';

export const load: PageServerLoad = async () => {
	const [posts, scheduled] = await Promise.all([listPosts(), readScheduled()]);
	return {
		posts,
		// Which articles are waiting to go out, so the list says so before you
		// open one and wonder why it is still a draft.
		scheduled: Object.fromEntries(
			scheduled.filter((i) => i.state === 'pending').map((i) => [i.slug, i.at])
		)
	};
};
