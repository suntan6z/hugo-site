import type { PageServerLoad } from './$types';
import { PAGES, LANGS, pageFile, stampOf } from '$lib/pages.ts';
import { NOW_JSON, readNow, monthYear } from '$lib/now.ts';
import { loadPage } from '$lib/server/content/page.ts';
import { repo } from '$lib/server/content/repo.ts';

export const load: PageServerLoad = async () => ({
	pages: await Promise.all(
		PAGES.map(async (p) => {
			const isNow = p.name === 'now';
			const [page, changed, nowJson] = await Promise.all([
				loadPage(p.name),
				repo.lastModified(isNow ? NOW_JSON : pageFile(p.name, 'en')),
				isNow ? repo.readText(NOW_JSON) : null
			]);
			return {
				...p,
				langs: LANGS.filter((l) => page[l].exists),
				changed,
				// What the page itself claims, which can drift from when the file really changed.
				stamp: isNow ? monthYear(readNow(nowJson).updated) : stampOf(p.name, 'en', page.en.body)
			};
		})
	)
});
