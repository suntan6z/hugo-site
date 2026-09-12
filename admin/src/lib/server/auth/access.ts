/**
 * Which requests may proceed without a session.
 *
 * DENY BY DEFAULT. The portal first shipped with its sign-in check in the
 * (app) layout's load function — but SvelteKit does not run load functions
 * before form actions, so every action behind those pages accepted
 * unauthenticated POSTs. Anyone with curl could create, publish or delete
 * articles, send the newsletter, and, via sign-out-everywhere (which issues a
 * fresh session to its caller), take over the portal outright. CSRF protection
 * did not help: it stops cross-site browsers, not direct requests.
 *
 * So access is now decided once, in hooks.server.ts, for every request —
 * pages, __data.json loads, form actions and endpoints alike — and a path is
 * reachable signed-out only if it is listed here. A new route is protected
 * the moment it exists; forgetting a check can no longer open it.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

const PUBLIC: RegExp[] = [
	// Sign-in and first-run enrolment. /enroll gates itself on the bootstrap
	// token or an existing session (see assertMayEnroll).
	/^\/login\/?$/,
	/^\/enroll\/?$/,
	// Their data loads, used by client-side navigation.
	/^\/login\/__data\.json$/,
	/^\/enroll\/__data\.json$/,
	// The WebAuthn ceremony itself, and signing out. Each is safe unauthenticated:
	// options/verify need a valid passkey, enroll-* re-check assertMayEnroll,
	// and dev-login is gated on local mode plus an explicit flag.
	/^\/api\/auth\/(options|verify|enroll-options|enroll-verify|logout|dev-login)\/?$/,
	// The scheduled-publish runner, which a scheduler calls with a bearer token
	// because it cannot hold a passkey. It takes no parameters and only carries
	// out work already scheduled from inside the portal; a wrong token gets 404.
	/^\/api\/cron\/?$/,
	// Static assets: SvelteKit's client bundle and the brand files.
	/^\/_app\//,
	/^\/brand\//,
	/^\/favicon\.(ico|png|svg)$/,
	/^\/robots\.txt$/
];

export function isPublicPath(pathname: string): boolean {
	// Normalise away tricks like //login or /login/../posts before matching.
	let p: string;
	try {
		p = new URL(pathname, 'http://x').pathname;
	} catch {
		return false;
	}
	return PUBLIC.some((re) => re.test(p));
}

export type Denial = { kind: 'redirect'; location: string } | { kind: 'unauthorised' };

/**
 * What to do with a signed-out request to a protected path: a browser loading
 * a page is sent to sign in; anything else — a form action, any API call — is
 * refused outright, so an unauthenticated write can never reach its handler.
 */
export function denialFor(method: string, pathname: string): Denial {
	// An API caller is code, not a person: a redirect to an HTML sign-in page
	// would be followed and misread, so it gets a plain 401 whatever the method.
	if (/^\/api\//.test(pathname)) return { kind: 'unauthorised' };
	if (method === 'GET' || method === 'HEAD') {
		const isData = pathname.endsWith('/__data.json');
		const target = isData ? pathname.replace(/\/?__data\.json$/, '') || '/' : pathname;
		return { kind: 'redirect', location: `/login?next=${encodeURIComponent(target)}` };
	}
	return { kind: 'unauthorised' };
}
