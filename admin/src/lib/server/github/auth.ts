import { SignJWT } from 'jose';
import { createPrivateKey } from 'node:crypto';
import { github } from '../env.ts';

/**
 * GitHub App authentication. An App is used rather than a PAT so the credential
 * is scoped to one repository, mints short-lived tokens, and can be revoked
 * from the GitHub UI without touching anything else.
 */

let cached: { token: string; expiresAt: number } | null = null;

/** App-level JWT, RS256, used only to exchange for an installation token. */
async function appJwt(): Promise<string> {
	// GitHub issues App keys in PKCS#1 ("BEGIN RSA PRIVATE KEY"), which jose's
	// importPKCS8 rejects. node:crypto reads both PKCS#1 and PKCS#8, and jose
	// accepts the resulting KeyObject directly.
	const key = createPrivateKey(github.privateKey);
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({})
		.setProtectedHeader({ alg: 'RS256' })
		// Backdated 60s: GitHub rejects a JWT whose iat is in the future, and
		// container clocks drift.
		.setIssuedAt(now - 60)
		.setExpirationTime(now + 540)
		.setIssuer(github.appId)
		.sign(key);
}

/** Installation token, valid 1h, cached in module scope for 50 minutes. */
export async function installationToken(): Promise<string> {
	if (cached && Date.now() < cached.expiresAt) return cached.token;

	const r = await fetch(
		`https://api.github.com/app/installations/${github.installationId}/access_tokens`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${await appJwt()}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		}
	);
	if (!r.ok) {
		throw new Error(`GitHub installation token failed: ${r.status} ${await r.text()}`);
	}
	const { token } = (await r.json()) as { token: string };
	cached = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
	return token;
}

/** Drops the cached token. Used when a call comes back 401. */
export function invalidateToken(): void {
	cached = null;
}
