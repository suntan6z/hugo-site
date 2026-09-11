import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { translateFields, isConfigured, DeepLError, type Fields, type Target } from '$lib/server/integrations/deepl.ts';
import { audit } from '$lib/server/store/kv.ts';
import { validSlug } from '$lib/server/content/drafts.ts';

// Signed-in only: deny-by-default in hooks.server.ts covers this route.
// Nothing is written here — the translation goes back to the editor, which
// saves only when the author does.

const MAX_CHARS = 150_000; // a long article is ~15k; this is a runaway guard

export const POST: RequestHandler = async ({ request }) => {
	if (!isConfigured()) error(503, 'Machine translation is not set up: add DEEPL_API_KEY.');
	if (!request.headers.get('content-type')?.startsWith('application/json')) error(415, 'Send JSON.');

	let body: { slug?: unknown; to?: unknown; fields?: Record<string, unknown> };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body must be JSON.');
	}
	const to = body.to;
	if (to !== 'fr' && to !== 'it') error(400, 'Target must be fr or it.');
	const slug = typeof body.slug === 'string' && validSlug(body.slug) ? body.slug : null;

	const f = body.fields ?? {};
	const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n') : '');
	const fields: Fields = { title: str(f.title), description: str(f.description), body: str(f.body) };
	if (typeof f.eu_funding_text === 'string' && f.eu_funding_text) fields.eu_funding_text = str(f.eu_funding_text);

	const total = Object.values(fields).reduce((n, v) => n + (v?.length ?? 0), 0);
	if (total === 0) error(400, 'The English version is empty — nothing to translate.');
	if (total > MAX_CHARS) error(413, `That is ${total} characters; the limit is ${MAX_CHARS}.`);

	try {
		const r = await translateFields(fields, to as Target);
		await audit('translate', { slug, to, characters: r.characters });
		return json(r, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		if (e instanceof DeepLError) error(e.status === 403 || e.status === 456 ? 502 : e.status, e.message);
		error(502, 'DeepL could not be reached.');
	}
};
