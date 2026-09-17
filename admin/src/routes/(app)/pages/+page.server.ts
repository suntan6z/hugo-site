import type { PageServerLoad } from './$types';
import { PAGES, LANGS, pageFile, stampOf } from '$lib/pages.ts';
import { loadPage } from '$lib/server/content/page.ts';
import { repo } from '$lib/server/content/repo.ts';

export const load: PageServerLoad = async () => ({
	pages: await Promise.all(
		PAGES.map(async (p) => {
			const [page, changed] = await Promise.all([loadPage(p.name), repo.lastModified(pageFile(p.name, 'en'))]);
			return {
				...p,
				langs: LANGS.filter((l) => page[l].exists),
				changed,
				// What the page itself claims, which can drift from when the file really changed.
				stamp: stampOf(p.name, 'en', page.en.body)
			};
		})
	)
});
