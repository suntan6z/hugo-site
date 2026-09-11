import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadPost, savePost, deletePost, LANGS, fromForm, type Lang, type PostTranslation } from '$lib/server/content/post.ts';
import { CATEGORIES } from '$lib/server/content/frontmatter.ts';
import { ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { audit } from '$lib/server/store/kv.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { preflight, errorsIn, warningsIn } from '$lib/server/seo/preflight.ts';
import { queueUrls, postUrls, dequeueSlug } from '$lib/server/integrations/indexnow.ts';
import { clearDraft } from '$lib/server/content/drafts.ts';

export const load: PageServerLoad = async ({ params }) => {
	const post = await loadPost(params.slug);
	if (!post) error(404, `No article bundle at content/blog/${params.slug}`);
	return { post, categories: CATEGORIES, findings: await preflight(post) };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const f = await request.formData();
		const str = (k: string) => fromForm(f.get(k)).trim();

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
				body: fromForm(f.get(`body_${lang}`)),
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

		// Explicit, per-language, and never inferred from an empty field.
		const deleteTranslations = LANGS.filter(
			(l) => l !== 'en' && f.get(`delete_translation_${l}`) === 'on'
		);

		const publish = f.get('intent') === 'publish';
		const willBeDraft = publish ? false : f.get('draft') === 'on';

		/**
		 * The gate is about whether the result will be publicly visible, not
		 * about which button was pressed. Checking `intent === 'publish'` alone
		 * left an obvious hole: pressing Save on an already-published article
		 * writes draft: false and goes live having skipped every check.
		 *
		 * Errors block; warnings never do — they are judgement calls, and a
		 * check that refuses to ship a 118-character description would just get
		 * worked around. Drafts skip the gate entirely: work in progress is
		 * supposed to be incomplete.
		 */
		let findings: Awaited<ReturnType<typeof preflight>> = [];
		if (!willBeDraft) {
			const candidate = {
				...existing,
				slug: params.slug,
				date: str('date'),
				category: category as (typeof CATEGORIES)[number],
				draft: willBeDraft,
				featured_image: str('featured_image') || undefined,
				partner_name: str('partner_name') || undefined,
				partner_url: str('partner_url') || undefined,
				partner_logo_url: str('partner_logo_url') || undefined,
				project_url: str('project_url') || undefined,
				translations,
				images: [
					...existing.images.filter((i) => !deleteImages.includes(i)),
					...newImages.map((i) => i.name)
				]
			};
			findings = await preflight(candidate);
			const errs = errorsIn(findings);
			if (errs.length > 0) {
				return fail(422, {
					message: `Not saved — ${errs.length} problem${errs.length === 1 ? '' : 's'} must be fixed before this can be publicly visible. Tick “Draft” to save work in progress.`,
					findings
				});
			}
		}

		try {
			const { sha } = await savePost({
				shared: {
					slug: params.slug,
					date: str('date'),
					category: category as (typeof CATEGORIES)[number],
					draft: willBeDraft,
					featured_image: str('featured_image') || undefined,
					partner_name: str('partner_name') || undefined,
					partner_url: str('partner_url') || undefined,
					partner_logo_url: str('partner_logo_url') || undefined,
					project_url: str('project_url') || undefined
				},
				translations,
				newImages,
				deleteImages,
				deleteTranslations,
				message: `${publish ? 'Publish' : 'Update'} ${params.slug}`
			});
			// Recorded so the dashboard can tell whether StaticHost has caught up.
			// A draft save changes the built output too (the page disappears), so
			// both count as something the build has to reflect.
			await recordPublish({ sha, at: new Date().toISOString(), slug: params.slug });
			// The committed version supersedes any autosaved work in progress.
			await clearDraft(params.slug).catch(() => {});
			if (publish) {
				// Queued rather than submitted: StaticHost has not rebuilt yet, so
				// the URL would still 404. The dashboard submits once it sees the
				// deploy go live.
				const langs = LANGS.filter(
					(l) => translations[l].title.trim() && !translations[l].untranslated
				);
				await queueUrls(postUrls(params.slug, langs));
			}
			await audit(publish ? 'publish' : 'save', {
				slug: params.slug,
				sha,
				images: newImages.map((i) => i.name),
				removed: deleteImages
			});
			return { success: true, sha, published: publish, findings: warningsIn(findings) };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	},

	delete: async ({ request, params }) => {
		const f = await request.formData();
		// Typing the slug is the confirmation: this removes every language file
		// and every image in the bundle, recoverable only from git history.
		if (fromForm(f.get('confirm')).trim() !== params.slug) {
			return fail(400, { message: `Type "${params.slug}" to confirm deletion.` });
		}
		try {
			const { sha, files } = await deletePost(params.slug);
			await dequeueSlug(params.slug);
			await clearDraft(params.slug).catch(() => {});
			await recordPublish({ sha, at: new Date().toISOString(), slug: params.slug });
			await audit('delete-post', { slug: params.slug, sha, files: files.length });
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
		redirect(303, '/posts');
	}
};
