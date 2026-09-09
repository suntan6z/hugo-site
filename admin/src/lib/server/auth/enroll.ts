import crypto from 'node:crypto';
import { auth, IS_LOCAL } from '../env.ts';
import { readAuthState } from './state.ts';
import type { Session } from './session.ts';

/**
 * Enrolment is reachable three ways, in descending order of trust:
 *
 *   1. Already signed in — the normal way to add a second passkey.
 *   2. ?t=<BOOTSTRAP_TOKEN> — the break-glass path. Rotate the token in the
 *      Scaleway console and redeploy to recover from a lockout.
 *   3. No credentials exist yet — first run.
 *
 * A wrong or missing token 404s rather than 401s: there is no reason to confirm
 * to an unauthenticated caller that this route exists.
 */
export async function assertMayEnroll(url: URL, session: Session | null): Promise<boolean> {
	if (session) return true;

	const { credentials } = await readAuthState();
	if (credentials.length === 0) {
		// First run. In local mode there is no token to configure, so allow it.
		if (IS_LOCAL || !auth.bootstrapToken) return true;
	}

	const supplied = url.searchParams.get('t') ?? '';
	if (!auth.bootstrapToken || !supplied) return false;

	const a = Buffer.from(supplied);
	const b = Buffer.from(auth.bootstrapToken);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}
