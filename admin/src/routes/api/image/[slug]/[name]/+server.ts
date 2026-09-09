import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { repo } from '$lib/server/content/repo.ts';
import { bundleDir } from '$lib/server/content/post.ts';

const TYPES: Record<string, string> = {
	webp: 'image/webp',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	svg: 'image/svg+xml'
};

/**
 * Serves a bundle image so the editor can preview what is already committed.
 * Needed because the portal is a different origin from the live site, and the
 * site's CSP sets frame-ancestors 'none' / img-src 'self'.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	if (!locals.session) error(404, 'Not found');

	// Both come from the URL, so keep them to a single safe path segment.
	if (!/^[a-z0-9-]+$/i.test(params.slug) || !/^[a-zA-Z0-9._-]+$/.test(params.name)) {
		error(400, 'Bad path');
	}
	const ext = params.name.split('.').pop()?.toLowerCase() ?? '';
	const type = TYPES[ext];
	if (!type) error(415, 'Not an image');

	const bytes = await repo.readBinary(`${bundleDir(params.slug)}/${params.name}`);
	if (!bytes) error(404, 'Not found');

	setHeaders({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300' });
	return new Response(bytes as BodyInit);
};
