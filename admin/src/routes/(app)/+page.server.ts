import type { PageServerLoad } from './$types';
import { fetchBuildInfo, readLastPublish, deployStatus } from '$lib/server/integrations/buildinfo.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { readQueue, submitQueued } from '$lib/server/integrations/indexnow.ts';
import { audit } from '$lib/server/store/kv.ts';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

const LANGS = ['en', 'fr', 'it'] as const;

export const load: PageServerLoad = async ({ url }) => {
	const [info, last, posts, indexNowQueue] = await Promise.all([
		fetchBuildInfo(url.searchParams.has('refresh')),
		readLastPublish(),
		listPosts(),
		readQueue()
	]);

	const status = deployStatus(info, last);

	/**
	 * Counts come from the published manifest when it is available, because it
	 * distinguishes a real translation from an `untranslated` placeholder — the
	 * repo file listing alone cannot. Falls back to the repo when the site is
	 * unreachable, which over-counts translations but is better than nothing.
	 */
	const translationDebt = info
		? info.posts.flatMap((p) =>
				LANGS.filter((l) => !p.langs.includes(l)).map((l) => ({ slug: p.slug, lang: l }))
			)
		: posts.flatMap((p) =>
				LANGS.filter((l) => !p.langs.includes(l)).map((l) => ({ slug: p.slug, lang: l }))
			);

	const missingFeatured = info
		? info.posts.filter((p) => !p.featured).map((p) => p.slug)
		: posts.filter((p) => !p.featured_image).map((p) => p.slug);

	return {
		posts: posts.slice(0, 8),
		status,
		siteUrl: integrations.siteUrl,
		indexNow: {
			configured: !!integrations.indexNowKey,
			queued: indexNowQueue.map((q) => q.url)
		},
		fromManifest: !!info,
		stats: {
			total: posts.length,
			drafts: posts.filter((p) => p.draft).length,
			missingFeatured,
			translationDebt
		}
	};
};

export const actions: Actions = {
	indexnow: async () => {
		const r = await submitQueued();
		await audit('indexnow-submit', { ok: r.ok, status: r.status, submitted: r.submitted });
		return r.ok ? { indexNow: r.detail } : fail(502, { message: r.detail });
	}
};
