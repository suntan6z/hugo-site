import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type {
	RegistrationResponseJSON,
	AuthenticationResponseJSON
} from '@simplewebauthn/server';
import { auth } from '../env.ts';
import { readAuthState, addCredential, type StoredCredential } from './state.ts';

// Fixed user handle: this portal has exactly one user.
const USER_ID = new TextEncoder().encode('lorenzo');
const USER_NAME = 'lorenzo';

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

export async function registrationOptions() {
	const { credentials } = await readAuthState();
	return generateRegistrationOptions({
		rpName: auth.rpName,
		rpID: auth.rpId,
		userID: USER_ID,
		userName: USER_NAME,
		attestationType: 'none',
		// Stops the same authenticator being enrolled twice.
		excludeCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports as never })),
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'required'
		}
	});
}

export async function verifyRegistration(
	response: RegistrationResponseJSON,
	expectedChallenge: string,
	label: string
): Promise<StoredCredential> {
	const v = await verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin: auth.origin,
		expectedRPID: auth.rpId,
		requireUserVerification: true
	});
	if (!v.verified || !v.registrationInfo) throw new Error('passkey registration failed verification');

	const c = v.registrationInfo.credential;
	const cred: StoredCredential = {
		id: c.id,
		publicKey: b64(c.publicKey),
		counter: c.counter,
		transports: c.transports,
		label,
		createdAt: new Date().toISOString()
	};
	await addCredential(cred);
	return cred;
}

export async function authenticationOptions() {
	return generateAuthenticationOptions({
		rpID: auth.rpId,
		// Empty list = usernameless: the browser offers whichever passkey it holds.
		allowCredentials: [],
		userVerification: 'required'
	});
}

export async function verifyAuthentication(
	response: AuthenticationResponseJSON,
	expectedChallenge: string
): Promise<StoredCredential> {
	const { credentials } = await readAuthState();
	const cred = credentials.find((c) => c.id === response.id);
	if (!cred) throw new Error('unknown passkey');

	const v = await verifyAuthenticationResponse({
		response,
		expectedChallenge,
		expectedOrigin: auth.origin,
		expectedRPID: auth.rpId,
		requireUserVerification: true,
		credential: {
			id: cred.id,
			publicKey: unb64(cred.publicKey),
			counter: cred.counter,
			transports: cred.transports as never
		}
	});
	if (!v.verified) throw new Error('passkey verification failed');

	// The signature counter is stored but deliberately NOT compared: iCloud
	// Keychain and most synced passkeys always report 0, so the usual
	// "reject if it didn't increase" clone check would lock the account out on
	// the second login.
	cred.counter = v.authenticationInfo.newCounter;
	await addCredential(cred);
	return cred;
}
