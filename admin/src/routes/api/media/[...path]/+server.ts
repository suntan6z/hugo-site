import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { repo } from '$lib/server/content/repo.ts';
import { isLibraryPath } from '$lib/server/content/media.ts';

const TYPES: Record<string, string> = {
	webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
	svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif'
};

/**
 * Serves any picture the Library lists, so it can be shown beside its details.
 * The portal is another origin from the live site, whose CSP forbids framing
 * and hotlinking. Only picture files in the places pictures live are served,
 * and an SVG is sandboxed so a script inside one can never run in the portal.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	if (!locals.session) error(404, 'Not found');
	const path = params.path;
	if (!isLibraryPath(path)) error(404, 'Not found');

	const bytes = await repo.readBinary(path);
	if (!bytes) error(404, 'Not found');

	setHeaders({
		'Content-Type': TYPES[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream',
		'Cache-Control': 'private, max-age=60',
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
	});
	return new Response(bytes as BodyInit);
};
