import type { Handle } from '@sveltejs/kit';
import { readSession } from '$lib/server/auth/session.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await readSession(event.cookies);

	const started = Date.now();
	const response = await resolve(event);

	// Makes load time measurable from the browser's network panel rather than
	// guessed at. The dashboard's first version made 14 sequential GitHub calls.
	response.headers.set('Server-Timing', `load;dur=${Date.now() - started}`);

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
