import { repo, type FileOp } from './repo.ts';
import { FrontMatter } from './frontmatter.ts';
import { parsePage } from './page.ts';
import { LANGS, type Lang } from '../langs.ts';
import { pageFile } from '../../pages.ts';
import { NOW_DIR, NOW_JSON, NOW_ICONS, NOW_IMAGE_RE, SAFE_NAME, parseNow, serializeNow, unsafeSvg, usedFiles, type NowData } from '../../now.ts';

/**
 * Reading and writing the Now page (lib/now.ts says what it holds). A save is
 * one commit: now.json, the title and description of each language file, the
 * pictures uploaded with it, and the removal of pictures nothing uses any more
 * — a new cover each season would otherwise pile up in the folder.
 */

export interface NowMeta {
	title: string;
	description: string;
	exists: boolean;
}

export interface NowVersion {
	data: NowData;
	meta: Record<Lang, NowMeta>;
}

export interface NowPage extends NowVersion {
	/** The pictures in content/now/, by file name. */
	files: string[];
	/** Icon name → SVG path data, from data/now_icons.json. */
	icons: Record<string, string[]>;
}

export interface Upload {
	name: string;
	bytes: Uint8Array;
}

export class NowSaveError extends Error {}

const metaOf = (lang: Lang, raw: string | null): NowMeta => {
	const p = parsePage(lang, raw);
	return { title: p.title, description: p.description, exists: p.exists };
};

export async function nowFiles(): Promise<string[]> {
	return (await repo.listTree(NOW_DIR))
		.filter((p) => p.lastIndexOf('/') === NOW_DIR.length && NOW_IMAGE_RE.test(p))
		.map((p) => p.slice(NOW_DIR.length + 1));
}

async function readIcons(): Promise<Record<string, string[]>> {
	try {
		return JSON.parse((await repo.readText(NOW_ICONS)) ?? '{}');
	} catch {
		return {};
	}
}

export async function loadNow(): Promise<NowPage> {
	const [json, raws, files, icons] = await Promise.all([
		repo.readText(NOW_JSON),
		Promise.all(LANGS.map((l) => repo.readText(pageFile('now', l)))),
		nowFiles(),
		readIcons()
	]);
	return {
		data: parseNow(json),
		meta: Object.fromEntries(LANGS.map((l, i) => [l, metaOf(l, raws[i])])) as NowVersion['meta'],
		files,
		icons
	};
}

/** The page as it was at a commit: what the history panel compares and restores. */
export async function nowAt(sha: string): Promise<NowVersion | null> {
	const [json, ...raws] = await Promise.all([repo.readTextAt(NOW_JSON, sha), ...LANGS.map((l) => repo.readTextAt(pageFile('now', l), sha))]);
	if (json === null) return null;
	return {
		data: parseNow(json),
		meta: Object.fromEntries(LANGS.map((l, i) => [l, metaOf(l, raws[i])])) as NowVersion['meta']
	};
}

export const nowPaths = () => [NOW_JSON, ...LANGS.map((l) => pageFile('now', l))];
export const nowHistory = () => repo.history([NOW_DIR]);

/**
 * The writes a save would make, only for what actually changes. Uploads that
 * the page does not end up using are dropped; pictures it no longer uses are
 * deleted. A language file that does not exist yet is created only once it
 * has a title.
 */
export async function planNowSave(next: NowVersion, uploads: Upload[]): Promise<FileOp[]> {
	const ops: FileOp[] = [];
	const used = new Set(usedFiles(next.data));
	const existing = await nowFiles();

	for (const u of uploads) {
		if (!SAFE_NAME.test(u.name)) throw new NowSaveError(`“${u.name}” is not a usable file name.`);
		if (u.bytes.byteLength === 0) throw new NowSaveError(`${u.name} is empty.`);
		if (u.bytes.byteLength > 4 * 1024 * 1024) throw new NowSaveError(`${u.name} is over 4 MB after processing.`);
		if (u.name.endsWith('.svg') && unsafeSvg(u.bytes)) throw new NowSaveError(`${u.name} contains scripts or embedded content. Export a plain SVG.`);
		if (used.has(u.name)) ops.push({ path: `${NOW_DIR}/${u.name}`, bytes: u.bytes });
	}

	const raw = await repo.readText(NOW_JSON);
	const json = serializeNow(next.data);
	if (json !== raw) ops.push({ path: NOW_JSON, content: json });

	for (const lang of LANGS) {
		const path = pageFile('now', lang);
		const m = next.meta[lang];
		const before = await repo.readText(path);
		if (before === null && !m.title.trim()) continue;
		const fm = before === null ? FrontMatter.empty() : FrontMatter.parse(before);
		fm.set('title', m.title.trim());
		if (m.description.trim() || fm.has('description')) fm.set('description', m.description.trim());
		if (before === null) {
			fm.set('type', 'now');
			fm.setBody('');
		}
		const out = fm.serialize();
		if (out !== before) ops.push({ path, content: out });
	}

	const uploaded = new Set(uploads.map((u) => u.name));
	for (const name of existing) {
		if (!used.has(name) && !uploaded.has(name)) ops.push({ path: `${NOW_DIR}/${name}`, delete: true });
	}
	return ops;
}
