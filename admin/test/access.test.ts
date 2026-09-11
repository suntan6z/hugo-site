import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isPublicPath, denialFor } from '../src/lib/server/auth/access.ts';

const ROUTES = path.resolve(import.meta.dirname, '..', 'src', 'routes');

/** Every URL the app serves, derived from the filesystem: groups dropped, params filled. */
function allRoutes(): string[] {
	const out: string[] = [];
	const walk = (dir: string, url: string) => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		if (entries.some((e) => /^\+(page|server)\.(svelte|ts)$/.test(e.name))) out.push(url || '/');
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			const seg = /^\(.+\)$/.test(e.name) ? '' : e.name.replace(/^\[(.+)\]$/, 'x-$1');
			walk(path.join(dir, e.name), seg ? `${url}/${seg}` : url);
		}
	};
	walk(ROUTES, '');
	return [...new Set(out)].sort();
}

/** The ONLY routes that may be reached signed out. Anything else must be denied. */
const INTENDED_PUBLIC = new Set([
	'/login',
	'/enroll',
	'/api/auth/options',
	'/api/auth/verify',
	'/api/auth/enroll-options',
	'/api/auth/enroll-verify',
	'/api/auth/logout',
	'/api/auth/dev-login'
]);

describe('every route is protected unless deliberately public', () => {
	const routes = allRoutes();

	test('the route walk found the app (guards against a silently empty list)', () => {
		assert.ok(routes.length >= 15, `only found ${routes.length} routes`);
		assert.ok(routes.includes('/posts/x-slug'));
		assert.ok(routes.includes('/newsletter'));
	});

	for (const r of routes) {
		const expected = INTENDED_PUBLIC.has(r);
		test(`${r} is ${expected ? 'public' : 'PROTECTED'}`, () => {
			assert.equal(isPublicPath(r), expected);
			// Its data endpoint must follow the page, never be looser than it.
			if (!r.startsWith('/api/')) {
				assert.equal(isPublicPath(`${r === '/' ? '' : r}/__data.json`), expected);
			}
		});
	}

	test('every intended-public route actually exists (no stale allow-list entries)', () => {
		for (const r of INTENDED_PUBLIC) assert.ok(routes.includes(r), `${r} is allow-listed but not a route`);
	});
});

describe('the writes that were exposed are now refused', () => {
	// Form actions POST to their page URL with ?/name. Every one of these ran
	// unauthenticated before the fix.
	for (const url of [
		'/posts/new', '/posts/chat-control-eu', '/gallery', '/gallery/bari',
		'/newsletter', '/i18n', '/settings', '/'
	]) {
		test(`POST ${url} is refused outright, not redirected`, () => {
			assert.equal(isPublicPath(url), false);
			assert.deepEqual(denialFor('POST', url), { kind: 'unauthorised' });
		});
	}

	test('image previews are protected too', () => {
		assert.equal(isPublicPath('/api/image/chat-control-eu/a.webp'), false);
		assert.equal(isPublicPath('/api/gallery-image/bari/1.jpg'), false);
	});
});

describe('path tricks do not slip through', () => {
	for (const p of [
		'/login/../posts', '/enroll/../settings', '//posts', '/login/extra', '/loginx',
		'/api/auth/../../posts', '/api/auth/anything-else', '/_appx/', '/brandx/logo.svg',
		'/%2e%2e/posts', '/posts?/login', '/login%2f..%2fposts'
	]) {
		test(`${p} is not treated as public`, () => {
			assert.equal(isPublicPath(p), false);
		});
	}

	test('the real public paths still work with a trailing slash', () => {
		assert.equal(isPublicPath('/login/'), true);
		assert.equal(isPublicPath('/_app/immutable/x.js'), true);
		assert.equal(isPublicPath('/brand/fonts/a.woff2'), true);
	});
});

describe('denial shape', () => {
	test('a signed-out page load is sent to sign in, remembering where it was going', () => {
		assert.deepEqual(denialFor('GET', '/posts'), { kind: 'redirect', location: '/login?next=%2Fposts' });
	});

	test('a data load redirects to sign in for the page, not the JSON', () => {
		assert.deepEqual(denialFor('GET', '/posts/__data.json'), { kind: 'redirect', location: '/login?next=%2Fposts' });
	});

	test('an API call is refused with 401 even as a GET, never redirected to HTML', () => {
		for (const m of ['GET', 'HEAD', 'PUT', 'DELETE']) {
			assert.deepEqual(denialFor(m, '/api/drafts/first-home-nas'), { kind: 'unauthorised' }, m);
		}
		assert.deepEqual(denialFor('GET', '/api/whoami'), { kind: 'unauthorised' });
	});

	test('every non-GET method is refused', () => {
		for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			assert.deepEqual(denialFor(m, '/posts'), { kind: 'unauthorised' });
		}
	});
});
