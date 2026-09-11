import { redirect, type Handle } from '@sveltejs/kit';
import { readSession } from '$lib/server/auth/session.ts';
import { isPublicPath, denialFor } from '$lib/server/auth/access.ts';
import { rateLimited, retryAfter, isRateLimitedPath } from '$lib/server/auth/ratelimit.ts';
import { clientAddress } from '$lib/server/auth/client-address.ts';

export const handle: Handle = async ({ event, resolve }) => {
	// Throttle the sign-in surface before doing any work for it. The address is
	// the real visitor only because ADDRESS_HEADER=X-Envoy-External-Address is
	// set on the container (see scripts/create-container.sh for why that header).
	if (isRateLimitedPath(event.url.pathname)) {
		const ip = clientAddress(event);
		if (rateLimited(ip)) {
			return new Response(JSON.stringify({ error: 'Too many attempts. Wait a minute and try again.' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(retryAfter(ip)),
					'Cache-Control': 'no-store'
				}
			});
		}
	}

	event.locals.session = await readSession(event.cookies);

	// Deny by default: nothing below runs for a signed-out request unless the
	// path is explicitly public. See lib/server/auth/access.ts for why this
	// lives here rather than in a layout.
	if (!event.locals.session && !isPublicPath(event.url.pathname)) {
		const denial = denialFor(event.request.method, event.url.pathname);
		if (denial.kind === 'redirect') redirect(303, denial.location);
		return new Response(JSON.stringify({ error: 'Not signed in.' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
				'X-Robots-Tag': 'noindex, nofollow'
			}
		});
	}

	const started = Date.now();
	const response = await resolve(event);

	// Makes load time measurable from the browser's network panel.
	response.headers.set('Server-Timing', `load;dur=${Date.now() - started}`);

	// A private admin surface: never indexed, never framed, never cached by
	// a shared proxy, and HTTPS-only once seen.
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (!isPublicPath(event.url.pathname) || event.url.pathname.startsWith('/api/')) {
		response.headers.set('Cache-Control', 'private, no-store');
	}
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"img-src 'self' data: blob:",
			"style-src 'self' 'unsafe-inline'",
			"script-src 'self' 'unsafe-inline'",
			"font-src 'self'",
			"connect-src 'self'",
			"frame-src 'self'",
			"frame-ancestors 'none'",
			"form-action 'self'",
			"object-src 'none'",
			"base-uri 'self'"
		].join('; ')
	);
	return response;
};
