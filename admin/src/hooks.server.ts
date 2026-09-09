import type { Handle } from '@sveltejs/kit';
import { readSession } from '$lib/server/auth/session.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await readSession(event.cookies);

	const response = await resolve(event);

	// This is a private admin surface: never index it, never let it be framed.
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"img-src 'self' data: blob:",
			"style-src 'self' 'unsafe-inline'",
			"script-src 'self' 'unsafe-inline'",
			"connect-src 'self'",
			"frame-ancestors 'none'",
			"object-src 'none'",
			"base-uri 'self'"
		].join('; ')
	);
	return response;
};
