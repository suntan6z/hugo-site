/**
 * Signing in to Google as a service account, and the date window Search Console wants.
 *
 * A service account is a robot user with its own key. Its owner adds the robot's
 * email address as a user of the Search Console property, and the robot then signs
 * a short statement (a JWT) with its private key and trades it at Google's token
 * endpoint for an access token that lasts an hour. Nothing here is interactive and
 * nothing reaches the user's own Google account.
 *
 * Only node:crypto, no SvelteKit or environment, so the suite can drive it directly.
 */
import { createSign } from 'node:crypto';

/** Read-only: the portal looks at search numbers and never changes the property. */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
	email: string;
	privateKey: string;
}

/** The key file's JSON, as base64 (which survives being an environment variable). Null if it is not one. */
export function parseServiceAccount(b64: string): ServiceAccount | null {
	if (!b64.trim()) return null;
	try {
		const j = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8')) as Record<string, unknown>;
		const email = j.client_email;
		const key = j.private_key;
		if (typeof email !== 'string' || typeof key !== 'string') return null;
		if (!/^[^\s@]+@[^\s@]+$/.test(email) || !key.includes('PRIVATE KEY')) return null;
		return { email, privateKey: key };
	} catch {
		return null;
	}
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** The signed statement Google trades for an access token. Valid for an hour, the most it allows. */
export function signAssertion(account: ServiceAccount, nowMs: number, audience = GOOGLE_TOKEN_URL): string {
	const iat = Math.floor(nowMs / 1000);
	const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = b64url(JSON.stringify({ iss: account.email, scope: GSC_SCOPE, aud: audience, iat, exp: iat + 3600 }));
	const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(account.privateKey);
	return `${head}.${claims}.${b64url(signature)}`;
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The last `days` days Search Console has settled numbers for. Google reports with a
 * lag of a day or two, and asking for today returns a partial figure that looks like
 * a collapse, so the window ends two days back.
 */
export function dateWindow(nowMs: number, days: number): { startDate: string; endDate: string } {
	const end = nowMs - 2 * DAY;
	return { startDate: iso(end - (days - 1) * DAY), endDate: iso(end) };
}
