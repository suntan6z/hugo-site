import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, startFakeDeepL, type Portal, type FakeDeepL } from './harness.ts';
import { FrontMatter } from '../../src/lib/server/content/frontmatter.ts';

let portal: Portal;
let cookie: string;
let deepl: FakeDeepL;

before(async () => {
	deepl = await startFakeDeepL();
	portal = await startPortal({ env: { DEEPL_API_KEY: 'test-key:fx', DEEPL_API_URL: deepl.url } });
	cookie = await portal.signIn();
});
after(async () => {
	await portal?.stop();
	await deepl?.close();
});

const LANGS = ['en', 'fr', 'it'] as const;
const fileFor = (l: string) => (l === 'en' ? 'index.md' : `index.${l}.md`);

/** The exact fields the editor submits, built from what is on disk now. */
function editorForm(slug: string, overrides: Record<string, string> = {}): Record<string, string> {
	const fields: Record<string, string> = { intent: 'save', deleteimages: '[]' };
	let shared: FrontMatter | null = null;
	for (const l of LANGS) {
		const raw = portal.read(`content/blog/${slug}/${fileFor(l)}`);
		if (!raw) {
			Object.assign(fields, { [`title_${l}`]: '', [`description_${l}`]: '', [`body_${l}`]: '' });
			continue;
		}
		const fm = FrontMatter.parse(raw);
		shared ??= fm;
		fields[`title_${l}`] = String(fm.get('title') ?? '');
		fields[`description_${l}`] = String(fm.get('description') ?? '');
		fields[`body_${l}`] = fm.body;
		if (fm.get('untranslated') === true) fields[`untranslated_${l}`] = 'on';
		if (fm.has('eu_funding_text')) fields[`eu_funding_text_${l}`] = String(fm.get('eu_funding_text'));
	}
	const o = shared!.toObject();
	fields.date = String(o.date);
	fields.category = String(o.category);
	fields.featured_image = String(o.featured_image ?? '');
	if (o.draft === true) fields.draft = 'on';
	for (const k of ['partner_name', 'partner_url', 'partner_logo_url', 'project_url']) {
		if (o[k] !== undefined) fields[k] = String(o[k]);
	}
	return { ...fields, ...overrides };
}

describe('access control on the running app', () => {
	const writes: [string, Record<string, string>][] = [
		['/posts/new?/create', { title: 'x', category: 'Technology', date: '2026-01-01' }],
		['/posts/first-home-nas?/save', { intent: 'save' }],
		['/posts/first-home-nas?/delete', { confirm: 'first-home-nas' }],
		['/gallery/bari?/save', { order: '[]' }],
		['/gallery?/add', { name: 'X', flag: '🏳️' }],
		['/newsletter?/send', { slug: 'first-home-nas' }],
		['/i18n?/save', {}],
		['/settings?/signOutEverywhere', {}],
		['/?/indexnow', {}]
	];
	for (const [path, fields] of writes) {
		test(`signed out, POST ${path} is refused before reaching its action`, async () => {
			const r = await portal.action(path, fields);
			assert.equal(r.status, 401, `expected 401, got ${r.status}: ${r.raw.slice(0, 120)}`);
			assert.ok(!r.raw.includes('"type"'), 'the action ran and returned a result');
		});
	}

	test('signed out, pages redirect to sign-in', async () => {
		for (const p of ['/', '/posts', '/settings', '/newsletter']) {
			const r = await portal.get(p);
			assert.equal(r.status, 303, p);
			assert.match(r.headers.get('location') ?? '', /^\/login/);
		}
	});

	test('signed out, an image preview is not served', async () => {
		const r = await portal.get('/api/image/out-the-shadow/fundacjalogo.png');
		assert.notEqual(r.status, 200);
	});

	test('the CSP allows images from the live site, and from nowhere else external', async () => {
		const csp = (await portal.get('/login')).headers.get('content-security-policy') ?? '';
		const img = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src'));
		assert.equal(img, "img-src 'self' data: blob: https://lorenzo.loconsole.eu");
		assert.match(csp, /frame-ancestors 'none'/);
		assert.doesNotMatch(csp, /\*/);
	});

	test('a forged session cookie is rejected', async () => {
		const r = await portal.get('/posts', { cookie: 'session=eyJhbGciOiJIUzI1NiJ9.eyJlcG9jaCI6MX0.forged' });
		assert.equal(r.status, 303);
	});

	test('a signed-in cross-site POST is blocked (CSRF)', async () => {
		const r = await portal.action(
			'/posts/new?/create',
			{ title: 'csrf', category: 'Technology', date: '2026-01-01' },
			{ cookie, origin: 'https://evil.example' }
		);
		assert.equal(r.status, 403);
		assert.equal(portal.exists('content/blog/csrf'), false);
	});
});

describe('articles, end to end', () => {
	test('creating an article writes a draft with correct front matter', async () => {
		const r = await portal.action(
			'/posts/new?/create',
			{ title: 'Integration Test Post', category: 'Personal', date: '2026-01-02', description: 'd' },
			{ cookie }
		);
		assert.equal(r.type, 'redirect', r.raw);
		assert.equal(r.location, '/posts/integration-test-post');
		const raw = portal.read('content/blog/integration-test-post/index.md')!;
		assert.ok(raw.startsWith('---\ntitle: "Integration Test Post"\ndate: 2026-01-02\n'), raw);
		assert.match(raw, /\ndraft: true\n/);
		assert.equal(raw.includes('\r'), false);
		// Translations are deliberately not created: the content adapter
		// synthesises the placeholder pages.
		assert.equal(portal.exists('content/blog/integration-test-post/index.fr.md'), false);
	});

	test('creating a second article with the same slug is refused', async () => {
		const r = await portal.action(
			'/posts/new?/create',
			{ title: 'Integration Test Post', category: 'Personal', date: '2026-01-02' },
			{ cookie }
		);
		assert.equal(r.type, 'failure');
		assert.match(String(r.data?.message), /already exists/);
	});

	test('a no-op save leaves every language file byte-identical', async () => {
		const before = LANGS.map((l) => portal.read(`content/blog/first-home-nas/${fileFor(l)}`));
		const r = await portal.action('/posts/first-home-nas?/save', editorForm('first-home-nas'), { cookie });
		assert.equal(r.type, 'success', r.raw);
		LANGS.forEach((l, i) => assert.equal(portal.read(`content/blog/first-home-nas/${fileFor(l)}`), before[i], l));
	});

	test('CRLF from a <textarea> is written back as LF', async () => {
		const form = editorForm('integration-test-post', { body_en: '\r\nLine one.\r\nLine two.\r\n' });
		const r = await portal.action('/posts/integration-test-post?/save', form, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const raw = portal.read('content/blog/integration-test-post/index.md')!;
		assert.equal(raw.includes('\r'), false, 'CRLF reached the file');
		assert.ok(raw.endsWith('\nLine one.\nLine two.\n'));
		assert.doesNotThrow(() => FrontMatter.parse(raw), 'the portal cannot re-read its own output');
	});

	test('changing one field touches exactly one line', async () => {
		const before = portal.read('content/blog/first-home-nas/index.md')!.split('\n');
		const r = await portal.action(
			'/posts/first-home-nas?/save',
			editorForm('first-home-nas', { description_en: 'A new description for the integration test.' }),
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		const after = portal.read('content/blog/first-home-nas/index.md')!.split('\n');
		assert.equal(after.length, before.length);
		const changed = after.filter((l, i) => l !== before[i]);
		assert.deepEqual(changed, ['description: "A new description for the integration test."']);
	});

	test('adding a first translation to a post that has none works', async () => {
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', {
				title_fr: 'Article de test',
				description_fr: 'Une description.',
				body_fr: '\nCorps.\n'
			}),
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		const fr = portal.read('content/blog/integration-test-post/index.fr.md')!;
		assert.ok(fr.startsWith('---\ntitle: "Article de test"\n'), fr);
	});

	test('an empty title never deletes an existing translation', async () => {
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', { title_fr: '', description_fr: '', body_fr: '' }),
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		assert.ok(portal.exists('content/blog/integration-test-post/index.fr.md'), 'the translation was deleted');
	});

	test('an explicit delete removes a translation, but never English', async () => {
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', { delete_translation_fr: 'on', delete_translation_en: 'on' }),
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		assert.equal(portal.exists('content/blog/integration-test-post/index.fr.md'), false);
		assert.ok(portal.exists('content/blog/integration-test-post/index.md'));
	});

	test('publishing with a blocking problem is refused and writes nothing', async () => {
		const before = portal.read('content/blog/integration-test-post/index.md');
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', { intent: 'publish', body_en: '\n![](missing.webp)\n' }),
			{ cookie }
		);
		assert.equal(r.type, 'failure');
		assert.equal(r.status, 422);
		assert.equal(portal.read('content/blog/integration-test-post/index.md'), before);
	});

	test('Save on a published post runs the checks too (the gate is not button-dependent)', async () => {
		const form = editorForm('first-home-nas', { body_en: '\n![](nowhere.webp)\n' });
		delete form.draft; // published
		const r = await portal.action('/posts/first-home-nas?/save', form, { cookie });
		assert.equal(r.status, 422, r.raw);
	});

	test('a draft save skips the checks — work in progress may be incomplete', async () => {
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', { draft: 'on', body_en: '\n![](not-yet.webp)\n' }),
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
	});

	test('an image uploaded as multipart actually lands in the bundle', async () => {
		// The urlencoded-form bug dropped uploads silently while the save
		// "succeeded"; this is the multipart path the editor now uses.
		const png = new File(
			[Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0))],
			'pixel.webp',
			{ type: 'image/webp' }
		);
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			{ ...editorForm('integration-test-post', { draft: 'on' }), newimage: png },
			{ cookie, multipart: true }
		);
		assert.equal(r.type, 'success', r.raw);
		assert.ok(portal.exists('content/blog/integration-test-post/pixel.webp'));
	});

	test('an image still referenced by the post cannot be deleted', async () => {
		const r = await portal.action(
			'/posts/integration-test-post?/save',
			editorForm('integration-test-post', {
				draft: 'on',
				body_en: '\n![A pixel](pixel.webp)\n',
				deleteimages: JSON.stringify(['pixel.webp'])
			}),
			{ cookie }
		);
		assert.equal(r.type, 'failure');
		assert.ok(portal.exists('content/blog/integration-test-post/pixel.webp'));
	});

	test('deleting needs the slug typed, then removes the whole bundle', async () => {
		const wrong = await portal.action('/posts/integration-test-post?/delete', { confirm: 'nope' }, { cookie });
		assert.equal(wrong.type, 'failure');
		assert.ok(portal.exists('content/blog/integration-test-post/index.md'));

		const ok = await portal.action('/posts/integration-test-post?/delete', { confirm: 'integration-test-post' }, { cookie });
		assert.equal(ok.type, 'redirect', ok.raw);
		assert.equal(portal.exists('content/blog/integration-test-post'), false, 'bundle directory left behind');
	});
});

describe('autosaved drafts', () => {
	const draft = { baseHash: 'abc123', post: { translations: { en: { title: 'Work in progress' } } } };

	test('signed out, every drafts method is refused', async () => {
		for (const method of ['GET', 'PUT', 'DELETE']) {
			const r = await portal.send(method, '/api/drafts/first-home-nas', method === 'PUT' ? { json: draft } : {});
			assert.equal(r.status, 401, method);
		}
	});

	test('a draft round-trips, and deleting it leaves nothing', async () => {
		const put = await portal.send('PUT', '/api/drafts/first-home-nas', { cookie, json: draft });
		assert.equal(put.status, 200);
		const { savedAt } = await put.json();
		assert.ok(!Number.isNaN(Date.parse(savedAt)));

		const got = await (await portal.send('GET', '/api/drafts/first-home-nas', { cookie })).json();
		assert.deepEqual(got.draft, { savedAt, ...draft });

		assert.equal((await portal.send('DELETE', '/api/drafts/first-home-nas', { cookie })).status, 204);
		const gone = await (await portal.send('GET', '/api/drafts/first-home-nas', { cookie })).json();
		assert.equal(gone.draft, null);
	});

	test('autosaving never touches the site files', async () => {
		const before = portal.read('content/blog/first-home-nas/index.md');
		await portal.send('PUT', '/api/drafts/first-home-nas', { cookie, json: draft });
		assert.equal(portal.read('content/blog/first-home-nas/index.md'), before);
		assert.equal(portal.exists('drafts'), false);
		await portal.send('DELETE', '/api/drafts/first-home-nas', { cookie });
	});

	test('malformed, oversized and path-like requests are rejected', async () => {
		const bad = (json: unknown, slug = 'first-home-nas') =>
			portal.send('PUT', `/api/drafts/${slug}`, { cookie, json }).then((r) => r.status);
		assert.equal(await bad('{not json'), 400);
		assert.equal(await bad({ post: {} }), 400, 'missing baseHash');
		assert.equal(await bad({ baseHash: 'x', post: null }), 400, 'null post');
		assert.equal(await bad({ baseHash: 'x', post: { body: 'x'.repeat(1_100_000) } }), 413);
		assert.equal(await bad(draft, 'Upper-Case'), 400);
		// An encoded traversal must not reach the store at another key.
		const r = await portal.send('GET', '/api/drafts/..%2Fauth%2Fcredentials', { cookie });
		assert.ok([400, 404].includes(r.status), String(r.status));
	});

	test('saving the article for real discards its draft', async () => {
		await portal.send('PUT', '/api/drafts/first-home-nas', { cookie, json: draft });
		const r = await portal.action('/posts/first-home-nas?/save', editorForm('first-home-nas'), { cookie });
		assert.equal(r.type, 'success', r.raw);
		const got = await (await portal.send('GET', '/api/drafts/first-home-nas', { cookie })).json();
		assert.equal(got.draft, null);
	});
});

describe('machine translation, against a stand-in DeepL', () => {
	const english = () => {
		const fm = FrontMatter.parse(portal.read('content/blog/out-the-shadow/index.md')!);
		return {
			title: String(fm.get('title')),
			description: String(fm.get('description')),
			body: fm.body,
			eu_funding_text: String(fm.get('eu_funding_text'))
		};
	};
	const translate = (json: unknown) => portal.send('POST', '/api/translate', { cookie, json });

	test('signed out, it is refused and DeepL is never called', async () => {
		const before = deepl.requests.length;
		const r = await portal.send('POST', '/api/translate', { json: { to: 'fr', fields: english() } });
		assert.equal(r.status, 401);
		assert.equal(deepl.requests.length, before);
	});

	test('an article comes back translated, with every file name, URL and marker intact', async () => {
		const src = english();
		const r = await translate({ slug: 'out-the-shadow', to: 'fr', fields: src });
		assert.equal(r.status, 200);
		const { fields, characters, warnings } = await r.json();
		assert.deepEqual(warnings, []);
		assert.ok(characters > 5000);
		assert.equal(fields.title, src.title.toUpperCase());
		assert.equal(fields.eu_funding_text, src.eu_funding_text.toUpperCase());
		// Images: same files in the same order, alt text translated.
		const imgs = (md: string) => [...md.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
		assert.deepEqual(imgs(fields.body).map((m) => m[2]), imgs(src.body).map((m) => m[2]));
		assert.deepEqual(imgs(fields.body).map((m) => m[1]), imgs(src.body).map((m) => m[1].toUpperCase()));
		assert.ok(fields.body.includes('<https://www.youtube.com/watch?v=06qwUUAAmX8>'), 'autolink altered');
		// Paragraph structure is untouched: same blank lines in the same places.
		assert.deepEqual(fields.body.split('\n').map((l: string) => l === ''), src.body.split('\n').map((l) => l === ''));
	});

	test('what reaches DeepL: the right options, and no file names or URLs', async () => {
		const call = deepl.requests.findLast((q) => q.path === '/v2/translate')!;
		assert.equal(call.auth, 'DeepL-Auth-Key test-key:fx');
		assert.equal(call.body?.source_lang, 'EN');
		assert.equal(call.body?.target_lang, 'FR');
		assert.equal(call.body?.formality, 'prefer_more');
		assert.equal(call.body?.tag_handling, 'xml');
		assert.deepEqual(call.body?.ignore_tags, ['k']);
		const sent = (call.body?.text as string[]).join('\n');
		for (const leak of ['otstc1-1.jpg', 'youtube.com', 'https://']) assert.ok(!sent.includes(leak), leak);
	});

	test('Italian is drafted informally, matching how the Italian articles address readers', async () => {
		await translate({ to: 'it', fields: { title: 'Hello', description: '', body: 'Do you see?' } });
		assert.equal(deepl.requests.findLast((q) => q.path === '/v2/translate')!.body?.formality, 'prefer_less');
	});

	test('translating writes nothing to the site', async () => {
		const before = LANGS.map((l) => portal.read(`content/blog/out-the-shadow/${fileFor(l)}`));
		await translate({ slug: 'out-the-shadow', to: 'it', fields: english() });
		LANGS.forEach((l, i) => assert.equal(portal.read(`content/blog/out-the-shadow/${fileFor(l)}`), before[i], l));
	});

	test('bad requests are refused before DeepL is called', async () => {
		const before = deepl.requests.length;
		assert.equal((await translate({ to: 'de', fields: { title: 'x', description: '', body: '' } })).status, 400);
		assert.equal((await translate({ to: 'fr', fields: { title: '', description: '', body: '' } })).status, 400);
		assert.equal((await translate({ to: 'fr', fields: { title: '', description: '', body: 'x'.repeat(150_001) } })).status, 413);
		const plain = await fetch(`${portal.url}/api/translate`, {
			method: 'POST',
			headers: { Cookie: cookie, Origin: portal.url, 'Content-Type': 'text/plain' },
			body: JSON.stringify({ to: 'fr', fields: { title: 'x', description: '', body: '' } })
		});
		assert.ok([403, 415].includes(plain.status), String(plain.status));
		assert.equal(deepl.requests.length, before);
	});

	test('a DeepL failure is reported plainly, not as a crash', async () => {
		const r = await portal.send('POST', '/api/translate', {
			cookie,
			json: { to: 'fr', fields: { title: 'QUOTA', description: '', body: '' } }
		});
		assert.equal(r.status, 502);
		assert.match((await r.json()).message, /allowance is used up/);
	});

	test('the editor offers it, and settings shows the month’s usage', async () => {
		const editor = await (await portal.get('/posts/out-the-shadow', { cookie })).text();
		assert.match(editor, /Draft Français from English/);
		const settings = await (await portal.get('/settings', { cookie })).text();
		assert.match(settings, /1,234 of 500,000 characters/);
	});
});

describe('renaming an article', () => {
	// A bundle to move around, created and torn down by these tests alone.
	const OLD = 'rename-me', NEW = 'renamed-post';

	before(async () => {
		const r = await portal.action(
			'/posts/new?/create',
			{ title: 'Rename Me', category: 'Personal', date: '2026-03-03', description: 'd' },
			{ cookie }
		);
		assert.equal(r.type, 'redirect', r.raw);
		// Give it a French translation and an image reference, so the move has
		// more than one file to keep in step.
		await portal.action(
			`/posts/${OLD}?/save`,
			editorForm(OLD, { title_fr: 'Renomme-moi', description_fr: 'd', body_fr: '\nCorps.\n', draft: 'on' }),
			{ cookie }
		);
		// A near-miss neighbour that must NOT be rewritten. It has to exist, or
		// the link check below rejects the save that sets the link up.
		await portal.action(
			'/posts/new?/create',
			{ title: 'Rename Me 2', category: 'Personal', date: '2026-03-04', description: 'd' },
			{ cookie }
		);
		// Another article links to it; that link must follow the rename.
		await portal.action(
			'/posts/first-home-nas?/save',
			editorForm('first-home-nas', {
				body_en: `\nSee [the other one](/en/blog/${OLD}/) and [not this](/en/blog/${OLD}-2/).\n`
			}),
			{ cookie }
		);
	});

	test('signed out, it is refused and nothing moves', async () => {
		const r = await portal.action(`/posts/${OLD}?/rename`, { slug: 'stolen' }, {});
		assert.equal(r.status, 401);
		assert.ok(portal.exists(`content/blog/${OLD}/index.md`));
		assert.equal(portal.exists('content/blog/stolen'), false);
	});

	test('a bad address is refused before anything is touched', async () => {
		for (const slug of ['Bad Slug', 'bad--slug', '-bad', 'bad-', 'café', '', OLD]) {
			const r = await portal.action(`/posts/${OLD}?/rename`, { slug }, { cookie });
			assert.equal(r.type, 'failure', `${slug}: ${r.raw.slice(0, 120)}`);
		}
		assert.ok(portal.exists(`content/blog/${OLD}/index.md`));
	});

	test('an address already in use is refused', async () => {
		const r = await portal.action(`/posts/${OLD}?/rename`, { slug: 'first-home-nas' }, { cookie });
		assert.equal(r.type, 'failure');
		assert.match(String(r.data?.message), /already exists/);
		assert.ok(portal.read('content/blog/first-home-nas/index.md')!.includes('title:'), 'target was overwritten');
	});

	test('the bundle moves, the front matter follows, and the old folder is gone', async () => {
		const r = await portal.action(`/posts/${OLD}?/rename`, { slug: NEW, redirect: 'on' }, { cookie });
		assert.equal(r.type, 'redirect', r.raw);
		assert.equal(r.location, `/posts/${NEW}?renamed=${OLD}`);

		assert.equal(portal.exists(`content/blog/${OLD}`), false, 'old bundle left behind');
		for (const f of ['index.md', 'index.fr.md']) {
			const raw = portal.read(`content/blog/${NEW}/${f}`);
			assert.ok(raw, `${f} missing`);
			assert.equal(FrontMatter.parse(raw!).get('slug'), NEW, `${f} still claims the old slug`);
		}
	});

	test('the old address redirects, in every language, and stays out of the sitemap', async () => {
		for (const lang of LANGS) {
			const raw = portal.read(`content/redirect-blog-${OLD}-${lang}.md`);
			assert.ok(raw, `no redirect for ${lang}`);
			const fm = FrontMatter.parse(raw!);
			assert.equal(fm.get('type'), 'legacy-redirect');
			assert.equal(fm.get('url'), `/${lang}/blog/${OLD}/`);
			assert.equal(fm.get('redirect_to'), `/${lang}/blog/${NEW}/`);
			assert.match(raw!, /list: false/);
		}
	});

	test('links from other articles follow, and near-misses are left alone', async () => {
		const body = portal.read('content/blog/first-home-nas/index.md')!;
		assert.ok(body.includes(`/en/blog/${NEW}/`), 'link not repointed');
		assert.ok(body.includes(`/en/blog/${OLD}-2/`), 'a different article was rewritten');
		assert.equal(body.includes(`(/en/blog/${OLD}/)`), false);
	});

	test('the renamed article opens at its new address, and the old one 404s', async () => {
		assert.equal((await portal.get(`/posts/${NEW}`, { cookie })).status, 200);
		assert.equal((await portal.get(`/posts/${OLD}`, { cookie })).status, 404);
	});

	test('renaming again repoints the first redirect instead of chaining', async () => {
		const r = await portal.action(`/posts/${NEW}?/rename`, { slug: 'renamed-twice', redirect: 'on' }, { cookie });
		assert.equal(r.type, 'redirect', r.raw);
		const first = portal.read(`content/redirect-blog-${OLD}-en.md`)!;
		assert.equal(FrontMatter.parse(first).get('redirect_to'), '/en/blog/renamed-twice/');
		assert.equal(FrontMatter.parse(first).get('url'), `/en/blog/${OLD}/`, 'the address it answers on moved');
	});

	test('opting out leaves no redirect behind', async () => {
		const r = await portal.action('/posts/renamed-twice?/rename', { slug: 'renamed-bare', redirect: 'off' }, { cookie });
		assert.equal(r.type, 'redirect', r.raw);
		assert.equal(portal.exists('content/redirect-blog-renamed-twice-en.md'), false);
		assert.ok(portal.exists('content/blog/renamed-bare/index.md'));
		await portal.action('/posts/renamed-bare?/delete', { confirm: 'renamed-bare' }, { cookie });
	});
});

describe('gallery and strings', () => {
	test('reordering renumbers the files and captions follow them', async () => {
		const photos = JSON.parse(portal.read('data/gallery_photos.json')!) as { image_url: string; caption: string }[];
		const lastCaption = photos.find((p) => p.image_url === '/gallery/bari/7.jpg')!.caption;
		const order = ['7.jpg', '1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.png', '6.jpg'];
		const captions = order.map((f) => {
			const p = photos.find((x) => x.image_url === `/gallery/bari/${f}`);
			return { filename: f, caption: p?.caption ?? '', altText: '' };
		});
		const r = await portal.action(
			'/gallery/bari?/save',
			{ order: JSON.stringify(order), captions: JSON.stringify(captions), deletes: '[]' },
			{ cookie, multipart: true }
		);
		assert.equal(r.type, 'success', r.raw);
		const after = JSON.parse(portal.read('data/gallery_photos.json')!) as { image_url: string; caption: string }[];
		assert.equal(after.find((p) => p.image_url === '/gallery/bari/1.jpg')?.caption, lastCaption);
		assert.ok(portal.exists('content/gallery/bari/6.png'), 'the PNG kept its extension across the move');
	});

	test('editing one interface string touches one line in one file', async () => {
		const before = { en: portal.read('i18n/en.toml')!, fr: portal.read('i18n/fr.toml')!, it: portal.read('i18n/it.toml')! };
		const r = await portal.action('/i18n?/save', { v_it_nav_home: 'Inizio' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal(portal.read('i18n/en.toml'), before.en);
		assert.equal(portal.read('i18n/fr.toml'), before.fr);
		const a = before.it.split('\n');
		const b = portal.read('i18n/it.toml')!.split('\n');
		assert.deepEqual(b.filter((l, i) => l !== a[i]), ['other = "Inizio"']);
	});

	test('adding a key writes all three files, keeping them in step', async () => {
		const r = await portal.action(
			'/i18n?/save',
			{ new_key: 'integration_key', new_en: 'Hello', new_fr: 'Bonjour', new_it: 'Ciao' },
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		for (const [l, v] of [['en', 'Hello'], ['fr', 'Bonjour'], ['it', 'Ciao']]) {
			assert.match(portal.read(`i18n/${l}.toml`)!, new RegExp(`\\[integration_key\\]\\nother = "${v}"`));
		}
	});
});
