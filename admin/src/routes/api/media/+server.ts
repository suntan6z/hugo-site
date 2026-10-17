import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { replaceImage, MediaError } from '$lib/server/content/media.ts';
import { audit } from '$lib/server/store/kv.ts';

/**
 * Replaces one existing picture, keeping its name. Used by the Library and by
 * the page editor's "Replace image". Signed-in only (the deny-by-default hook).
 * The client has already resized and re-encoded it; the repository strips any
 * metadata on the way in regardless.
 */
export const POST: RequestHandler = async ({ request }) => {
	const f = await request.formData();
	const path = String(f.get('path') ?? '');
	const file = f.get('file');
	if (!(file instanceof File)) error(400, 'No file.');
	try {
		await replaceImage(path, String(f.get('name') || file.name), new Uint8Array(await file.arrayBuffer()));
	} catch (e) {
		if (e instanceof MediaError) return json({ message: e.message }, { status: 400 });
		throw e;
	}
	await audit('image-replaced', { path });
	return json({ ok: true });
};
