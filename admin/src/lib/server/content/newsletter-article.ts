import { loadPost, LANGS, type Lang } from './post.ts';
import { integrations } from '../env.ts';
import { thumbnailOf, thumbnailUrl } from '../../thumbnail.ts';
import { articleUrl } from '../../newsletter-email.ts';

/**
 * An article as the newsletter flow needs it: what exists in each language, and
 * where each version lives. Read one article at a time (three small files), when
 * it is chosen, rather than every article's every language when the page opens.
 */
export interface NewsletterArticle {
	slug: string;
	imageUrl: string | null;
	/** Per language: is there a real translation, and what it says. A placeholder is not one. */
	translations: Record<Lang, { exists: boolean; title: string; description: string }>;
	urls: Record<Lang, string>;
}

export async function newsletterArticle(slug: string): Promise<NewsletterArticle | null> {
	if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
	const post = await loadPost(slug);
	if (!post || post.draft) return null;
	const image = thumbnailOf(post.featured_image, post.translations.en.body);
	const translations = Object.fromEntries(
		LANGS.map((l) => {
			const t = post.translations[l];
			return [l, { exists: t.exists && !t.untranslated && t.body.trim() !== '' && t.title.trim() !== '', title: t.title, description: t.description }];
		})
	) as NewsletterArticle['translations'];
	return {
		slug,
		imageUrl: image ? thumbnailUrl(integrations.siteUrl, slug, image) : null,
		translations,
		urls: Object.fromEntries(LANGS.map((l) => [l, articleUrl(integrations.siteUrl, slug, l)])) as Record<Lang, string>
	};
}
