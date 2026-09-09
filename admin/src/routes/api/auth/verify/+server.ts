import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAuthentication } from '$lib/server/auth/webauthn.ts';
import { takeChallenge } from '$lib/server/auth/challenge.ts';
import { issueSession } from '$lib/server/auth/session.ts';
import { readAuthState } from '$lib/server/auth/state.ts';
import { audit } from '$lib/server/store/kv.ts';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const challenge = await takeChallenge(cookies, 'login');
	if (!challenge) return json({ error: 'challenge expired, try again' }, { status: 400 });

	try {
		const cred = await verifyAuthentication(await request.json(), challenge);
		await issueSession(cookies, (await readAuthState()).epoch);
		await audit('login', { credential: cred.label, ip: getClientAddress() });
		return json({ ok: true });
	} catch (e) {
		await audit('login-failed', { ip: getClientAddress(), reason: String(e) });
		return json({ error: 'passkey not recognised' }, { status: 401 });
	}
};
