import { repo, type FileOp } from './repo.ts';
import { memo, mapLimit, DEFAULT_TTL_MS } from '../cache.ts';
import { FrontMatter, CATEGORIES, fromForm, type Category } from './frontmatter.ts';
import { SLUG_RE, redirectStubs, rewriteLinks, repointStub } from './rename.ts';
import { fileChange, type FileChange } from '../diff.ts';
import { LANGS, type Lang } from '../langs.ts';

export { fromForm };

export { LANGS, type Lang } from '../langs.ts';

/** English keeps the plain name; other languages get a locale-suffixed sibling. */
export const fileFor = (lang: Lang) => (lang === 'en' ? 'index.md' : `index.${lang}.md`);
export const bundleDir = (slug: string) => `content/blog/${slug}`;

/** Fields that must stay identical across a bundle's language files. */
export interface PostShared {
	slug: string;
	date: string;
	category: Category;
	draft: boolean;
	featured_image?: string;
	partner_name?: string;
	partner_url?: string;
	partner_logo_url?: string;
	project_url?: string;
}

/** Fields that differ per language. */
export interface PostTranslation {
	lang: Lang;
	exists: boolean;
	title: string;
	description: string;
	body: string;
	untranslated: boolean;
	eu_funding_text?: string;
}

export interface Post extends PostShared {
	translations: Record<Lang, PostTranslation>;
	/** Non-Markdown files in the bundle, i.e. the co-located images. */
	images: string[];
}

export interface PostSummary extends PostShared {
	title: string;
	description: string;
	/** Languages with a real file of their own (excluding untranslated stubs). */
	langs: Lang[];
	imageCount: number;
}

const empty = (lang: Lang): PostTranslation => ({
	lang,
	exists: false,
	title: '',
	description: '',
	body: '',
	untranslated: false
});

function readTranslation(lang: Lang, raw: string): PostTranslation {
	const fm = FrontMatter.parse(raw);
	return {
		lang,
		exists: true,
		title: String(fm.get('title') ?? ''),
		description: String(fm.get('description') ?? ''),
		body: fm.body,
		untranslated: fm.get('untranslated') === true,
		eu_funding_text: fm.has('eu_funding_text') ? String(fm.get('eu_funding_text')) : undefined
	};
}

function readShared(slug: string, fm: FrontMatter): PostShared {
	const cat = String(fm.get('category') ?? 'Technology');
	return {
		slug: String(fm.get('slug') ?? slug),
		date: String(fm.get('date') ?? ''),
		category: (CATEGORIES as readonly string[]).includes(cat) ? (cat as Category) : 'Technology',
		draft: fm.get('draft') === true,
		featured_image: fm.has('featured_image') ? String(fm.get('featured_image')) : undefined,
		partner_name: fm.has('partner_name') ? String(fm.get('partner_name')) : undefined,
		partner_url: fm.has('partner_url') ? String(fm.get('partner_url')) : undefined,
		partner_logo_url: fm.has('partner_logo_url') ? String(fm.get('partner_logo_url')) : undefined,
		project_url: fm.has('project_url') ? String(fm.get('project_url')) : undefined
	};
}

/** Every blog bundle, newest first. */
export async function listPosts(): Promise<PostSummary[]> {
	// Cached and parallel: one read per post done sequentially measured ~3.8s
	// against the GitHub API for 13 posts, which dominated every page load.
	return memo('posts:list', DEFAULT_TTL_MS, async () => {
		const paths = await repo.listTree('content/blog');
		const bySlug = new Map<string, string[]>();
		for (const p of paths) {
			const m = /^content\/blog\/([^/]+)\/(.+)$/.exec(p);
			if (!m) continue; // section _index.md files and content adapters live one level up
			const list = bySlug.get(m[1]) ?? [];
			list.push(m[2]);
			bySlug.set(m[1], list);
		}

		const entries = [...bySlug.entries()];
		const out = await mapLimit(entries, 6, async ([slug, files]) => {
			const primary = files.includes('index.md')
				? 'index.md'
				: files.find((f) => /^index\..+\.md$/.test(f));
			if (!primary) return null;

			const raw = await repo.readText(`${bundleDir(slug)}/${primary}`);
			if (raw === null) return null;
			const fm = FrontMatter.parse(raw);

			return {
				...readShared(slug, fm),
				title: String(fm.get('title') ?? slug),
				description: String(fm.get('description') ?? ''),
				langs: LANGS.filter((l) => files.includes(fileFor(l))),
				imageCount: files.filter((f) => !f.endsWith('.md')).length
			} satisfies PostSummary;
		});

		return out
			.filter((p): p is PostSummary => p !== null)
			.sort((a, b) => b.date.localeCompare(a.date));
	});
}

/** One bundle with all its language files. */
export async function loadPost(slug: string): Promise<Post | null> {
	const files = (await repo.listTree(bundleDir(slug))).map((p) => p.split('/').pop()!);
	if (files.length === 0) return null;

	// The three language files are independent reads; fetching them in sequence
	// tripled the editor's load time for no reason.
	const raws = await Promise.all(
		LANGS.map((lang) => repo.readText(`${bundleDir(slug)}/${fileFor(lang)}`))
	);

	const translations = {} as Record<Lang, PostTranslation>;
	let shared: PostShared | null = null;
	for (let i = 0; i < LANGS.length; i++) {
		const lang = LANGS[i];
		const raw = raws[i];
		if (raw === null) {
			translations[lang] = empty(lang);
			continue;
		}
		translations[lang] = readTranslation(lang, raw);
		// Shared front matter is identical across languages; take the first found.
		shared ??= readShared(slug, FrontMatter.parse(raw));
	}
	if (shared === null) return null;

	return { ...shared, translations, images: files.filter((f) => !f.endsWith('.md')).sort() };
}

/**
 * Renders one language file. When the file already exists its front matter is
 * edited in place, so comments (chat-control-eu has them) and any unknown keys
 * survive untouched.
 */
export async function renderFile(slug: string, shared: PostShared, t: PostTranslation): Promise<string> {
	const existing = await repo.readText(`${bundleDir(slug)}/${fileFor(t.lang)}`);
	const fm = existing ? FrontMatter.parse(existing) : FrontMatter.empty();

	fm.set('title', t.title);
	fm.set('date', shared.date);
	fm.set('slug', shared.slug);
	fm.set('category', shared.category);
	fm.set('draft', shared.draft);
	fm.set('description', t.description);
	fm.setOrRemove('featured_image', shared.featured_image);
	fm.setOrRemove('partner_name', shared.partner_name);
	fm.setOrRemove('partner_url', shared.partner_url);
	fm.setOrRemove('partner_logo_url', shared.partner_logo_url);
	fm.setOrRemove('project_url', shared.project_url);
	fm.setOrRemove('eu_funding_text', t.eu_funding_text);

	if (t.untranslated) fm.set('untranslated', true);
	else fm.remove('untranslated');

	return fm.setBody(t.body).serialize();
}

export interface SavePostInput {
	shared: PostShared;
	translations: Record<Lang, PostTranslation>;
	/** New or replaced images, keyed by filename within the bundle. */
	newImages?: { name: string; bytes: Uint8Array }[];
	deleteImages?: string[];
	/**
	 * Languages whose file should be removed. Deleting a translation is only
	 * ever explicit: an empty title used to be enough to drop the file, which
	 * meant one careless save could destroy a finished translation with no
	 * confirmation and no way back short of git.
	 */
	deleteTranslations?: Lang[];
	message: string;
}

/** Writes a whole post — every language plus images — as ONE commit. */
export async function savePost(input: SavePostInput): Promise<{ sha: string }> {
	const ops = await planSave(input);
	if (ops.length === 0) return { sha: 'noop' };
	return repo.commit(input.message, ops);
}

/**
 * The file operations a save would perform, without performing them.
 *
 * Split out so the editor can show the exact commit before it happens:
 * previewing and saving then cannot drift apart, because they are the same
 * code path.
 */
export async function planSave(input: SavePostInput): Promise<FileOp[]> {
	const { shared, translations } = input;
	const ops: FileOp[] = [];

	const removing = new Set(input.deleteTranslations ?? []);
	for (const lang of LANGS) {
		const t = translations[lang];
		const path = `${bundleDir(shared.slug)}/${fileFor(lang)}`;

		if (removing.has(lang)) {
			// English is the source of truth for a bundle and is never removable.
			if (lang !== 'en' && t.exists) ops.push({ path, delete: true });
			continue;
		}

		const hasContent = t.title.trim() !== '' && (t.body.trim() !== '' || t.untranslated);
		if (!hasContent) {
			// Nothing worth writing. An existing file is left alone: Hugo's content
			// adapter already synthesises a placeholder page when a language is
			// missing, so there is never a reason to delete one implicitly.
			continue;
		}
		ops.push({ path, content: await renderFile(shared.slug, shared, t) });
	}

	for (const img of input.newImages ?? []) {
		ops.push({ path: `${bundleDir(shared.slug)}/${img.name}`, bytes: img.bytes });
	}
	for (const name of input.deleteImages ?? []) {
		ops.push({ path: `${bundleDir(shared.slug)}/${name}`, delete: true });
	}
	return ops;
}

/** Turns a planned save into a reviewable list of changes against what is committed. */
export async function describePlan(ops: FileOp[]): Promise<FileChange[]> {
	const out = await Promise.all(
		ops.map(async (op): Promise<FileChange> => {
			if ('bytes' in op) {
				const existing = await repo.readText(op.path).catch(() => null);
				return {
					path: op.path,
					status: existing === null ? 'added' : 'modified',
					added: 0,
					removed: 0,
					hunks: [],
					bytes: op.bytes.byteLength
				};
			}
			const before = await repo.readText(op.path);
			if ('moveFrom' in op) {
				// A move carries no new bytes: show it as the arrival of the old file.
				return { path: op.path, status: 'added', added: 0, removed: 0, hunks: [], movedFrom: op.moveFrom };
			}
			return fileChange(op.path, before, 'delete' in op ? null : op.content);
		})
	);
	return out.filter((c) => c.status !== 'unchanged');
}

/** Slug rules: lowercase, digits and hyphens — it becomes the folder name. */
export function slugify(title: string): string {
	return title
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 70);
}

export class CreatePostError extends Error {}
export class RenamePostError extends Error {}

/**
 * Creates a new bundle with only index.md, mirroring archetypes/blog.md.
 *
 * Starts as a draft, so a half-written article never reaches the live site
 * just because it exists. Translations are deliberately not created: Hugo's
 * content adapter synthesises the "not yet translated" pages, so an empty
 * index.fr.md would be worse than no file at all.
 */
export async function createPost(input: {
	title: string;
	slug: string;
	date: string;
	category: Category;
	description: string;
}): Promise<{ sha: string }> {
	if (!/^[a-z0-9-]+$/.test(input.slug)) {
		throw new CreatePostError('Slug may contain only lowercase letters, digits and hyphens.');
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
		throw new CreatePostError('Date must be YYYY-MM-DD.');
	}

	const existing = await repo.listTree(bundleDir(input.slug));
	if (existing.length > 0) {
		throw new CreatePostError(`content/blog/${input.slug}/ already exists.`);
	}

	const fm = FrontMatter.empty();
	fm.set('title', input.title);
	fm.set('date', input.date);
	fm.set('slug', input.slug);
	fm.set('category', input.category);
	fm.set('draft', true);
	fm.set('description', input.description);

	return repo.commit(`Create ${input.slug}`, [
		{ path: `${bundleDir(input.slug)}/index.md`, content: fm.setBody('\n').serialize() }
	]);
}

/**
 * Moves an article to a new slug, in one commit.
 *
 * A rename is four edits that must not be separable: the bundle moves, the
 * `slug` front matter follows it in every language, other articles' links are
 * repointed, and the old address gets a redirect (see rename.ts for why that
 * matters on StaticHost). Images move by blob SHA rather than being re-read
 * and re-uploaded, so renaming a bundle of photos costs no more than a text one.
 */
export async function renamePost(
	oldSlug: string,
	newSlug: string,
	opts: { redirect?: boolean } = {}
): Promise<{ sha: string; moved: number; relinked: string[]; redirected: boolean }> {
	if (!SLUG_RE.test(newSlug)) {
		throw new RenamePostError('The address may contain only lowercase letters, digits and single hyphens.');
	}
	if (newSlug === oldSlug) throw new RenamePostError('That is already the address.');
	if (newSlug.length > 80) throw new RenamePostError('That address is too long.');

	const files = await repo.listTree(bundleDir(oldSlug));
	if (files.length === 0) throw new RenamePostError(`content/blog/${oldSlug}/ does not exist.`);
	if ((await repo.listTree(bundleDir(newSlug))).length > 0) {
		throw new RenamePostError(`content/blog/${newSlug}/ already exists.`);
	}

	const ops: FileOp[] = [];
	for (const path of files) {
		const name = path.slice(bundleDir(oldSlug).length + 1);
		const to = `${bundleDir(newSlug)}/${name}`;
		if (!name.endsWith('.md')) {
			// Images: move the blob, never re-upload it.
			ops.push({ path: to, moveFrom: path });
			continue;
		}
		const raw = await repo.readText(path);
		if (raw === null) continue;
		const fm = FrontMatter.parse(raw);
		// Only rewrite the key when it is actually there: an absent slug means
		// Hugo derives it from the folder, which has just moved anyway.
		if (fm.has('slug')) fm.set('slug', newSlug);
		fm.setBody(rewriteLinks(fm.body, oldSlug, newSlug));
		ops.push({ path: to, content: fm.serialize() }, { path, delete: true });
	}

	// Links from other articles, and any redirect an earlier rename left behind.
	const relinked: string[] = [];
	for (const path of await repo.listTree('content')) {
		if (!path.endsWith('.md') || path.startsWith(`${bundleDir(oldSlug)}/`)) continue;
		const raw = await repo.readText(path);
		if (raw === null || !raw.includes(`/blog/${oldSlug}`)) continue;
		const next = path.startsWith('content/blog/')
			? (() => {
					const fm = FrontMatter.parse(raw);
					const body = rewriteLinks(fm.body, oldSlug, newSlug);
					return body === fm.body ? null : fm.setBody(body).serialize();
				})()
			: repointStub(raw, oldSlug, newSlug);
		if (next && next !== raw) {
			ops.push({ path, content: next });
			relinked.push(path);
		}
	}

	const redirect = opts.redirect !== false;
	if (redirect) ops.push(...redirectStubs(oldSlug, newSlug));

	const { sha } = await repo.commit(`Rename ${oldSlug} to ${newSlug}`, ops);
	return { sha, moved: files.length, relinked, redirected: redirect };
}

/**
 * Deletes a whole bundle — every language file and every co-located image.
 *
 * Nothing else references a post by path, so no other file needs updating. The
 * commit is the only record, which is why the caller demands typed confirmation.
 */
export async function deletePost(slug: string): Promise<{ sha: string; files: string[] }> {
	const files = await repo.listTree(bundleDir(slug));
	if (files.length === 0) throw new Error(`content/blog/${slug}/ does not exist.`);
	const { sha } = await repo.commit(
		`Delete ${slug}`,
		files.map((path) => ({ path, delete: true as const }))
	);
	return { sha, files };
}
