import { repo, type FileOp } from './repo.ts';
import { FrontMatter, CATEGORIES, type Category } from './frontmatter.ts';

export const LANGS = ['en', 'fr', 'it'] as const;
export type Lang = (typeof LANGS)[number];

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
	const paths = await repo.listTree('content/blog');
	const bySlug = new Map<string, string[]>();
	for (const p of paths) {
		const m = /^content\/blog\/([^/]+)\/(.+)$/.exec(p);
		if (!m) continue; // section _index.md files and content adapters live one level up
		const list = bySlug.get(m[1]) ?? [];
		list.push(m[2]);
		bySlug.set(m[1], list);
	}

	const out: PostSummary[] = [];
	for (const [slug, files] of bySlug) {
		const primary = files.includes('index.md')
			? 'index.md'
			: files.find((f) => /^index\..+\.md$/.test(f));
		if (!primary) continue;

		const raw = await repo.readText(`${bundleDir(slug)}/${primary}`);
		if (raw === null) continue;
		const fm = FrontMatter.parse(raw);

		const langs = LANGS.filter((l) => files.includes(fileFor(l)));

		out.push({
			...readShared(slug, fm),
			title: String(fm.get('title') ?? slug),
			description: String(fm.get('description') ?? ''),
			langs,
			imageCount: files.filter((f) => !f.endsWith('.md')).length
		});
	}

	return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** One bundle with all its language files. */
export async function loadPost(slug: string): Promise<Post | null> {
	const files = (await repo.listTree(bundleDir(slug))).map((p) => p.split('/').pop()!);
	if (files.length === 0) return null;

	const translations = {} as Record<Lang, PostTranslation>;
	let shared: PostShared | null = null;

	for (const lang of LANGS) {
		const raw = await repo.readText(`${bundleDir(slug)}/${fileFor(lang)}`);
		if (raw === null) {
			translations[lang] = empty(lang);
			continue;
		}
		translations[lang] = readTranslation(lang, raw);
		shared ??= readShared(slug, FrontMatter.parse(raw));
	}
	if (!shared) return null;

	return { ...shared, translations, images: files.filter((f) => !f.endsWith('.md')).sort() };
}

/**
 * Renders one language file. When the file already exists its front matter is
 * edited in place, so comments (chat-control-eu has them) and any unknown keys
 * survive untouched.
 */
async function renderFile(slug: string, shared: PostShared, t: PostTranslation): Promise<string> {
	const existing = await repo.readText(`${bundleDir(slug)}/${fileFor(t.lang)}`);
	const fm = existing ? FrontMatter.parse(existing) : FrontMatter.parse('---\n---\n');

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
	message: string;
}

/** Writes a whole post — every language plus images — as ONE commit. */
export async function savePost(input: SavePostInput): Promise<{ sha: string }> {
	const { shared, translations } = input;
	const ops: FileOp[] = [];

	for (const lang of LANGS) {
		const t = translations[lang];
		const path = `${bundleDir(shared.slug)}/${fileFor(lang)}`;
		const hasContent = t.title.trim() !== '' && (t.body.trim() !== '' || t.untranslated);

		if (!hasContent) {
			// Nothing to publish in this language. Remove a file only if one exists;
			// Hugo's content adapter will synthesise the placeholder page instead.
			if (t.exists && lang !== 'en') ops.push({ path, delete: true });
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

	if (ops.length === 0) return { sha: 'noop' };
	return repo.commit(input.message, ops);
}
