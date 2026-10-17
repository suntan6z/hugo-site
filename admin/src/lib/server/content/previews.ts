import crypto from 'node:crypto';
import { store } from '../store/kv.ts';
import { isToken, expiryFrom, isLive, type PreviewLink } from './preview-link.ts';

/**
 * The links that show a draft to someone without an account.
 *
 * One live link per article: making another replaces it, which is how a link
 * that went somewhere it should not have is cut off, along with "stop sharing".
 * Kept in the portal's own store, never in git: a link is access, not content.
 */

const byToken = (t: string) => `previews/t/${t}`;
const bySlug = (s: string) => `previews/s/${s}`;

export async function createPreview(slug: string, now = new Date()): Promise<PreviewLink> {
	await revokePreview(slug);
	const link: PreviewLink = {
		token: crypto.randomBytes(24).toString('base64url'),
		slug,
		createdAt: now.toISOString(),
		expiresAt: expiryFrom(now)
	};
	await store.put(byToken(link.token), link);
	await store.put(bySlug(slug), { token: link.token });
	return link;
}

/** The link behind a token, only while it is valid; an expired one is cleared on the way. */
export async function getPreview(token: string, now = new Date()): Promise<PreviewLink | null> {
	if (!isToken(token)) return null;
	const link = await store.get<PreviewLink>(byToken(token));
	if (!link) return null;
	if (!isLive(link, now)) {
		await revokePreview(link.slug);
		return null;
	}
	return link;
}

export async function activePreview(slug: string, now = new Date()): Promise<PreviewLink | null> {
	const ref = await store.get<{ token: string }>(bySlug(slug));
	return ref ? getPreview(ref.token, now) : null;
}

export async function revokePreview(slug: string): Promise<boolean> {
	const ref = await store.get<{ token: string }>(bySlug(slug));
	if (!ref) return false;
	await store.del(byToken(ref.token));
	await store.del(bySlug(slug));
	return true;
}
