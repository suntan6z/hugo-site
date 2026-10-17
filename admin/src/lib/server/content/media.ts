import { repo } from './repo.ts';
import { listPosts } from './post.ts';
import { parseCities } from './gallery-data.ts';
import { mapLimit, memo, invalidateAll } from '../cache.ts';
import { buildLibrary, groupOf, sameKind, type MediaEntry, type TextFile } from '../../media.ts';

/**
 * The Library's data: every image in the repository, and what refers to it.
 * What counts as an image and as a reference is lib/media.ts; this only reads.
 */

/** Where pictures live. Anything else in the repo is not the Library's business. */
const IMAGE_ROOTS = ['content/blog', 'content/gallery', 'static/img', 'assets/img'];

/** Where a picture can be named, so that nothing used is called unused. */
async function corpus(): Promise<TextFile[]> {
	const [content, layouts, blog] = await Promise.all([repo.listTree('content'), repo.listTree('layouts'), repo.listTree('content/blog')]);
	const paths = new Set<string>([
		...content.filter((p) => /^content\/[^/]+\.md$/.test(p)),
		...blog.filter((p) => /\.md$/.test(p)),
		...layouts.filter((p) => /\.(html|xml|json)$/.test(p)),
		'static/css/main.css',
		'static/js/main.js',
		'hugo.toml'
	]);
	const read = await mapLimit([...paths], 8, async (p) => ({ path: p, text: (await repo.readText(p)) ?? '' }));
	return read.filter((t) => t.text !== '');
}

export async function loadLibrary(): Promise<MediaEntry[]> {
	return memo('media:library', 5 * 60_000, async () => {
		const [trees, texts, posts, cities] = await Promise.all([
			Promise.all(IMAGE_ROOTS.map((r) => repo.listTree(r))),
			corpus(),
			listPosts(),
			repo.readText('data/gallery_cities.json').then(parseCities)
		]);
		return buildLibrary(
			trees.flat(),
			texts,
			{
				articles: Object.fromEntries(posts.map((p) => [p.slug, p.title])),
				cities: Object.fromEntries(cities.map((c) => [c.slug, c.name]))
			}
		);
	});
}

export class MediaError extends Error {}

const find = async (path: string) => {
	const entry = (await loadLibrary()).find((e) => e.path === path);
	if (!entry) throw new MediaError('That picture is not in the Library.');
	return entry;
};

/** Removes a picture, but only one nothing refers to: a used one would leave a broken image behind. */
export async function deleteImage(path: string): Promise<void> {
	const entry = await find(path);
	if (!entry.canDelete) throw new MediaError(entry.unused ? 'That picture cannot be deleted from here.' : 'Something still uses that picture.');
	await repo.commit(`Delete image ${entry.name}`, [{ path, delete: true }]);
	invalidateAll();
}

/** Puts new bytes under an existing name, so every reference keeps working. */
export async function replaceImage(path: string, filename: string, bytes: Uint8Array): Promise<void> {
	const entry = await find(path);
	if (!entry.canReplace) throw new MediaError('That picture is replaced somewhere else.');
	if (!sameKind(path, filename)) throw new MediaError(`Use a ${path.split('.').pop()!.toUpperCase()} file: other pictures refer to this one by name.`);
	if (bytes.byteLength === 0) throw new MediaError('The file is empty.');
	if (bytes.byteLength > 6 * 1024 * 1024) throw new MediaError('That file is over 6 MB. Make it smaller first.');
	await repo.commit(`Replace image ${entry.name}`, [{ path, bytes }]);
	invalidateAll();
}

/** Whether a path may be served to the Library: a picture, in a place pictures live. */
export const isLibraryPath = (p: string) => !p.includes('..') && !!groupOf(p);
