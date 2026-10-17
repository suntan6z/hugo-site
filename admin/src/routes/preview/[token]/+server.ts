import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPreview } from '$lib/server/content/previews.ts';
import { loadPost } from '$lib/server/content/post.ts';
import { readDraft } from '$lib/server/content/drafts.ts';
import { contentFor, previewPage } from '$lib/server/content/preview-link.ts';
import { integrations } from '$lib/server/env.ts';
import siteCss from '$lib/brand/site.css?raw';

/**
 * A draft, read by someone with the link and no account. One of the few routes
 * that answers without a session (see PUBLIC in auth/access.ts), so it is
 * deliberately small: read-only, no parameters except the language, and an
 * unknown, expired or revoked token is a plain 404 that says nothing about
 * which. The token is 192 random bits; the page is marked noindex and never
 * cached; its content security policy allows no script at all.
 */
export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
	const link = await getPreview(params.token);
	if (!link) error(404, 'Not found');
	const [saved, draft] = await Promise.all([loadPost(link.slug), readDraft(link.slug)]);
	if (!saved) error(404, 'Not found');

	const shown = contentFor(saved, draft, url.searchParams.get('lang') ?? 'en');
	const html = previewPage({ shown, link, siteCss, siteUrl: integrations.siteUrl, base: `/preview/${link.token}` });

	setHeaders({
		'Content-Type': 'text/html; charset=utf-8',
		'Cache-Control': 'private, no-store',
		'X-Robots-Tag': 'noindex, nofollow',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: ${integrations.siteUrl}; font-src 'self' ${integrations.siteUrl}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
	});
	return new Response(html);
};
