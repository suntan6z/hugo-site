/**
 * Tiny in-process memo for repository reads.
 *
 * Listing the blog costs one tree call plus one read per post. Against the
 * GitHub API that measured ~4.5s done sequentially, which is most of the
 * dashboard's load time. Caching is safe here because the portal is the only
 * writer: every mutation goes through repo.commit(), which invalidates. The TTL
 * only bounds how long a push made from a laptop can look stale.
 */

interface Entry<T> {
	at: number;
	value: T;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL_MS = 60_000;

export async function memo<T>(
	key: string,
	ttlMs: number,
	load: () => Promise<T>
): Promise<T> {
	const hit = store.get(key) as Entry<T> | undefined;
	if (hit && Date.now() - hit.at < ttlMs) return hit.value;

	// Collapse concurrent misses so a burst of requests triggers one fetch.
	const pending = inflight.get(key) as Promise<T> | undefined;
	if (pending) return pending;

	const p = load()
		.then((value) => {
			store.set(key, { at: Date.now(), value });
			return value;
		})
		.finally(() => inflight.delete(key));

	inflight.set(key, p);
	return p;
}

/** Called after every write, so the next read reflects it immediately. */
export function invalidateAll(): void {
	store.clear();
}

export function invalidate(prefix: string): void {
	for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/** Runs tasks with bounded concurrency, preserving input order. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			out[i] = await fn(items[i]);
		}
	});
	await Promise.all(workers);
	return out;
}
