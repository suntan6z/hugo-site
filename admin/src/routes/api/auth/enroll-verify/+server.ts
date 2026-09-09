import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRegistration } from '$lib/server/auth/webauthn.ts';
import { takeChallenge } from '$lib/server/auth/challenge.ts';
import { issueSession } from '$lib/server/auth/session.ts';
import { readAuthState } from '$lib/server/auth/state.ts';
import { assertMayEnroll } from '$lib/server/auth/enroll.ts';
import { audit } from '$lib/server/store/kv.ts';

export const POST: RequestHandler = async ({ url, request, cookies, locals }) => {
	if (!(await assertMayEnroll(url, locals.session))) error(404, 'Not found');

	const challenge = await takeChallenge(cookies, 'enroll');
	if (!challenge) return json({ error: 'challenge expired, try again' }, { status: 400 });

	const { label, ...response } = await request.json();
	try {
		const cred = await verifyRegistration(response, challenge, label || 'passkey');
		// Enrolling signs you in, so a first-run setup lands straight in the portal.
		await issueSession(cookies, (await readAuthState()).epoch);
		await audit('passkey-enrolled', { credential: cred.label });
		return json({ ok: true });
	} catch (e) {
		return json({ error: String(e) }, { status: 400 });
	}
};
