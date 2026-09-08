import { SignJWT, jwtVerify } from 'jose';
import type { Cookies } from '@sveltejs/kit';
import { auth } from '../env.ts';
import { readAuthState } from './state.ts';

export interface Session {
	sub: string;
	epoch: number;
}

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const secret = () => new TextEncoder().encode(auth.sessionSecret);

export async function issueSession(cookies: Cookies, epoch: number): Promise<void> {
	const token = await new SignJWT({ epoch })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('lorenzo')
		.setIssuedAt()
		.setExpirationTime(`${MAX_AGE}s`)
		.sign(secret());

	cookies.set(COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !auth.origin.startsWith('http://'),
		// Lax, not Strict: Strict drops the cookie on a top-level navigation from
		// a bookmark, which is exactly how this portal gets opened.
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

export async function readSession(cookies: Cookies): Promise<Session | null> {
	const token = cookies.get(COOKIE);
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, secret());
		const epoch = Number(payload.epoch);
		// Reject tokens issued before the last "sign out everywhere".
		if ((await readAuthState()).epoch !== epoch) return null;
		return { sub: String(payload.sub), epoch };
	} catch {
		return null;
	}
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(COOKIE, { path: '/' });
}
