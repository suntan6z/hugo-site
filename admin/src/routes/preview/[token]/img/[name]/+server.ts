import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPreview } from '$lib/server/content/previews.ts';
import { repo } from '$lib/server/content/repo.ts';
import { bundleDir } from '$lib/server/content/post.ts';

const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', avif: 'image/avif' };

/**
 * A picture of the shared article, for the shared page: only from that
 * article's own folder, and only while the link is valid. (SVG is left out:
 * opened on its own it is a document, and nothing here needs one.)
 */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const link = await getPreview(params.token);
	if (!link) error(404, 'Not found');
	if (!/^[a-zA-Z0-9._-]+$/.test(params.name)) error(404, 'Not found');
	const type = TYPES[params.name.split('.').pop()?.toLowerCase() ?? ''];
	if (!type) error(404, 'Not found');

	const bytes = await repo.readBinary(`${bundleDir(link.slug)}/${params.name}`);
	if (!bytes) error(404, 'Not found');
	setHeaders({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' });
	return new Response(bytes as BodyInit);
};
