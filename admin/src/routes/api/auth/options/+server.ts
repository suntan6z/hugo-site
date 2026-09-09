import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticationOptions } from '$lib/server/auth/webauthn.ts';
import { stashChallenge } from '$lib/server/auth/challenge.ts';
import { readAuthState } from '$lib/server/auth/state.ts';

export const POST: RequestHandler = async ({ cookies }) => {
	const { credentials } = await readAuthState();
	if (credentials.length === 0) return json({ error: 'no-credentials' }, { status: 409 });

	const options = await authenticationOptions();
	await stashChallenge(cookies, options.challenge, 'login');
	return json(options);
};
