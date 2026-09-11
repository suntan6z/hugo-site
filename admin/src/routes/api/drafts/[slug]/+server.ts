import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readDraft, writeDraft, clearDraft, validSlug } from '$lib/server/content/drafts.ts';

// Signed-in only: deny-by-default in hooks.server.ts covers every method here.

export const GET: RequestHandler = async ({ params }) => {
	if (!validSlug(params.slug)) error(400, 'Bad slug');
	const draft = await readDraft(params.slug);
	return json({ draft }, { headers: { 'Cache-Control': 'no-store' } });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	if (!validSlug(params.slug)) error(400, 'Bad slug');
	let body: { baseHash?: unknown; post?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body must be JSON');
	}
	if (typeof body.baseHash !== 'string' || typeof body.post !== 'object' || body.post === null) {
		error(400, 'Expected { baseHash, post }');
	}
	const savedAt = new Date().toISOString();
	try {
		await writeDraft(params.slug, { savedAt, baseHash: body.baseHash, post: body.post });
	} catch (e) {
		error(413, e instanceof Error ? e.message : String(e));
	}
	return json({ savedAt });
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!validSlug(params.slug)) error(400, 'Bad slug');
	await clearDraft(params.slug);
	return new Response(null, { status: 204 });
};
