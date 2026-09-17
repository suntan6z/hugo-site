import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pageHistory } from '$lib/server/content/page.ts';
import { isPageName } from '$lib/pages.ts';

/** A page's saves across its three language files, newest first. */
export const GET: RequestHandler = async ({ params }) => {
	if (!isPageName(params.name)) error(404, 'No such page');
	return json({ revisions: await pageHistory(params.name) }, { headers: { 'Cache-Control': 'no-store' } });
};
