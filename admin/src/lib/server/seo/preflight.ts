import { repo } from '../content/repo.ts';
import { bundleDir, LANGS, type Post } from '../content/post.ts';
import { parseCities } from '../content/gallery-data.ts';
import { checkPost, type CheckablePost, type Finding } from './rules.ts';

export type { Finding } from './rules.ts';
export { errorsIn, warningsIn } from './rules.ts';

/** Gathers the repo-wide context the rules need, then runs them. */
export async function preflight(post: Post): Promise<Finding[]> {
	const [blogPaths, citiesRaw] = await Promise.all([
		repo.listTree('content/blog'),
		repo.readText('data/gallery_cities.json')
	]);

	const knownSlugs = [
		...new Set(
			blogPaths
				.map((p) => /^content\/blog\/([^/]+)\//.exec(p)?.[1])
				.filter((s): s is string => !!s)
		)
	];

	const bundleFiles = (await repo.listTree(bundleDir(post.slug))).map((p) => p.split('/').pop()!);

	const checkable: CheckablePost = {
		slug: post.slug,
		folder: post.slug,
		date: post.date,
		category: post.category,
		draft: post.draft,
		featuredImage: post.featured_image,
		partnerName: post.partner_name,
		partnerUrl: post.partner_url,
		partnerLogo: post.partner_logo_url,
		bundleFiles,
		knownSlugs,
		knownGalleryCities: parseCities(citiesRaw).map((c) => c.slug),
		translations: LANGS.map((l) => ({
			lang: l,
			exists: post.translations[l].exists,
			untranslated: post.translations[l].untranslated,
			title: post.translations[l].title,
			description: post.translations[l].description,
			body: post.translations[l].body
		}))
	};

	return checkPost(checkable);
}
