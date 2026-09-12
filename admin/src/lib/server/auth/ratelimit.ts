/**
 * Sliding-window rate limit for the sign-in surface.
 *
 * Brute force is not the threat here: a WebAuthn assertion needs the private
 * key held by the owner's device, and the bootstrap token is 256 bits. The
 * threat is volume — every failed sign-in writes an audit entry to object
 * storage, so unlimited attempts would run up storage costs and bury a real
 * attempt among thousands of noise entries.
 *
 * In-process, so with several container instances the effective limit is
 * per instance. That is acceptable for its purpose: it caps the flood, it does
 * not have to be exact.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

export const WINDOW_MS = 60_000;
export const MAX_PER_WINDOW = 20;
const MAX_TRACKED = 10_000;

const hits = new Map<string, number[]>();

/** Records a hit for `key` and reports whether it is now over the limit. */
export function rateLimited(key: string, now = Date.now()): boolean {
	const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	recent.push(now);
	// Bound memory: a spray of distinct addresses must not grow this forever.
	if (!hits.has(key) && hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value!);
	hits.set(key, recent);
	return recent.length > MAX_PER_WINDOW;
}

/** Seconds until the oldest hit in the window expires, for Retry-After. */
export function retryAfter(key: string, now = Date.now()): number {
	const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (recent.length === 0) return 0;
	return Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
}

export function resetRateLimits(): void {
	hits.clear();
}

/** The sign-in surface: where an unauthenticated caller can make us do work. */
export const isRateLimitedPath = (pathname: string) =>
	/^\/api\/auth\/(options|verify|enroll-options|enroll-verify)\/?$/.test(pathname) ||
	/^\/enroll\/?$/.test(pathname) ||
	// Token-gated, but it is the other door that opens without a session.
	/^\/api\/cron\/?$/.test(pathname);
