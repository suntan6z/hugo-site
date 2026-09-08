import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { IS_LOCAL } from '$lib/server/env.ts';
import { issueSession } from '$lib/server/auth/session.ts';
import { readAuthState } from '$lib/server/auth/state.ts';

/**
 * Development shortcut: issues a session without a passkey ceremony, so
 * `npm run dev` does not demand Touch ID on every reload.
 *
 * Double-gated and unreachable in production:
 *   - IS_LOCAL is false whenever GH_APP_ID is set, which the deployed
 *     container always sets;
 *   - ALLOW_DEV_LOGIN must additionally be set to "1" by hand.
 *
 * Both conditions must hold, so shipping this route cannot weaken the deployed
 * portal even if the flag were set there by mistake.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	if (!IS_LOCAL || env.ALLOW_DEV_LOGIN !== '1') error(404, 'Not found');
	console.warn('[admin] dev-login used — no passkey was verified (local mode only)');
	await issueSession(cookies, (await readAuthState()).epoch);
	redirect(303, '/');
};
