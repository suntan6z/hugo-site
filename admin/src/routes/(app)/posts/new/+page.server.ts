import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createPost, slugify, listPosts, CreatePostError, fromForm } from '$lib/server/content/post.ts';
import { CATEGORIES } from '$lib/server/content/frontmatter.ts';
import { audit } from '$lib/server/store/kv.ts';

export const load: PageServerLoad = async () => ({
	categories: CATEGORIES,
	today: new Date().toISOString().slice(0, 10),
	existingSlugs: (await listPosts()).map((p) => p.slug)
});

export const actions: Actions = {
	create: async ({ request }) => {
		const f = await request.formData();
		const str = (k: string) => fromForm(f.get(k)).trim();

		const title = str('title');
		const category = str('category');
		const slug = slugify(str('slug') || title);
		const values = { title, slug, category, description: str('description'), date: str('date') };

		if (!title) return fail(400, { message: 'A title is required.', values });
		if (!slug) return fail(400, { message: 'That title produces an empty slug — set one manually.', values });
		if (!(CATEGORIES as readonly string[]).includes(category)) {
			return fail(400, { message: 'Pick one of the four categories.', values });
		}

		try {
			const { sha } = await createPost({ ...values, category: category as (typeof CATEGORIES)[number] });
			await audit('create-post', { slug, sha });
			redirect(303, `/posts/${slug}`);
		} catch (e) {
			// SvelteKit signals redirects by throwing, so let those through.
			if (e && typeof e === 'object' && 'status' in e && 'location' in e) throw e;
			return fail(e instanceof CreatePostError ? 400 : 500, {
				message: e instanceof Error ? e.message : String(e),
				values
			});
		}
	}
};
