import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { assertMayEnroll } from '$lib/server/auth/enroll.ts';
import { readAuthState } from '$lib/server/auth/state.ts';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!(await assertMayEnroll(url, locals.session))) error(404, 'Not found');
	const { credentials } = await readAuthState();
	return {
		existing: credentials.map((c) => ({ label: c.label, createdAt: c.createdAt })),
		signedIn: !!locals.session
	};
};
