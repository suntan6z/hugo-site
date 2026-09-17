import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pageAt } from '$lib/server/content/page.ts';
import { changesSince } from '$lib/server/content/history.ts';
import { SHA_RE } from '$lib/server/content/revisions.ts';
import { isPageName, pageFile, LANGS } from '$lib/pages.ts';

/** One earlier version of a page, and what restoring it would change. Writes nothing. */
export const GET: RequestHandler = async ({ params }) => {
	const { name, sha } = params;
	if (!isPageName(name) || !SHA_RE.test(sha)) error(400, 'Bad request');
	const version = await pageAt(name, sha);
	if (!LANGS.some((l) => version[l].exists)) error(404, 'This page did not exist at that point.');
	const changes = await changesSince(LANGS.map((l) => pageFile(name, l)), sha);
	return json({ version, changes }, { headers: { 'Cache-Control': 'no-store' } });
};
