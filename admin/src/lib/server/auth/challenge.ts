import { SignJWT, jwtVerify } from 'jose';
import type { Cookies } from '@sveltejs/kit';
import { auth } from '../env.ts';

/**
 * The WebAuthn challenge is carried in a short-lived signed cookie rather than
 * server memory. With min-scale=0 and more than one container instance, an
 * in-memory map fails whenever /options and /verify land on different
 * instances — and it fails nondeterministically, which is the worst kind.
 */

const COOKIE = 'webauthn-challenge';
const MAX_AGE = 120;
const secret = () => new TextEncoder().encode(auth.sessionSecret);

export async function stashChallenge(
	cookies: Cookies,
	challenge: string,
	purpose: 'login' | 'enroll'
): Promise<void> {
	const token = await new SignJWT({ challenge, purpose })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${MAX_AGE}s`)
		.sign(secret());

	cookies.set(COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !auth.origin.startsWith('http://'),
		sameSite: 'strict',
		maxAge: MAX_AGE
	});
}

export async function takeChallenge(
	cookies: Cookies,
	purpose: 'login' | 'enroll'
): Promise<string | null> {
	const token = cookies.get(COOKIE);
	if (!token) return null;
	cookies.delete(COOKIE, { path: '/' });
	try {
		const { payload } = await jwtVerify(token, secret());
		if (payload.purpose !== purpose) return null;
		return String(payload.challenge);
	} catch {
		return null;
	}
}
