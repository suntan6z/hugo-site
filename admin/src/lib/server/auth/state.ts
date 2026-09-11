import { store } from '../store/kv.ts';
import { memo, invalidate } from '../cache.ts';

export interface StoredCredential {
	id: string;
	publicKey: string; // base64url
	counter: number;
	transports?: string[];
	label: string;
	createdAt: string;
}

export interface AuthState {
	/** Bumped to invalidate every issued session cookie at once. */
	epoch: number;
	credentials: StoredCredential[];
}

const KEY = 'auth/credentials';
const EMPTY: AuthState = { epoch: 1, credentials: [] };

/**
 * Cached: every request verifies its session's epoch against this, which was a
 * ~300ms object-storage round-trip on each page load. The portal is the only
 * writer, and writeAuthState invalidates, so the TTL only bounds how long a
 * credentials.json edited by hand in the Scaleway console stays unnoticed.
 */
export async function readAuthState(): Promise<AuthState> {
	return memo('auth:state', 60_000, async () => (await store.get<AuthState>(KEY)) ?? EMPTY);
}

export async function writeAuthState(s: AuthState): Promise<void> {
	await store.put(KEY, s);
	// Enrolment and "sign out everywhere" must take effect immediately.
	invalidate('auth:');
}

export async function addCredential(cred: StoredCredential): Promise<AuthState> {
	const s = await readAuthState();
	s.credentials = [...s.credentials.filter((c) => c.id !== cred.id), cred];
	await writeAuthState(s);
	return s;
}

export async function removeCredential(id: string): Promise<AuthState> {
	const s = await readAuthState();
	s.credentials = s.credentials.filter((c) => c.id !== id);
	await writeAuthState(s);
	return s;
}

/** "Sign out everywhere" — one integer, full revocation of stateless cookies. */
export async function bumpEpoch(): Promise<number> {
	const s = await readAuthState();
	s.epoch += 1;
	await writeAuthState(s);
	return s.epoch;
}
