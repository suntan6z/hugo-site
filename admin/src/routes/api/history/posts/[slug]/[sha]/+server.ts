import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postAt, changesSince } from '$lib/server/content/history.ts';
import { validSlug } from '$lib/server/content/drafts.ts';
import { SHA_RE } from '$lib/server/content/revisions.ts';
import { bundleDir, fileFor, LANGS } from '$lib/server/content/post.ts';

/** One earlier version of an article, and what restoring it would change. Writes nothing. */
export const GET: RequestHandler = async ({ params }) => {
	if (!validSlug(params.slug) || !SHA_RE.test(params.sha)) error(400, 'Bad request');
	const version = await postAt(params.slug, params.sha);
	if (!version) error(404, 'This article did not exist at that point.');
	const changes = await changesSince(LANGS.map((l) => `${bundleDir(params.slug)}/${fileFor(l)}`), params.sha);
	return json({ version, changes }, { headers: { 'Cache-Control': 'no-store' } });
};
