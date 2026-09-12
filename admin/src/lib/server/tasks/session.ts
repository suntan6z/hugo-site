import { repo, type FileOp } from '../content/repo.ts';
import { store } from '../store/kv.ts';
import { FrontMatter } from '../content/frontmatter.ts';
import { bundleDir, fileFor, loadPost, renderFile } from '../content/post.ts';
import { LANGS, type Lang } from '../langs.ts';
import { parsePhotos, writePhotos, photoKey, type GalleryPhoto } from '../content/gallery-data.ts';
import { setAltText, type Edit } from './edits.ts';

export type { Edit };

/**
 * Focus mode's batch: the edits made one card at a time, held back until you
 * leave, then written as a single commit.
 *
 * Why hold them: every commit is a site rebuild, and answering twelve small
 * questions should cost one build, not twelve. The edits are kept as
 * intentions ("this image gets this alt text") rather than as file contents,
 * so they are applied against whatever the files say at the end — a save made
 * elsewhere in between cannot be silently overwritten by a stale copy.
 */

export interface Session {
	startedAt: string;
	edits: Edit[];
	/** Task ids finished in this session, so the queue does not re-offer them. */
	done: string[];
}

const KEY = 'state/focus-session';
const SNOOZE_KEY = 'state/snoozed';

export const readSession = async (): Promise<Session> =>
	(await store.get<Session>(KEY)) ?? { startedAt: new Date().toISOString(), edits: [], done: [] };

export const writeSession = (s: Session) => store.put(KEY, s);
export const clearSession = () => store.del(KEY);

export const readSnoozed = async (): Promise<Record<string, string>> =>
	(await store.get<Record<string, string>>(SNOOZE_KEY)) ?? {};

export async function snooze(id: string, until: string): Promise<void> {
	const all = await readSnoozed();
	all[id] = until;
	// Drop expired entries while we are here, so the list cannot grow forever.
	const now = Date.now();
	for (const [k, v] of Object.entries(all)) if (Date.parse(v) <= now) delete all[k];
	await store.put(SNOOZE_KEY, all);
}

/**
 * Turns the batch into file operations, reading each file once and applying
 * every edit that touches it in order.
 */
export async function planSession(edits: Edit[]): Promise<FileOp[]> {
	const files = new Map<string, string>();
	const original = new Map<string, string>();
	const read = async (path: string): Promise<string | null> => {
		if (files.has(path)) return files.get(path)!;
		const raw = await repo.readText(path);
		if (raw !== null) {
			files.set(path, raw);
			original.set(path, raw);
		}
		return raw;
	};

	let photos: GalleryPhoto[] | null = null;
	const PHOTOS = 'data/gallery_photos.json';

	for (const e of edits) {
		if (e.kind === 'gallery-alt') {
			photos ??= parsePhotos(await repo.readText(PHOTOS));
			const key = photoKey(e.city, e.file);
			const found = photos.find((p) => p.image_url === key);
			if (found) found.alt_text = e.alt;
			else photos.push({ city: e.city, image_url: key, caption: '', alt_text: e.alt });
			continue;
		}

		if (e.kind === 'translation') {
			// Built from the English file's shared fields, so a new translation
			// carries the same date, category and partner details.
			const post = await loadPost(e.slug);
			if (!post) continue;
			const path = `${bundleDir(e.slug)}/${fileFor(e.lang)}`;
			files.set(
				path,
				await renderFile(e.slug, post, {
					lang: e.lang,
					exists: true,
					title: e.title,
					description: e.description,
					body: e.body,
					untranslated: false,
					eu_funding_text: post.translations[e.lang].eu_funding_text
				})
			);
			continue;
		}

		if (e.kind === 'featured-image') {
			// A shared field: it belongs in every language's file.
			for (const lang of LANGS) {
				const path = `${bundleDir(e.slug)}/${fileFor(lang)}`;
				const raw = await read(path);
				if (raw === null) continue;
				const fm = FrontMatter.parse(raw);
				fm.set('featured_image', e.image);
				files.set(path, fm.serialize());
			}
			continue;
		}

		const path = `${bundleDir(e.slug)}/${fileFor(e.lang)}`;
		const raw = await read(path);
		if (raw === null) continue;
		const fm = FrontMatter.parse(raw);
		if (e.kind === 'description') fm.set('description', e.description);
		else fm.setBody(setAltText(fm.body, e.image, e.alt));
		files.set(path, fm.serialize());
	}

	// A card answered with exactly what was already there is not a change.
	const ops: FileOp[] = [...files]
		.filter(([path, content]) => original.get(path) !== content)
		.map(([path, content]) => ({ path, content }));
	if (photos) ops.push({ path: PHOTOS, content: writePhotos(photos) });
	return ops;
}
