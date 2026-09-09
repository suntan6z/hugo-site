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

		// Images arrive already resized and re-encoded to WebP by the browser
		// (src/lib/client/image.ts), because the site's render hook serves bundle
		// resources at their committed size.
		const newImages: { name: string; bytes: Uint8Array }[] = [];
		for (const entry of f.getAll('newimage')) {
			if (!(entry instanceof File) || entry.size === 0) continue;
			if (entry.size > 4 * 1024 * 1024) {
				return fail(400, { message: `${entry.name} is over 4 MB after processing.` });
			}
			newImages.push({ name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
		}

		let deleteImages: string[] = [];
		try {
			deleteImages = JSON.parse(String(f.get('deleteimages') ?? '[]'));
		} catch {
			deleteImages = [];
		}
		// Never delete a file the post still references.
		const bodies = LANGS.map((l) => translations[l].body).join('\n');
		const stillUsed = deleteImages.filter(
			(n) => bodies.includes(n) || str('featured_image') === n || str('partner_logo_url') === n
		);
		if (stillUsed.length) {
			return fail(400, {
				message: `Still referenced, so not deleted: ${stillUsed.join(', ')}. Remove the reference first.`
			});
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
				newImages,
				deleteImages,
				message: `${publish ? 'Publish' : 'Update'} ${params.slug}`
			});
			await audit(publish ? 'publish' : 'save', {
				slug: params.slug,
				sha,
				images: newImages.map((i) => i.name),
				removed: deleteImages
			});
			return { success: true, sha, published: publish };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	}
};
