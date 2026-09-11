import { store } from '../store/kv.ts';

/**
 * Work in progress, autosaved while writing.
 *
 * Kept in object storage rather than committed: a commit per keystroke would
 * trigger a StaticHost build each time and burn the free build minutes, and
 * a half-written sentence has no business in git history. A draft is dropped
 * the moment the article is saved for real.
 */

export interface Draft {
	savedAt: string;
	/**
	 * Fingerprint of the committed article when editing began. If it no longer
	 * matches, the article changed underneath this draft (a save from another
	 * device, or a push from the laptop), and restoring would overwrite that.
	 */
	baseHash: string;
	post: unknown;
}

const MAX_BYTES = 1_000_000;
const key = (slug: string) => `drafts/${slug}`;

export const validSlug = (slug: string) => /^[a-z0-9-]{1,100}$/.test(slug);

export async function readDraft(slug: string): Promise<Draft | null> {
	return store.get<Draft>(key(slug));
}

export async function writeDraft(slug: string, draft: Draft): Promise<void> {
	const size = Buffer.byteLength(JSON.stringify(draft));
	if (size > MAX_BYTES) throw new Error(`Draft is ${size} bytes; the limit is ${MAX_BYTES}.`);
	await store.put(key(slug), draft);
}

export async function clearDraft(slug: string): Promise<void> {
	await store.del(key(slug));
}
