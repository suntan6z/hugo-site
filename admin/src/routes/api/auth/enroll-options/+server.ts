import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registrationOptions } from '$lib/server/auth/webauthn.ts';
import { stashChallenge } from '$lib/server/auth/challenge.ts';
import { assertMayEnroll } from '$lib/server/auth/enroll.ts';

export const POST: RequestHandler = async ({ url, cookies, locals }) => {
	if (!(await assertMayEnroll(url, locals.session))) error(404, 'Not found');

	const options = await registrationOptions();
	await stashChallenge(cookies, options.challenge, 'enroll');
	return json(options);
};
