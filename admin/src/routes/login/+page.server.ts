import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readAuthState } from '$lib/server/auth/state.ts';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) redirect(303, '/');
	const { credentials } = await readAuthState();
	// With no passkey on file there is nothing to sign in with: send the very
	// first visit straight to enrolment.
	if (credentials.length === 0) redirect(303, '/enroll');
	return {};
};
