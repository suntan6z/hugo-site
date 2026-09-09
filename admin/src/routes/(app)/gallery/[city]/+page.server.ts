import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadCity, saveCity, removeCity } from '$lib/server/content/gallery.ts';
import { ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { audit } from '$lib/server/store/kv.ts';
import { fromForm } from '$lib/server/content/post.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';

export const load: PageServerLoad = async ({ params }) => {
	const city = await loadCity(params.city);
	if (!city) error(404, `No gallery city "${params.city}"`);
	return { city };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const f = await request.formData();
		const slug = params.city;

		let order: string[];
		let captions: { filename: string; caption: string; altText: string }[];
		try {
			order = JSON.parse(fromForm(f.get('order')) || '[]');
			captions = JSON.parse(fromForm(f.get('captions')) || '[]');
		} catch {
			return fail(400, { message: 'Malformed form data — reload and try again.' });
		}
		const deleteFilenames: string[] = JSON.parse(String(f.get('deletes') ?? '[]'));

		const newImages: { bytes: Uint8Array; ext: string }[] = [];
		for (const entry of f.getAll('newphoto')) {
			if (!(entry instanceof File) || entry.size === 0) continue;
			if (entry.size > 4 * 1024 * 1024) {
				return fail(400, { message: `${entry.name} is over 4 MB after processing.` });
			}
			const ext = entry.name.split('.').pop()?.toLowerCase() ?? 'webp';
			newImages.push({ bytes: new Uint8Array(await entry.arrayBuffer()), ext });
		}

		if (order.length === 0 && newImages.length === 0 && deleteFilenames.length === 0) {
			return fail(400, { message: 'Nothing to save.' });
		}

		try {
			const { sha } = await saveCity({
				slug, order, captions, newImages, deleteFilenames,
				message: `Update gallery ${slug}`
			});
			await recordPublish({ sha, at: new Date().toISOString(), slug: `gallery/${slug}` });
			await audit('gallery-save', {
				slug, sha, added: newImages.length, removed: deleteFilenames.length
			});
			return { success: true, sha };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	},

	remove: async ({ request, params }) => {
		const f = await request.formData();
		// Typing the slug is the confirmation: this deletes every photo in the city.
		if (String(f.get('confirm') ?? '').trim() !== params.city) {
			return fail(400, { message: `Type "${params.city}" to confirm removal.` });
		}
		const { sha } = await removeCity(params.city);
		await recordPublish({ sha, at: new Date().toISOString(), slug: `gallery/${params.city}` });
		await audit('gallery-remove-city', { slug: params.city, sha });
		redirect(303, '/gallery');
	}
};
