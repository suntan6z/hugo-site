import type { PageServerLoad } from './$types';
import { listPosts, LANGS } from '$lib/server/content/post.ts';

export const load: PageServerLoad = async () => {
	const posts = await listPosts();
	return {
		posts,
		stats: {
			total: posts.length,
			drafts: posts.filter((p) => p.draft).length,
			// The homepage grid honours featured_image only — no body-image fallback —
			// so a post without one shows no thumbnail there at all.
			missingFeatured: posts.filter((p) => !p.featured_image).length,
			translationDebt: posts.flatMap((p) =>
				LANGS.filter((l) => l !== 'en' && !p.langs.includes(l)).map((l) => ({ slug: p.slug, lang: l }))
			)
		}
	};
};
