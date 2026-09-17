import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { repo } from '$lib/server/content/repo.ts';
import { HERO_JPEG } from '$lib/server/content/site-files.ts';

/**
 * The homepage photo as committed, for Settings to show next to "Replace". The
 * live site only serves resized copies under hashed names, so there is no
 * stable URL there to point at.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	const bytes = await repo.readBinary(HERO_JPEG);
	if (!bytes) error(404, 'Not found');
	setHeaders({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-cache' });
	return new Response(bytes as BodyInit);
};
