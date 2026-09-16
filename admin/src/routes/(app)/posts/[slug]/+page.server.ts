import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	loadPost, savePost, planSave, describePlan, deletePost, renamePost, RenamePostError,
	LANGS, fromForm, type Lang, type PostTranslation, type SavePostInput
} from '$lib/server/content/post.ts';
import { CATEGORIES } from '$lib/server/content/frontmatter.ts';
import { ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { audit } from '$lib/server/store/kv.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { preflight, errorsIn, warningsIn } from '$lib/server/seo/preflight.ts';
import { queueUrls, postUrls, dequeueSlug } from '$lib/server/integrations/indexnow.ts';
import { clearDraft } from '$lib/server/content/drafts.ts';
import { isConfigured as canTranslate } from '$lib/server/integrations/deepl.ts';
import { fundingTextFor } from '$lib/server/content/erasmus.ts';
import { readScheduled, schedule as addSchedule, cancel as cancelSchedule } from '$lib/server/schedule/runner.ts';
import { whyNot, forSlug } from '$lib/server/schedule/plan.ts';
import { isConfigured as canSendNewsletter } from '$lib/server/integrations/resend.ts';
import { auth } from '$lib/server/env.ts';

export const load: PageServerLoad = async ({ params, url }) => {
	const post = await loadPost(params.slug);
	if (!post) error(404, `No article bundle at content/blog/${params.slug}`);
	return {
		post,
		categories: CATEGORIES,
		findings: await preflight(post),
		canTranslate: canTranslate(),
		scheduled: forSlug(await readScheduled(), params.slug),
		canSendNewsletter: canSendNewsletter(),
		// Without a token there is no trigger, so scheduled work waits for you to open the portal.
		canRunOnSchedule: !!auth.cronToken,
		// Set by the rename action's redirect, so the new page says what happened.
		renamedFrom: url.searchParams.get('renamed'),
		renamedRedirect: url.searchParams.get('kept') !== '0'
	};
};

/**
 * Reads the editor's form into everything a save needs.
 *
 * Shared by the save action and the review action so that what is previewed
 * and what is written can never drift: they are built from the same parse.
 */
type Parsed =
	| { ok: false; status: number; message: string }
	| {
			ok: true;
			input: SavePostInput;
			candidate: Parameters<typeof preflight>[0];
			publish: boolean;
			willBeDraft: boolean;
	  };

async function parseEditorForm(f: FormData, slug: string): Promise<Parsed> {
	const str = (k: string) => fromForm(f.get(k)).trim();

	const category = str('category');
	if (!(CATEGORIES as readonly string[]).includes(category)) {
		return { ok: false, status: 400, message: `"${category}" is not one of the four valid categories.` };
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(str('date'))) {
		return { ok: false, status: 400, message: 'Date must be YYYY-MM-DD.' };
	}

	const existing = await loadPost(slug);
	if (!existing) return { ok: false, status: 404, message: 'Article not found.' };

	const translations = {} as Record<Lang, PostTranslation>;
	for (const lang of LANGS) {
		translations[lang] = {
			lang,
			exists: existing.translations[lang].exists,
			title: str(`title_${lang}`),
			description: str(`description_${lang}`),
			body: fromForm(f.get(`body_${lang}`)),
			untranslated: f.get(`untranslated_${lang}`) === 'on',
			// Fixed wording, not something to type: see content/erasmus.ts.
			eu_funding_text: fundingTextFor(lang, category)
		};
	}

	// Images arrive already resized and re-encoded to WebP by the browser
	// (src/lib/client/image.ts), because the site's render hook serves bundle
	// resources at their committed size.
	const newImages: { name: string; bytes: Uint8Array }[] = [];
	for (const entry of f.getAll('newimage')) {
		if (!(entry instanceof File) || entry.size === 0) continue;
		if (entry.size > 4 * 1024 * 1024) {
			return { ok: false, status: 400, message: `${entry.name} is over 4 MB after processing.` };
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
		return {
			ok: false,
			status: 400,
			message: `Still referenced, so not deleted: ${stillUsed.join(', ')}. Remove the reference first.`
		};
	}

	// Explicit, per-language, and never inferred from an empty field.
	const deleteTranslations = LANGS.filter((l) => l !== 'en' && f.get(`delete_translation_${l}`) === 'on');

	const publish = f.get('intent') === 'publish';
	const willBeDraft = publish ? false : f.get('draft') === 'on';

	const shared = {
		slug,
		date: str('date'),
		category: category as (typeof CATEGORIES)[number],
		draft: willBeDraft,
		featured_image: str('featured_image') || undefined,
		partner_name: str('partner_name') || undefined,
		partner_url: str('partner_url') || undefined,
		partner_logo_url: str('partner_logo_url') || undefined,
		project_url: str('project_url') || undefined
	};

	return {
		ok: true,
		publish,
		willBeDraft,
		input: {
			shared,
			translations,
			newImages,
			deleteImages,
			deleteTranslations,
			message: `${publish ? 'Publish' : 'Update'} ${slug}`
		},
		candidate: {
			...existing,
			...shared,
			translations,
			images: [...existing.images.filter((i) => !deleteImages.includes(i)), ...newImages.map((i) => i.name)]
		}
	};
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const parsed = await parseEditorForm(await request.formData(), params.slug);
		if (!parsed.ok) return fail(parsed.status, { message: parsed.message });
		const { input, candidate, publish, willBeDraft } = parsed;

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
			const { sha } = await savePost(input);
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
					(l) => input.translations[l].title.trim() && !input.translations[l].untranslated
				);
				await queueUrls(postUrls(params.slug, langs));
			}
			await audit(publish ? 'publish' : 'save', {
				slug: params.slug,
				sha,
				images: (input.newImages ?? []).map((i) => i.name),
				removed: input.deleteImages
			});
			return { success: true, sha, published: publish, findings: warningsIn(findings) };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	},

	/**
	 * The exact commit this form would make, without making it. Same parse and
	 * same planner as the save itself, so the preview cannot lie.
	 */
	review: async ({ request, params }) => {
		const parsed = await parseEditorForm(await request.formData(), params.slug);
		if (!parsed.ok) return fail(parsed.status, { message: parsed.message });
		const changes = await describePlan(await planSave(parsed.input));
		return {
			review: {
				changes,
				message: parsed.input.message,
				publish: parsed.publish,
				draft: parsed.willBeDraft
			}
		};
	},

	/** Publishes later, optionally announcing it once the site has rebuilt. */
	schedule: async ({ request, params }) => {
		const f = await request.formData();
		const local = fromForm(f.get('at')).trim();
		if (!local) return fail(400, { message: 'Pick a date and time.' });
		// <input type="datetime-local"> carries no timezone: it means the clock on
		// the machine it was typed on, so the browser sends that clock's offset
		// with it. Parsing it here without that would silently use the server's
		// timezone — UTC in the container, not UTC wherever you are.
		const offset = Number(f.get('offset') ?? 0);
		if (!Number.isFinite(offset) || Math.abs(offset) > 14 * 60) {
			return fail(400, { message: 'That time zone makes no sense.' });
		}
		const picked = Date.parse(`${local}:00Z`);
		if (Number.isNaN(picked)) return fail(400, { message: 'That is not a date and time.' });
		const at = new Date(picked - offset * 60_000).toISOString();

		const bad = whyNot(at);
		if (bad) return fail(400, { message: bad });

		const post = await loadPost(params.slug);
		if (!post) return fail(404, { message: 'Article not found.' });

		// Scheduling something that would be refused at publish time is a trap:
		// it fails silently later, at the worst moment.
		const findings = await preflight({ ...post, draft: false });
		const errs = errorsIn(findings);
		if (errs.length > 0) {
			return fail(422, {
				message: `Not scheduled — ${errs.length} problem${errs.length === 1 ? '' : 's'} would block publishing.`,
				findings
			});
		}

		const newsletter = f.get('newsletter') === 'on';
		await addSchedule({
			slug: params.slug,
			at,
			newsletter,
			state: 'pending',
			createdAt: new Date().toISOString()
		});
		await audit('schedule', { slug: params.slug, at, newsletter });
		return { scheduled: true, at, newsletter };
	},

	unschedule: async ({ params }) => {
		const removed = await cancelSchedule(params.slug);
		if (removed) await audit('unschedule', { slug: params.slug });
		return { unscheduled: removed };
	},

	rename: async ({ request, params }) => {
		const f = await request.formData();
		const next = fromForm(f.get('slug')).trim().toLowerCase();
		// The redirect is opt-out, not opt-in: without it the old address keeps
		// serving the old page forever, because StaticHost never prunes.
		const keepOld = fromForm(f.get('redirect')) !== 'off';

		const post = await loadPost(params.slug);
		if (!post) return fail(404, { message: 'Article not found.' });

		try {
			const r = await renamePost(params.slug, next, { redirect: keepOld });
			// The old URLs are dead and the new ones are not built yet, so the
			// queue is rebuilt around the new slug rather than pinged now.
			await dequeueSlug(params.slug);
			if (!post.draft) await queueUrls(postUrls(next, LANGS.filter((l) => post.translations[l].exists)));
			await clearDraft(params.slug).catch(() => {});
			await recordPublish({ sha: r.sha, at: new Date().toISOString(), slug: next });
			await audit('rename-post', {
				from: params.slug,
				to: next,
				sha: r.sha,
				files: r.moved,
				relinked: r.relinked,
				redirect: r.redirected
			});
			redirect(303, `/posts/${next}?renamed=${encodeURIComponent(params.slug)}${keepOld ? '' : '&kept=0'}`);
		} catch (e) {
			if (isRedirect(e)) throw e;
			if (e instanceof RenamePostError) return fail(400, { message: e.message });
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
