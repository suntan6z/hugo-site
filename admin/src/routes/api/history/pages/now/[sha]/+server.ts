import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nowAt, nowPaths } from '$lib/server/content/now.ts';
import { changesSince } from '$lib/server/content/history.ts';
import { SHA_RE } from '$lib/server/content/revisions.ts';

/**
 * One earlier version of the Now page, and what restoring it would change.
 * Writes nothing. A version from before now.json existed (the page was
 * hand-written HTML then) has nothing to restore.
 */
export const GET: RequestHandler = async ({ params }) => {
	if (!SHA_RE.test(params.sha)) error(400, 'Bad request');
	const version = await nowAt(params.sha);
	if (!version) error(404, 'That version of the page was hand-written HTML, before it had its own editor.');
	const changes = await changesSince(nowPaths(), params.sha);
	return json({ version, changes }, { headers: { 'Cache-Control': 'no-store' } });
};
