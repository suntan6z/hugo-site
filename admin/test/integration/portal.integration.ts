import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, type Portal } from './harness.ts';
import { FrontMatter } from '../../src/lib/server/content/frontmatter.ts';

let portal: Portal;
let cookie: string;

before(async () => {
	portal = await startPortal();
	cookie = await portal.signIn();
});
after(async () => portal?.stop());

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
