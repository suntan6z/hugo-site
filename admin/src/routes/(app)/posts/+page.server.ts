import type { PageServerLoad } from './$types';
import { listPosts } from '$lib/server/content/post.ts';

export const load: PageServerLoad = async () => ({ posts: await listPosts() });
