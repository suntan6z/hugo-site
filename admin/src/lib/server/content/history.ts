import { repo } from './repo.ts';
import { FrontMatter } from './frontmatter.ts';
import { fileChange, type FileChange } from '../diff.ts';
import { LANGS } from '../langs.ts';
import {
	bundleDir, fileFor, readShared, readTranslation, emptyTranslation,
	type PostShared, type PostTranslation
} from './post.ts';
import type { Lang } from '../langs.ts';

/**
 * An article's earlier versions, read from git history. Restoring never
 * writes: the old text is handed to the editor, where it is reviewed and saved
 * like any other edit — so going back is itself a new, reversible commit.
 *
 * Images are not part of it. A version refers to images by name, and the
 * bundle keeps whatever images it has now.
 */

export const postHistory = (slug: string) => repo.history([bundleDir(slug)]);

export interface PostVersion {
	shared: PostShared;
	translations: Record<Lang, PostTranslation>;
}

export async function postAt(slug: string, sha: string): Promise<PostVersion | null> {
	const raws = await Promise.all(LANGS.map((l) => repo.readTextAt(`${bundleDir(slug)}/${fileFor(l)}`, sha)));
	let shared: PostShared | null = null;
	const translations = {} as Record<Lang, PostTranslation>;
	LANGS.forEach((l, i) => {
		const raw = raws[i];
		translations[l] = raw === null ? emptyTranslation(l) : readTranslation(l, raw);
		if (raw !== null) shared ??= readShared(slug, FrontMatter.parse(raw));
	});
	return shared ? { shared, translations } : null;
}

/**
 * What going back to `sha` would change, file by file, against what is
 * committed now: the same diff the editor's review shows before a save.
 */
export async function changesSince(paths: string[], sha: string): Promise<FileChange[]> {
	const out = await Promise.all(
		paths.map(async (p) => {
			const then = await repo.readTextAt(p, sha);
			// A file that did not exist yet is not removed by restoring: a save never
			// deletes a translation, so it would stay exactly as it is.
			return then === null ? null : fileChange(p, await repo.readText(p), then);
		})
	);
	return out.filter((c): c is FileChange => c !== null && c.status !== 'unchanged');
}
