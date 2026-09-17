import { repo, type FileOp } from './repo.ts';
import { FrontMatter } from './frontmatter.ts';
import { LANGS, type Lang } from '../langs.ts';
import { pageFile, type PageName } from '../../pages.ts';

/**
 * Reading and writing the standalone pages (see lib/pages.ts for what they are
 * and the rules they are checked against).
 *
 * Front matter is edited in place, like everywhere else, so a key the portal
 * does not know about survives a save. Only title and description are touched.
 */

export interface PageText {
	title: string;
	description: string;
	body: string;
}

export interface PageTranslation extends PageText {
	lang: Lang;
	exists: boolean;
}

export type PageVersion = Record<Lang, PageTranslation>;

export function parsePage(lang: Lang, raw: string | null): PageTranslation {
	if (raw === null) return { lang, exists: false, title: '', description: '', body: '' };
	const fm = FrontMatter.parse(raw);
	return {
		lang,
		exists: true,
		title: String(fm.get('title') ?? ''),
		description: String(fm.get('description') ?? ''),
		body: fm.body
	};
}

export async function loadPage(name: PageName): Promise<PageVersion> {
	const raws = await Promise.all(LANGS.map((l) => repo.readText(pageFile(name, l))));
	return Object.fromEntries(LANGS.map((l, i) => [l, parsePage(l, raws[i])])) as PageVersion;
}

/** The page as it was at a commit: what the history panel compares and restores. */
export async function pageAt(name: PageName, sha: string): Promise<PageVersion> {
	const raws = await Promise.all(LANGS.map((l) => repo.readTextAt(pageFile(name, l), sha)));
	return Object.fromEntries(LANGS.map((l, i) => [l, parsePage(l, raws[i])])) as PageVersion;
}

export const pageHistory = (name: PageName) => repo.history(LANGS.map((l) => pageFile(name, l)));

/**
 * The file writes a save would make: only files whose text actually changes,
 * and a language that has no file yet only once it has a title and a body.
 * Nothing here ever deletes a translation.
 */
export async function planPageSave(name: PageName, next: Record<Lang, PageText>): Promise<FileOp[]> {
	const ops: FileOp[] = [];
	for (const lang of LANGS) {
		const path = pageFile(name, lang);
		const t = next[lang];
		const raw = await repo.readText(path);
		if (raw === null && (!t.title.trim() || !t.body.trim())) continue;
		const fm = raw === null ? FrontMatter.empty() : FrontMatter.parse(raw);
		fm.set('title', t.title);
		if (t.description || fm.has('description')) fm.set('description', t.description);
		const out = fm.setBody(t.body).serialize();
		if (out !== raw) ops.push({ path, content: out });
	}
	return ops;
}
