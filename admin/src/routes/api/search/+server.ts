import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { repo } from '$lib/server/content/repo.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { parseCities } from '$lib/server/content/gallery-data.ts';
import { I18nFile } from '$lib/server/content/i18n-file.ts';
import { memo } from '$lib/server/cache.ts';
import { PAGES } from '$lib/pages.ts';
import type { Item } from '$lib/search.ts';

/**
 * Everything the command palette can open that is not a fixed screen: the
 * articles, the standalone pages, the gallery's cities and the site's interface
 * strings. Signed-in only (the deny-by-default hook), fetched once when the
 * palette first opens, and matched in the browser.
 */
export const GET: RequestHandler = async () => {
	const items = await memo('search:index', 60_000, async (): Promise<Item[]> => {
		const [posts, cities, enRaw] = await Promise.all([
			listPosts(),
			repo.readText('data/gallery_cities.json').then(parseCities),
			repo.readText('i18n/en.toml')
		]);
		const out: Item[] = [];
		for (const p of posts) {
			out.push({
				kind: 'article',
				title: p.title,
				hint: `${p.date} · ${p.draft ? 'draft' : 'published'}`,
				keywords: `${p.slug} ${p.category} ${p.description}`,
				href: `/posts/${p.slug}`
			});
		}
		for (const p of PAGES) out.push({ kind: 'page', title: p.label, hint: p.blurb, keywords: p.name, href: `/pages/${p.name}` });
		for (const c of cities) out.push({ kind: 'gallery', title: c.name, hint: 'Gallery', keywords: c.slug, href: `/gallery/${c.slug}` });
		if (enRaw !== null) {
			const en = I18nFile.parse(enRaw);
			for (const key of en.keys()) {
				const value = en.get(key) ?? '';
				if (!value) continue;
				out.push({ kind: 'string', title: value.length > 90 ? `${value.slice(0, 89)}…` : value, hint: key, keywords: value, href: `/i18n?q=${encodeURIComponent(key)}` });
			}
		}
		return out;
	});
	return json({ items }, { headers: { 'Cache-Control': 'private, no-store' } });
};
