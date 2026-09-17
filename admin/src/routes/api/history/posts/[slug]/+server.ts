import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postHistory } from '$lib/server/content/history.ts';
import { validSlug } from '$lib/server/content/drafts.ts';

/** An article's saves, newest first. Signed-in only, like everything not listed in access.ts. */
export const GET: RequestHandler = async ({ params }) => {
	if (!validSlug(params.slug)) error(400, 'Bad slug');
	return json({ revisions: await postHistory(params.slug) }, { headers: { 'Cache-Control': 'no-store' } });
};
