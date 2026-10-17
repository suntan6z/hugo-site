import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadLibrary, deleteImage, MediaError } from '$lib/server/content/media.ts';
import { audit } from '$lib/server/store/kv.ts';
import { fromForm } from '$lib/server/content/post.ts';

export const load: PageServerLoad = async () => ({ entries: await loadLibrary() });

export const actions: Actions = {
	/** Only a picture nothing uses; the reason it is refused is shown, not hidden. */
	delete: async ({ request }) => {
		const f = await request.formData();
		const path = fromForm(f.get('path')).trim();
		if (fromForm(f.get('confirm')).trim() !== 'delete') return fail(400, { message: 'Confirm the deletion first.' });
		try {
			await deleteImage(path);
		} catch (e) {
			if (e instanceof MediaError) return fail(400, { message: e.message });
			throw e;
		}
		await audit('image-deleted', { path });
		return { deleted: path.split('/').pop() };
	}
};
