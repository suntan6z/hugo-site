import { integrations } from '../env.ts';

/**
 * Health of the two Scaleway Functions behind the site's forms.
 *
 * The portal never calls these in anger — it talks to Resend directly — but a
 * silent 500 on the contact form is otherwise invisible: nobody tells you that
 * their message vanished. A CORS preflight is the cheapest honest check, since
 * it is exactly what the browser does before submitting, and it posts nothing.
 */

export interface FunctionHealth {
	name: string;
	url: string;
	ok: boolean;
	status: number | null;
	ms: number;
	/** Slow enough that the container was almost certainly asleep, not broken. */
	cold?: boolean;
	error?: string;
}

// These functions scale to zero, so the first request of the day wakes a
// container: a 6s budget reported a perfectly healthy form as dead.
const TIMEOUT_MS = 15_000;
const SLOW_MS = 3000;
const OK_TTL_MS = 5 * 60_000;
// A failure is cached only briefly, so a retry is not stuck behind a stale
// verdict — and so a cold start never looks broken for five minutes.
const BAD_TTL_MS = 30_000;

async function ping(name: string, url: string): Promise<FunctionHealth> {
	const started = Date.now();
	try {
		const r = await fetch(url, {
			method: 'OPTIONS',
			headers: {
				Origin: integrations.siteUrl,
				'Access-Control-Request-Method': 'POST',
				'Access-Control-Request-Headers': 'content-type'
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		// A preflight that does not allow the site's own origin would fail in a
		// real browser, so it counts as unhealthy even with a 200.
		const allow = r.headers.get('access-control-allow-origin');
		const permitted = allow === '*' || allow === integrations.siteUrl;
		const ms = Date.now() - started;
		return {
			name,
			url,
			ok: r.ok && permitted,
			status: r.status,
			ms,
			cold: ms > SLOW_MS,
			error: r.ok && !permitted ? `does not allow ${integrations.siteUrl}` : undefined
		};
	} catch (e) {
		return {
			name,
			url,
			ok: false,
			status: null,
			ms: Date.now() - started,
			error:
				e instanceof Error
					? e.name === 'TimeoutError'
						? `no answer in ${TIMEOUT_MS / 1000}s`
						: e.message
					: String(e)
		};
	}
}

// Cached in the instance: the dashboard is polled, and these are someone
// else's servers. A good answer keeps for minutes, a bad one for seconds.
let cached: { at: number; ttl: number; value: FunctionHealth[] } | null = null;
let inflight: Promise<FunctionHealth[]> | null = null;

export async function checkFunctions(): Promise<FunctionHealth[]> {
	if (cached && Date.now() - cached.at < cached.ttl) return cached.value;
	if (inflight) return inflight;

	inflight = Promise.all([
		ping('Contact form', integrations.contactFnUrl),
		ping('Newsletter signup', integrations.newsletterFnUrl)
	])
		.then((value) => {
			cached = { at: Date.now(), ttl: value.every((f) => f.ok) ? OK_TTL_MS : BAD_TTL_MS, value };
			return value;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}
