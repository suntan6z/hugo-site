import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { listCities, addCity } from '$lib/server/content/gallery.ts';
import { slugifyCity } from '$lib/server/content/gallery-data.ts';
import { audit } from '$lib/server/store/kv.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';

export const load: PageServerLoad = async () => ({ cities: await listCities() });

export const actions: Actions = {
	add: async ({ request }) => {
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		const flag = String(f.get('flag') ?? '').trim();
		const slug = slugifyCity(String(f.get('slug') ?? '') || name);

		if (!name) return fail(400, { message: 'Name is required.' });
		if (!slug) return fail(400, { message: 'That name produces an empty slug — set one manually.' });
		if (!flag) return fail(400, { message: 'Pick a flag emoji — the filter pills show it.' });

		try {
			const { sha } = await addCity(name, slug, flag);
			await recordPublish({ sha, at: new Date().toISOString(), slug: `gallery/${slug}` });
			await audit('gallery-add-city', { slug, sha });
			return { success: true, slug };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : String(e) });
		}
	}
};
