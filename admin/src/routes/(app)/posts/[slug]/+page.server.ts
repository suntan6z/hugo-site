import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadPost, savePost, LANGS, type Lang, type PostTranslation } from '$lib/server/content/post.ts';
import { CATEGORIES } from '$lib/server/content/frontmatter.ts';
import { ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { audit } from '$lib/server/store/kv.ts';

export const load: PageServerLoad = async ({ params }) => {
	const post = await loadPost(params.slug);
	if (!post) error(404, `No article bundle at content/blog/${params.slug}`);
	return { post, categories: CATEGORIES };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const f = await request.formData();
		const str = (k: string) => String(f.get(k) ?? '').trim();

		const category = str('category');
		if (!(CATEGORIES as readonly string[]).includes(category)) {
			return fail(400, { message: `"${category}" is not one of the four valid categories.` });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(str('date'))) {
			return fail(400, { message: 'Date must be YYYY-MM-DD.' });
		}

		const existing = await loadPost(params.slug);
		if (!existing) return fail(404, { message: 'Article not found.' });

		const translations = {} as Record<Lang, PostTranslation>;
		for (const lang of LANGS) {
			translations[lang] = {
				lang,
				exists: existing.translations[lang].exists,
				title: str(`title_${lang}`),
				description: str(`description_${lang}`),
				body: String(f.get(`body_${lang}`) ?? ''),
				untranslated: f.get(`untranslated_${lang}`) === 'on',
				eu_funding_text: str(`eu_funding_text_${lang}`) || undefined
			};
		}

		const publish = f.get('intent') === 'publish';
		try {
			const { sha } = await savePost({
				shared: {
					slug: params.slug,
					date: str('date'),
					category: category as (typeof CATEGORIES)[number],
					draft: publish ? false : f.get('draft') === 'on',
					featured_image: str('featured_image') || undefined,
					partner_name: str('partner_name') || undefined,
					partner_url: str('partner_url') || undefined,
					partner_logo_url: str('partner_logo_url') || undefined,
					project_url: str('project_url') || undefined
				},
				translations,
				message: `${publish ? 'Publish' : 'Update'} ${params.slug}`
			});
			await audit(publish ? 'publish' : 'save', { slug: params.slug, sha });
			return { success: true, sha, published: publish };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	}
};
