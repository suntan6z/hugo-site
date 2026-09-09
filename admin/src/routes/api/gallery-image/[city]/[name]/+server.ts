import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { repo } from '$lib/server/content/repo.ts';

const TYPES: Record<string, string> = {
	webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif'
};

/** Serves a gallery photo so the manager can show what is already committed. */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	if (!locals.session) error(404, 'Not found');
	if (!/^[a-z0-9-]+$/i.test(params.city) || !/^[a-zA-Z0-9._-]+$/.test(params.name)) {
		error(400, 'Bad path');
	}
	const type = TYPES[params.name.split('.').pop()?.toLowerCase() ?? ''];
	if (!type) error(415, 'Not an image');

	const bytes = await repo.readBinary(`content/gallery/${params.city}/${params.name}`);
	if (!bytes) error(404, 'Not found');

	setHeaders({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300' });
	return new Response(bytes as BodyInit);
};
