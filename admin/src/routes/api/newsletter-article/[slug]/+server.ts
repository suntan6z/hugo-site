import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { newsletterArticle } from '$lib/server/content/newsletter-article.ts';

// Signed-in only (deny-by-default in hooks.server.ts). Read when an article is picked in the newsletter flow.
export const GET: RequestHandler = async ({ params }) => {
	const article = await newsletterArticle(params.slug);
	if (!article) error(404, 'Not a published article');
	return json(article, { headers: { 'Cache-Control': 'no-store' } });
};
