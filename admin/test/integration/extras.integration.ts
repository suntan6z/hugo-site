/**
 * Pages, history, redirects, site settings, subscribers, visitor numbers and
 * the link checker, driven over HTTP against the real build.
 *
 * A portal of its own, because it runs with Resend and Litlyx configured —
 * pointed at the stand-ins below — which the main suite deliberately does not.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { startPortal, startFakeDeepL, type Portal, type FakeDeepL } from './harness.ts';
import { FrontMatter } from '../../src/lib/server/content/frontmatter.ts';
import { readSiteText, readMenu, readTitle } from '../../src/lib/server/content/site-params.ts';

const LANGS = ['en', 'fr', 'it'] as const;
const SEGMENT_EN = 'seg-en-0000';
const SEGMENT_FR = 'seg-fr-0000';
const SHARE = 'test-share-link';

type Seen = { method: string; path: string; query?: string; headers: http.IncomingHttpHeaders; body?: string };

/** Resend, Litlyx and two outside websites (one alive, one gone) on one port. */
async function startFakes() {
	const seen: Seen[] = [];
	let broadcastCount = 0;
	let failSegment: string | null = null;
	const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
	const contacts = [
		{ id: 'c1aaaaaa-0000-0000-0000-000000000001', email: 'reader@example.com', created_at: '2026-09-01 10:00:00.000000+00', unsubscribed: false },
		{ id: 'c2bbbbbb-0000-0000-0000-000000000002', email: 'gone@example.com', created_at: '2026-08-01 10:00:00.000000+00', unsubscribed: true }
	];
	const contactsFr = [
		{ id: 'c3cccccc-0000-0000-0000-000000000003', email: 'lecteur@example.com', created_at: '2026-09-15 10:00:00.000000+00', unsubscribed: false }
	];
	const litlyx: Record<string, unknown> = {
		'/api/data/pages': [
			{ _id: '/en/blog/first-home-nas/', count: 7 },
			{ _id: 'https://lorenzo.loconsole.eu/it/blog/first-home-nas/', count: 2 },
			{ _id: '/en/now/', count: 5 }
		],
		'/api/data/referrers': [{ _id: 'https://mastodon.social/@lv', count: 3 }, { _id: 'https://lorenzo.loconsole.eu/en/', count: 9 }],
		'/api/data/countries': [{ _id: 'IT', count: 4 }],
		'/api/timeline/visits': [{ _id: today, count: 14 }],
		'/api/timeline/sessions': [{ _id: today, count: 6 }]
	};
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		let body = '';
		for await (const chunk of req) body += chunk;
		seen.push({ method: req.method ?? '', path: url.pathname, query: url.search, headers: req.headers, body: body || undefined });
		res.setHeader('Content-Type', 'application/json');
		if (url.pathname === '/emails' && req.method === 'POST') return res.end(JSON.stringify({ id: 'email-test-1' }));
		if (url.pathname === '/broadcasts' && req.method === 'POST') {
			if (failSegment && JSON.parse(body || '{}').segment_id === failSegment) {
				res.statusCode = 500;
				return res.end('{"message":"boom"}');
			}
			return res.end(JSON.stringify({ id: `bc-test-${++broadcastCount}` }));
		}
		if (/^\/broadcasts\/[^/]+\/send$/.test(url.pathname) && req.method === 'POST') return res.end('{}');
		if (/^\/broadcasts\/bc-test-\d+$/.test(url.pathname) && req.method === 'GET') return res.end(JSON.stringify({ id: url.pathname.split('/').pop(), status: 'sent', sent_at: '2026-10-17T07:30:00.000Z' }));
		if (url.pathname === '/alive') return res.end('{}');
		if (url.pathname === '/gone') {
			res.statusCode = 404;
			return res.end('{}');
		}
		const listed = url.pathname === `/segments/${SEGMENT_EN}/contacts` ? contacts : url.pathname === `/segments/${SEGMENT_FR}/contacts` ? contactsFr : null;
		if (listed && req.method === 'GET') {
			// Like Resend: 20 rows unless asked for more, a cursor, and a flag saying whether there are further pages.
			const limit = Number(url.searchParams.get('limit') ?? 20);
			const after = url.searchParams.get('after');
			const start = after ? listed.findIndex((c) => c.id === after) + 1 : 0;
			const data = listed.slice(start, start + limit);
			return res.end(JSON.stringify({ object: 'list', data, has_more: start + data.length < listed.length }));
		}
		if (/^\/contacts\/[^/]+\/segments\/[^/]+$/.test(url.pathname) && req.method === 'POST') return res.end('{"id":"x"}');
		if (url.pathname.startsWith('/contacts/') && req.method === 'DELETE') {
			return res.end(JSON.stringify({ object: 'contact', deleted: true }));
		}
		if (url.pathname in litlyx) {
			if (req.headers['x-shared-link'] !== SHARE) {
				res.statusCode = 400;
				return res.end(JSON.stringify({ message: 'Shared link is not valid.' }));
			}
			return res.end(JSON.stringify(litlyx[url.pathname]));
		}
		res.statusCode = 404;
		res.end('{}');
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		host: `127.0.0.1:${port}`,
		seen,
		/** Makes creating a broadcast for this segment fail, to see what a partial send does. */
		failFor: (segment: string | null) => { failSegment = segment; },
		close: () => new Promise<void>((r) => server.close(() => r()))
	};
}

let portal: Portal;
let cookie: string;
let fakes: Awaited<ReturnType<typeof startFakes>>;
let deepl: FakeDeepL;

before(async () => {
	fakes = await startFakes();
	deepl = await startFakeDeepL();
	portal = await startPortal({
		env: {
			RESEND_API_KEY: 're_test',
			RESEND_API_URL: fakes.url,
			RESEND_SEGMENT_EN: SEGMENT_EN,
			RESEND_SEGMENT_FR: SEGMENT_FR,
			LITLYX_TOKEN: SHARE,
			LITLYX_HOST: fakes.url,
			LINKCHECK_HOSTS: fakes.host,
			DEEPL_API_KEY: 'test-key:fx',
			DEEPL_API_URL: deepl.url,
			CONTACT_FN_URL: deepl.url,
			NEWSLETTER_FN_URL: 'http://127.0.0.1:1'
		}
	});
	cookie = await portal.signIn();
});
after(async () => {
	await portal?.stop();
	await fakes?.close();
	await deepl?.close();
});

const pageFile = (name: string, l: string) =>
	name === 'now'
		? l === 'en' ? 'content/now/index.md' : `content/now/index.${l}.md`
		: l === 'en' ? `content/${name}.md` : `content/${name}.${l}.md`;
const NOW_JSON = 'content/now/now.json';

/** What the Now editor submits, from what is on disk now, with `edit` applied to the data. */
function nowForm(edit: (d: Record<string, any>) => void = () => {}) {
	const data = JSON.parse(portal.read(NOW_JSON)!);
	edit(data);
	const meta = Object.fromEntries(
		LANGS.map((l) => {
			const fm = FrontMatter.parse(portal.read(pageFile('now', l))!);
			return [l, { title: String(fm.get('title') ?? ''), description: String(fm.get('description') ?? '') }];
		})
	);
	return { state: JSON.stringify({ data, meta }) };
}

/** The fields the page editor submits, from what is on disk now. */
function pageForm(name: string, overrides: Record<string, string> = {}) {
	const fields: Record<string, string> = {};
	for (const l of LANGS) {
		const fm = FrontMatter.parse(portal.read(pageFile(name, l))!);
		fields[`title_${l}`] = String(fm.get('title') ?? '');
		fields[`description_${l}`] = String(fm.get('description') ?? '');
		fields[`body_${l}`] = fm.body;
	}
	return { ...fields, ...overrides };
}

describe('the new surfaces are signed-in only', () => {
	const writes: [string, Record<string, string>][] = [
		['/pages/now?/save', { state: '{}' }],
		['/pages/about?/save', { title_en: 'x' }],
		['/redirects?/add', { from: 'x', to: 'first-home-nas' }],
		['/redirects?/remove', { paths: 'content/redirects/x.md' }],
		['/settings?/saveSiteText', { quote: 'x' }],
		['/settings?/saveHero', {}],
		['/settings?/saveResume', {}],
		['/newsletter?/removeSubscriber', { id: 'x', email: 'x' }],
		['/?/checklinks', {}]
	];
	for (const [p, fields] of writes) {
		test(`signed out, POST ${p} is refused`, async () => {
			const r = await portal.action(p, fields);
			assert.equal(r.status, 401);
		});
	}

	test('signed out, history, the photo and the new pages are not served', async () => {
		for (const p of ['/api/history/pages/now', '/api/history/posts/first-home-nas', '/api/hero']) {
			assert.equal((await portal.get(p)).status, 401, p);
		}
		for (const p of ['/pages', '/pages/now', '/redirects', '/visitors']) {
			assert.equal((await portal.get(p)).status, 303, p);
		}
	});
});

describe('pages', () => {
	test('the list and each editor open', async () => {
		const list = await (await portal.get('/pages', { cookie })).text();
		for (const label of ['About', 'Now', 'Contact', 'Privacy policy']) assert.ok(list.includes(label), label);
		const now = await portal.get('/pages/now', { cookie });
		assert.equal(now.status, 200);
		assert.equal((await portal.get('/pages/not-a-page', { cookie })).status, 404);
	});

	test('the Now editor opens on its own form, not the HTML editor', async () => {
		const html = await (await portal.get('/pages/now', { cookie })).text();
		assert.match(html, /Right now/);
		assert.match(html, /The years before/);
		assert.doesNotMatch(html, /HTML \(advanced\)/);
	});

	test('editing a line of the Now page changes now.json and nothing else', async () => {
		const before = Object.fromEntries(LANGS.map((l) => [l, portal.read(pageFile('now', l))]));
		const json = portal.read(NOW_JSON)!;
		const r = await portal.action('/pages/now?/save', nowForm((d) => (d.items[0].text.en = 'Back in class, every evening.')), { cookie });
		assert.equal(r.type, 'success', r.raw);
		for (const l of LANGS) assert.equal(portal.read(pageFile('now', l)), before[l], l);
		const a = json.split('\n');
		assert.deepEqual(portal.read(NOW_JSON)!.split('\n').filter((l, i) => l !== a[i]), ['        "en": "Back in class, every evening.",']);
	});

	test('the Now page refuses a row with no English, and saving nothing is nothing', async () => {
		const empty = await portal.action('/pages/now?/save', nowForm((d) => d.items.push({ logo: 'icon:code', url: '', label: {}, text: {} })), { cookie });
		assert.equal(empty.type, 'failure');
		assert.match(String(empty.data?.message), /problem/);
		const same = await portal.action('/pages/now?/save', nowForm(), { cookie });
		assert.equal(same.type, 'failure');
		assert.match(String(same.data?.message), /Nothing changed/);
	});

	test('a Now title is edited in its language file, front matter only', async () => {
		const before = portal.read(pageFile('now', 'it'))!;
		const form = nowForm();
		const state = JSON.parse(form.state);
		state.meta.it.title = 'Adesso';
		const r = await portal.action('/pages/now?/save', { state: JSON.stringify(state) }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const after = portal.read(pageFile('now', 'it'))!;
		assert.ok(after.startsWith('---\n'));
		assert.equal(after, before.replace('title: "Ora"', 'title: "Adesso"'));
	});

	test('saving without a change is refused as nothing to do', async () => {
		const r = await portal.action('/pages/about?/save', pageForm('about'), { cookie });
		assert.equal(r.type, 'failure');
		assert.match(String(r.data?.message), /Nothing changed/);
	});

	test('removing an id the contact form needs is refused, and nothing is written', async () => {
		const before = portal.read(pageFile('contact', 'fr'));
		const body = FrontMatter.parse(before!).body.replace('id="submit-btn"', 'id="send"');
		const r = await portal.action('/pages/contact?/save', pageForm('contact', { body_fr: body }), { cookie });
		assert.equal(r.status, 422, r.raw);
		assert.match(JSON.stringify(r.data), /submit-btn/);
		assert.equal(portal.read(pageFile('contact', 'fr')), before);
	});

	test('reviewing shows the change and writes nothing', async () => {
		const before = portal.read(pageFile('about', 'it'));
		const r = await portal.action('/pages/about?/review', pageForm('about', { title_it: 'Chi sono davvero' }), { cookie });
		assert.equal(r.type, 'success', r.raw);
		const review = r.data?.review as { changes: { path: string; added: number; removed: number }[] };
		assert.deepEqual(review.changes.map((c) => [c.path, c.added, c.removed]), [['content/about.it.md', 1, 1]]);
		assert.equal(portal.read(pageFile('about', 'it')), before);
	});

	test('a page is drafted into French as HTML, keeping the markup and every id', async () => {
		const en = FrontMatter.parse(portal.read(pageFile('contact', 'en'))!);
		const r = await portal.send('POST', '/api/translate', {
			cookie,
			json: { slug: 'contact', to: 'fr', format: 'html', fields: { title: String(en.get('title')), description: String(en.get('description')), body: en.body } }
		});
		assert.equal(r.status, 200);
		const { fields } = (await r.json()) as { fields: { title: string; body: string } };
		assert.equal(fields.title, 'CONTACT');
		assert.match(fields.body, /id="submit-btn"/);
		const bodyRequest = deepl.requests.find((q) => q.body?.tag_handling === 'html');
		assert.ok(bodyRequest, 'the body went through DeepL’s HTML handling');
		assert.equal(deepl.requests.filter((q) => q.body?.tag_handling === 'xml').length, 0, 'not through the Markdown path');
	});
});

describe('history', () => {
	const git = (...args: string[]) =>
		execFileSync('git', ['-C', portal.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { encoding: 'utf8' });

	test('with no git history there is simply nothing to list', async () => {
		const r = await portal.get('/api/history/pages/now', { cookie });
		assert.equal(r.status, 200);
		assert.deepEqual(((await r.json()) as { revisions: unknown[] }).revisions, []);
	});

	test('earlier versions are listed newest first, and one can be compared without writing anything', async () => {
		git('init', '-q');
		git('add', '-A');
		git('commit', '-qm', 'Start');
		const original = JSON.parse(portal.read(NOW_JSON)!);
		const saved = await portal.action('/pages/now?/save', nowForm((d) => (d.intro.en = 'Right now, this.')), { cookie });
		assert.equal(saved.type, 'success', saved.raw);
		git('commit', '-qam', 'Retitle Now');

		const list = (await (await portal.get('/api/history/pages/now', { cookie })).json()) as { revisions: { sha: string; message: string }[] };
		assert.deepEqual(list.revisions.map((r) => r.message), ['Retitle Now', 'Start']);

		const now = portal.read(NOW_JSON);
		const detail = (await (await portal.get(`/api/history/pages/now/${list.revisions[1].sha}`, { cookie })).json()) as {
			version: { data: { intro: { en: string } }; meta: Record<string, { title: string }> };
			changes: { path: string }[];
		};
		assert.equal(detail.version.data.intro.en, original.intro.en);
		assert.equal(detail.version.meta.en.title, 'Now');
		assert.deepEqual(detail.changes.map((c) => c.path), [NOW_JSON]);
		assert.equal(portal.read(NOW_JSON), now, 'comparing wrote nothing');

		const about = (await (await portal.get('/api/history/pages/about', { cookie })).json()) as { revisions: unknown[] };
		assert.equal(about.revisions.length, 1, 'the other pages keep their own history');

		const post = (await (await portal.get('/api/history/posts/first-home-nas', { cookie })).json()) as { revisions: unknown[] };
		assert.equal(post.revisions.length, 1);
	});

	test('a malformed version id is refused', async () => {
		assert.equal((await portal.get('/api/history/pages/now/not-a-sha', { cookie })).status, 400);
		assert.equal((await portal.get('/api/history/pages/..%2Fhugo/abcdef1', { cookie })).status, 400);
	});
});

describe('redirects', () => {
	const files = (slug: string) => LANGS.map((l) => `content/redirects/blog-${slug}-${l}.md`);

	test('adding one writes a redirect per language', async () => {
		const r = await portal.action('/redirects?/add', { from: 'an-old-typo', to: 'first-home-nas' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		for (const f of files('an-old-typo')) assert.match(portal.read(f)!, /redirect_to: "\/(en|fr|it)\/blog\/first-home-nas\/"/);
	});

	test('a live article’s own address cannot be redirected', async () => {
		const r = await portal.action('/redirects?/add', { from: 'first-home-nas', to: 'ai-fatigue-is-real' }, { cookie });
		assert.equal(r.type, 'failure');
		assert.equal(portal.exists('content/redirects/blog-first-home-nas-en.md'), false);
	});

	test('one pointing at a deleted article is flagged, and can be pointed elsewhere', async () => {
		fs.writeFileSync(
			path.join(portal.root, 'content/redirects/blog-orphan-en.md'),
			'---\ntitle: "Redirecting…"\ntype: "redirect"\nurl: "/en/blog/orphan/"\nredirect_to: "/en/blog/deleted-long-ago/"\nbuild:\n  list: false\n---\n'
		);
		const page = await (await portal.get('/redirects', { cookie })).text();
		assert.match(page, /no longer exists/);

		const r = await portal.action('/redirects?/retarget', { from: 'orphan', to: 'ai-fatigue-is-real' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		for (const f of files('orphan')) assert.match(portal.read(f)!, /\/blog\/ai-fatigue-is-real\//, 'every language, including the ones that were missing');
	});

	test('removing one deletes exactly its files', async () => {
		const r = await portal.action('/redirects?/remove', { paths: files('an-old-typo').join('\n') }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		for (const f of files('an-old-typo')) assert.equal(portal.exists(f), false);
		assert.ok(portal.exists('content/redirects/blog-orphan-en.md'));
		const outside = await portal.action('/redirects?/remove', { paths: 'hugo.toml' }, { cookie });
		assert.equal(outside.type, 'failure');
		assert.ok(portal.exists('hugo.toml'));
	});
});

describe('site settings', () => {
	test('a description changes one line, under its language', async () => {
		const before = portal.read('hugo.toml')!;
		const t = readSiteText(before);
		const r = await portal.action(
			'/settings?/saveSiteText',
			{
				quote: t.quote,
				quoteAuthor: t.quoteAuthor,
				quoteArticle: t.quoteArticle,
				description_en: t.description.en,
				description_fr: t.description.fr,
				description_it: 'Una descrizione\nsu due righe.'
			},
			{ cookie }
		);
		assert.equal(r.type, 'success', r.raw);
		const a = before.split('\n');
		assert.deepEqual(portal.read('hugo.toml')!.split('\n').filter((l, i) => l !== a[i]), ['      description = "Una descrizione su due righe."']);
	});

	test('an empty quote is refused and nothing is written', async () => {
		const before = portal.read('hugo.toml')!;
		const t = readSiteText(before);
		const r = await portal.action(
			'/settings?/saveSiteText',
			{ quote: '  ', quoteAuthor: t.quoteAuthor, quoteArticle: t.quoteArticle, description_en: t.description.en, description_fr: t.description.fr, description_it: t.description.it },
			{ cookie }
		);
		assert.equal(r.type, 'failure');
		assert.equal(portal.read('hugo.toml'), before);
	});

	test('the CV is replaced only by a real PDF', async () => {
		const fake = await portal.action('/settings?/saveResume', { resume: new File(['<html>not a pdf'], 'cv.pdf') }, { cookie, multipart: true });
		assert.equal(fake.type, 'failure');
		assert.equal(portal.exists('static/cv-fr.pdf'), false);
		const pdf = await portal.action('/settings?/saveResume', { resume: new File(['%PDF-1.7\n%test'], 'cv.pdf') }, { cookie, multipart: true });
		assert.equal(pdf.type, 'success', pdf.raw);
		assert.equal(portal.read('static/cv-fr.pdf'), '%PDF-1.7\n%test');
	});

	test('the photo is written as both files, and refused when the bytes are not images', async () => {
		const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
		const bad = await portal.action('/settings?/saveHero', { hero_webp: new File([jpeg], 'hero.webp'), hero_jpeg: new File([jpeg], 'hero.jpeg') }, { cookie, multipart: true });
		assert.equal(bad.type, 'failure');
		assert.equal(portal.exists('assets/img/hero.webp'), false);
		const ok = await portal.action('/settings?/saveHero', { hero_webp: new File([webp], 'hero.webp'), hero_jpeg: new File([jpeg], 'hero.jpeg') }, { cookie, multipart: true });
		assert.equal(ok.type, 'success', ok.raw);
		assert.deepEqual([...fs.readFileSync(path.join(portal.root, 'assets/img/hero.webp'))], [...webp]);
		const served = await portal.get('/api/hero', { cookie });
		assert.equal(served.headers.get('content-type'), 'image/jpeg');
	});
});

describe('subscribers', () => {
	test('the newsletter page lists them', async () => {
		const html = await (await portal.get('/newsletter', { cookie })).text();
		assert.match(html, /reader@example\.com/);
		assert.match(html, /gone@example\.com/);
	});

	test('a remove whose address does not match the id is refused before Resend is asked', async () => {
		const r = await portal.action('/newsletter?/removeSubscriber', { id: 'c1aaaaaa-0000-0000-0000-000000000001', email: 'someone-else@example.com' }, { cookie });
		assert.equal(r.status, 409);
		assert.equal(fakes.seen.filter((s) => s.method === 'DELETE').length, 0);
	});

	test('a matching remove deletes that contact, and the log keeps no address', async () => {
		const r = await portal.action('/newsletter?/removeSubscriber', { id: 'c1aaaaaa-0000-0000-0000-000000000001', email: 'reader@example.com' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.deepEqual(fakes.seen.filter((s) => s.method === 'DELETE').map((s) => s.path), ['/contacts/c1aaaaaa-0000-0000-0000-000000000001']);
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /subscriber-removed/);
		assert.doesNotMatch(log, /reader@example\.com/);
	});
});

describe('the backup section', () => {
	test('Settings links the whole site as a zip, a clone command and the subscriber list', async () => {
		const html = await (await portal.get('/settings', { cookie })).text();
		assert.match(html, /Backup/);
		assert.match(html, /https:\/\/github\.com\/[^"]+\/archive\/refs\/heads\/main\.zip/);
		assert.match(html, /git clone https:\/\/github\.com\//);
		assert.match(html, /\/newsletter\/subscribers\.csv/);
	});

	test('it makes no call to GitHub from a local run, which tests must never do', async () => {
		assert.ok(!fakes.seen.some((s) => /github/.test(s.headers.host ?? '')));
	});
});

describe('the subscriber export', () => {
	test('it downloads as a spreadsheet file, with everyone on the list and who has left', async () => {
		const r = await portal.get('/newsletter/subscribers.csv', { cookie });
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type') ?? '', /text\/csv/);
		assert.match(r.headers.get('content-disposition') ?? '', /attachment; filename="subscribers-\d{4}-\d{2}-\d{2}\.csv"/);
		assert.match(r.headers.get('cache-control') ?? '', /no-store/);
		const text = await r.text();
		assert.match(text, /email,status,language,joined \(UTC\)/);
		assert.match(text, /reader@example\.com,subscribed,en,2026-09-01 10:00/);
		assert.match(text, /gone@example\.com,unsubscribed,en,2026-08-01 10:00/);
		assert.match(text, /lecteur@example\.com,subscribed,fr,2026-09-15 10:00/, 'the French list is in it, marked as such');
	});

	test('it asks Resend for a full page and follows the cursor, rather than taking the first twenty', async () => {
		const asked = fakes.seen.filter((s) => s.method === 'GET' && s.path === `/segments/${SEGMENT_EN}/contacts`);
		assert.ok(asked.length > 0);
		assert.ok(asked.every((s) => /[?&]limit=100\b/.test(s.query ?? '')), 'always asks for the largest page');
	});

	test('it is for a signed-in visitor only', async () => {
		assert.notEqual((await portal.get('/newsletter/subscribers.csv')).status, 200);
	});

	test('the log records that it was done and how many, never an address', async () => {
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /subscribers-exported/);
		assert.doesNotMatch(log, /reader@example\.com|gone@example\.com/);
	});
});

describe('a draft shared by link', () => {
	const SLUG = 'out-the-shadow';
	const share = async () => {
		const r = await portal.action(`/posts/${SLUG}?/share`, {}, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const html = await (await portal.get(`/posts/${SLUG}`, { cookie })).text();
		const m = /\/preview\/([A-Za-z0-9_-]{32})/.exec(html);
		assert.ok(m, 'the editor shows the link');
		return m![1];
	};
	const open = (token: string, q = '') => portal.get(`/preview/${token}${q}`); // no cookie: a stranger

	test('a stranger with the link reads the article, as a draft, with no account', async () => {
		const token = await share();
		const r = await open(token);
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type') ?? '', /text\/html/);
		const html = await r.text();
		assert.match(html, /Draft<\/b> — not published/);
		assert.match(html, /post-title/);
	});

	test('it is kept out of search and out of caches, and runs no script', async () => {
		const token = await share();
		const r = await open(token);
		assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/);
		assert.match(r.headers.get('cache-control') ?? '', /no-store/);
		const csp = r.headers.get('content-security-policy') ?? '';
		assert.match(csp, /default-src 'none'/);
		assert.doesNotMatch(csp, /script-src/);
		assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
	});

	test('a wrong, malformed or empty token is a plain 404, the same for all', async () => {
		for (const t of ['A'.repeat(32), 'short', 'A'.repeat(100)]) {
			const r = await open(t);
			assert.equal(r.status, 404, t);
		}
		// A path trick is not a token at all: it falls out of the public set and is sent to sign in.
		for (const t of ['..%2f..%2fposts', 'a.b']) assert.notEqual((await open(t)).status, 200, t);
	});

	test('its pictures come only from the shared article\'s folder, and only with the token', async () => {
		const token = await share();
		const ok = await open(token, '').then(() => portal.get(`/preview/${token}/img/fundacjalogo.png`));
		assert.equal(ok.status, 200);
		assert.equal(ok.headers.get('content-type'), 'image/png');
		assert.equal((await portal.get(`/preview/${token}/img/index.md`)).status, 404, 'not a picture');
		assert.equal((await portal.get(`/preview/${token}/img/logo.svg`)).status, 404, 'no svg');
		assert.equal((await portal.get(`/preview/${'B'.repeat(32)}/img/fundacjalogo.png`)).status, 404, 'no token, no picture');
	});

	test('it shows the autosave when there is one, and the saved article when there is not', async () => {
		const token = await share();
		const before = await (await open(token)).text();
		assert.doesNotMatch(before, /Words only the autosave has/);
		const saved = JSON.parse(JSON.stringify({
			date: '2026-01-01', category: 'Personal', draft: true,
			translations: { en: { title: 'Autosaved heading', description: '', body: 'Words only the autosave has.', untranslated: false }, fr: { title: '', description: '', body: '', untranslated: false }, it: { title: '', description: '', body: '', untranslated: false } }
		}));
		const put = await portal.send('PUT', `/api/drafts/${SLUG}`, { cookie, json: { baseHash: 'x', post: saved } });
		assert.equal(put.status, 200);
		const during = await (await open(token)).text();
		assert.match(during, /Words only the autosave has/);
		assert.match(during, /Autosaved heading/);
		await portal.send('DELETE', `/api/drafts/${SLUG}`, { cookie });
		assert.doesNotMatch(await (await open(token)).text(), /Words only the autosave has/);
	});

	test('a new link replaces the old one, which stops working', async () => {
		const first = await share();
		const second = await share();
		assert.notEqual(first, second);
		assert.equal((await open(first)).status, 404);
		assert.equal((await open(second)).status, 200);
	});

	test('stopping sharing ends it at once', async () => {
		const token = await share();
		const r = await portal.action(`/posts/${SLUG}?/unshare`, {}, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal((await open(token)).status, 404);
		assert.doesNotMatch(await (await portal.get(`/posts/${SLUG}`, { cookie })).text(), new RegExp(`/preview/${token}`));
	});

	test('after a week it is gone, and cleared from the store when found out', async () => {
		const token = await share();
		const file = path.join(portal.state, 'previews', 't', `${token}.json`);
		const link = JSON.parse(fs.readFileSync(file, 'utf8'));
		fs.writeFileSync(file, JSON.stringify({ ...link, expiresAt: new Date(Date.now() - 1000).toISOString() }));
		assert.equal((await open(token)).status, 404);
		assert.equal(fs.existsSync(file), false);
	});

	test('the log records that a link was made, never the link', async () => {
		const token = await share();
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /preview-shared/);
		assert.ok(!log.includes(token));
	});
});

describe('the search palette\'s index', () => {
	type Index = { items: { kind: string; title: string; hint?: string; href?: string }[] };
	const index = async () => (await (await portal.get('/api/search', { cookie })).json()) as Index;

	test('it lists articles, pages, cities and the site\'s own texts, each with where it goes', async () => {
		const { items } = await index();
		const kinds = new Set(items.map((i) => i.kind));
		for (const k of ['article', 'page', 'gallery', 'string']) assert.ok(kinds.has(k), k);
		assert.ok(items.some((i) => i.kind === 'article' && i.href === '/posts/first-home-nas'));
		assert.ok(items.some((i) => i.kind === 'page' && i.href === '/pages/contact'));
		assert.ok(items.some((i) => i.kind === 'gallery' && i.href === '/gallery/bari'));
		assert.ok(items.every((i) => i.title && i.href?.startsWith('/')), 'nothing without a way to open it');
	});

	test('a string opens the Strings screen already filtered to its key', async () => {
		const s = (await index()).items.find((i) => i.kind === 'string')!;
		assert.match(s.href!, /^\/i18n\?q=/);
		assert.equal(decodeURIComponent(s.href!.split('q=')[1]), s.hint);
	});

	test('it is for a signed-in visitor only', async () => {
		assert.notEqual((await portal.get('/api/search')).status, 200);
	});
});

describe('site name and menu', () => {
	const nav = (over: Record<string, string> = {}): Record<string, string> => {
		const f: Record<string, string> = { title: 'Lorenzo Loconsole' };
		for (const l of ['en', 'fr', 'it']) {
			const m = readMenu(portal.read('hugo.toml')!);
			for (const ref of m.order) f[`name:${l}:${ref}`] = m.names[l as 'en'][ref];
		}
		return { ...f, ...over };
	};
	// FormData would carry `order` several times; the helper takes one value, so send the list as repeated pairs.
	const post = (fields: Record<string, string>, order: string[]) => {
		const body = new URLSearchParams(fields);
		for (const o of order) body.append('order', o);
		return fetch(`${portal.url}/settings?/saveNav`, {
			method: 'POST', body, redirect: 'manual',
			headers: { 'x-sveltekit-action': 'true', Origin: portal.url, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }
		});
	};
	const ORDER = ['/about', '/now', '/blog', '/contact'];
	/** An action's own status: SvelteKit answers 200 and puts the outcome in the body. */
	const outcome = async (r: Response) => (JSON.parse(await r.text()) as { status?: number }).status ?? r.status;

	test('the settings page shows the menu and the name', async () => {
		const html = await (await portal.get('/settings', { cookie })).text();
		assert.match(html, /Site name and menu/);
		assert.match(html, /À propos/);
	});

	test('nothing changed is said so, and writes nothing', async () => {
		const before = portal.read('hugo.toml');
		const r = await post(nav(), ORDER);
		assert.match(await r.text(), /Nothing changed/);
		assert.equal(portal.read('hugo.toml'), before);
	});

	test('a new name and one renamed entry are one commit touching two lines', async () => {
		const before = portal.read('hugo.toml')!.split('\n');
		const r = await post(nav({ title: 'Lorenzo L.', 'name:fr:/now': 'En ce moment' }), ORDER);
		assert.match(await r.text(), /navSaved|"type":"success"/);
		const after = portal.read('hugo.toml')!.split('\n');
		const changed = after.flatMap((l, i) => (l !== before[i] ? [l.trim()] : []));
		assert.deepEqual(changed, ['title = "Lorenzo L."', 'name = "En ce moment"']);
	});

	test('the order is rewritten as weights, the same in every language', async () => {
		await post(nav({ title: 'Lorenzo L.' }), ['/contact', '/about', '/now', '/blog']);
		const m = readMenu(portal.read('hugo.toml')!);
		assert.deepEqual(m.order, ['/contact', '/about', '/now', '/blog']);
		const weights = [...portal.read('hugo.toml')!.matchAll(/pageRef = "(\/[a-z]+)"\n\s+weight = (\d)/g)].map((x) => `${x[1]}:${x[2]}`);
		assert.equal(new Set(weights).size, 4, 'three languages, one order');
	});

	test('a page added to, or dropped from, the menu is refused', async () => {
		const before = portal.read('hugo.toml');
		const r = await post(nav({ title: 'Lorenzo L.' }), ['/contact', '/about', '/now']);
		assert.equal(await outcome(r), 400);
		assert.equal(portal.read('hugo.toml'), before);
	});

	test('an empty name, in any language, is refused', async () => {
		const before = portal.read('hugo.toml');
		const r = await post(nav({ 'name:it:/blog': ' ' }), ['/contact', '/about', '/now', '/blog']);
		assert.equal(await outcome(r), 400);
		assert.equal(portal.read('hugo.toml'), before);
	});

	test('an empty site name is refused', async () => {
		const r = await post(nav({ title: '  ' }), ['/contact', '/about', '/now', '/blog']);
		assert.equal(await outcome(r), 400);
		assert.match(readTitle(portal.read('hugo.toml')!), /Lorenzo L\./);
	});
});

describe('the library', () => {
	// A real 1×1 PNG; the repository checks that what it is given is an image.
	const PNG = (shade: number) => {
		const crc = (b: Buffer) => {
			let c = ~0;
			for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
			return ~c >>> 0;
		};
		const chunk = (type: string, data: Buffer) => {
			const body = Buffer.concat([Buffer.from(type), data]);
			const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
			const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
			return Buffer.concat([len, body, sum]);
		};
		const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
		const idat = zlib.deflateSync(Buffer.from([0, shade]));
		return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
	};
	const orphan = 'content/blog/first-home-nas/zz-unused.png';
	const pngFile = (name: string, shade: number) => new File([PNG(shade)], name, { type: 'image/png' });

	// Written before anything has asked for the library, which keeps its answer for a few minutes.
	before(() => fs.writeFileSync(path.join(portal.root, orphan), PNG(10)));

	test('it lists the pictures, and marks the one nothing refers to', async () => {
		const html = await (await portal.get('/media', { cookie })).text();
		assert.match(html, /zz-unused\.png/);
		assert.match(html, /Unused/);
		assert.match(html, /contact-chill\.gif/);
	});

	test('a picture is served to a signed-in visitor only, and only from where pictures live', async () => {
		const ok = await portal.get(`/api/media/${orphan}`, { cookie });
		assert.equal(ok.status, 200);
		assert.equal(ok.headers.get('content-type'), 'image/png');
		assert.match(ok.headers.get('content-security-policy') ?? '', /sandbox/);
		assert.notEqual((await portal.get(`/api/media/${orphan}`)).status, 200);
		assert.equal((await portal.get('/api/media/hugo.toml', { cookie })).status, 404);
		assert.equal((await portal.get('/api/media/content/blog/first-home-nas/index.md', { cookie })).status, 404);
	});

	test('a picture something uses cannot be deleted', async () => {
		const r = await portal.action('/media?/delete', { path: 'static/img/contact-chill.gif', confirm: 'delete' }, { cookie });
		assert.equal(r.status, 400);
		assert.ok(portal.exists('static/img/contact-chill.gif'));
	});

	test('deleting needs the dialog\'s confirmation', async () => {
		const r = await portal.action('/media?/delete', { path: orphan }, { cookie });
		assert.equal(r.status, 400);
		assert.ok(portal.exists(orphan));
	});

	test('a replacement must be the same kind of file, or every reference would break', async () => {
		const r = await portal.action('/api/media', { path: orphan, name: 'zz-unused.jpg', file: pngFile('zz-unused.jpg', 50) }, { cookie, multipart: true });
		assert.equal(r.status, 400);
		assert.match(r.raw, /PNG/);
	});

	test('only a picture the library lists can be replaced', async () => {
		const r = await portal.action('/api/media', { path: 'hugo.toml', name: 'x.png', file: pngFile('x.png', 50) }, { cookie, multipart: true });
		assert.equal(r.status, 400);
		assert.match(portal.read('hugo.toml')!, /baseURL|title/);
	});

	test('replacing keeps the name and changes the bytes, and the log says so', async () => {
		const before = fs.readFileSync(path.join(portal.root, orphan));
		const r = await portal.action('/api/media', { path: orphan, name: 'zz-unused.png', file: pngFile('zz-unused.png', 200) }, { cookie, multipart: true });
		assert.equal(r.status, 200, r.raw);
		assert.notDeepEqual(fs.readFileSync(path.join(portal.root, orphan)), before);
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /image-replaced/);
	});

	test('an unused article picture can be deleted, once', async () => {
		const r = await portal.action('/media?/delete', { path: orphan, confirm: 'delete' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal(portal.exists(orphan), false);
		const again = await portal.action('/media?/delete', { path: orphan, confirm: 'delete' }, { cookie });
		assert.equal(again.status, 400);
	});
});

/** One email to one list, as the page sends it. */
const dispatch = (over: Record<string, string> = {}) => ({ list: 'en', lang: 'en', subject: 'A subject', title: 'A headline', intro: 'An intro for readers.', note: '', ...over });
/** The fields the newsletter actions take: the article and the emails. */
const mailOf = (ds: Record<string, string>[] = [dispatch()], slug = 'first-home-nas') => ({ slug, dispatches: JSON.stringify(ds) });

describe('newsletter: test copy and confirmed send', () => {
	const mail = mailOf();
	const sent = (p: string) => fakes.seen.filter((s) => s.method === 'POST' && s.path === p);

	test('a test copy goes to one address, marked as a test, with a real unsubscribe link', async () => {
		const r = await portal.action('/newsletter?/test', { ...mail, to: 'me@example.com' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const [call] = sent('/emails');
		const body = JSON.parse(call.body ?? '{}');
		assert.deepEqual(body.to, ['me@example.com']);
		assert.equal(body.subject, '[Test] A subject');
		assert.ok(!String(body.html).includes('RESEND_UNSUBSCRIBE_URL'));
		assert.equal(sent('/broadcasts').length, 0, 'a test is not a broadcast');
	});

	test('a test to something that is not an address is refused before Resend is asked', async () => {
		const before = sent('/emails').length;
		const r = await portal.action('/newsletter?/test', { ...mail, to: 'not-an-address' }, { cookie });
		assert.equal(r.status, 400);
		assert.equal(sent('/emails').length, before);
	});

	test('the audit log records a test without keeping the address', async () => {
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /newsletter-test/);
		assert.doesNotMatch(log, /me@example\.com/);
	});

	test('sending without the dialog\'s confirmation reaches nobody', async () => {
		const r = await portal.action('/newsletter?/send', { ...mail }, { cookie });
		assert.equal(r.status, 400);
		assert.equal(sent('/broadcasts').length, 0);
	});

	test('the old confirmation, the subject typed back, no longer sends', async () => {
		const r = await portal.action('/newsletter?/send', { ...mail, confirm: 'A subject' }, { cookie });
		assert.equal(r.status, 400);
		assert.equal(sent('/broadcasts').length, 0);
	});

	test('a confirmed send creates the broadcast and sends it', async () => {
		const r = await portal.action('/newsletter?/send', { ...mail, confirm: 'send' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal(sent('/broadcasts').length, 1);
		assert.equal(sent('/broadcasts/bc-test-1/send').length, 1);
		const body = JSON.parse(sent('/broadcasts')[0].body ?? '{}');
		assert.equal(body.subject, 'A subject');
		assert.equal(body.segment_id, SEGMENT_EN, 'to the English list, by segment');
		assert.equal(body.audience_id, undefined, 'not through the deprecated audiences');
		assert.ok(String(body.html).includes('RESEND_UNSUBSCRIBE_URL'), 'a broadcast keeps Resend\'s own token');
	});
});

describe('newsletter: one email per list', () => {
	const posts = (p: string) => fakes.seen.filter((s) => s.method === 'POST' && s.path === p);
	const confirmed = (ds: Record<string, string>[]) => ({ ...mailOf(ds), confirm: 'send' });
	const bodies = () => posts('/broadcasts').map((c) => JSON.parse(c.body ?? '{}'));
	const fr = (over: Record<string, string> = {}) => dispatch({ list: 'fr', lang: 'fr', subject: 'Un sujet', title: 'Un titre', intro: 'Une intro.', ...over });

	test('English and French are two broadcasts, each to its own list, each in its own words', async () => {
		const before = bodies().length;
		const r = await portal.action('/newsletter?/send', confirmed([dispatch(), fr()]), { cookie });
		assert.equal(r.type, 'success', r.raw);
		const [en, frb] = bodies().slice(before);
		assert.equal(en.segment_id, SEGMENT_EN);
		assert.equal(en.subject, 'A subject');
		assert.equal(frb.segment_id, SEGMENT_FR);
		assert.equal(frb.subject, 'Un sujet');
		assert.match(String(frb.html), /<html lang="fr"/);
		assert.match(String(frb.html), /Lire l'article/);
		assert.match(String(frb.html), /\/fr\/blog\/first-home-nas\//);
		assert.ok(String(frb.html).includes('RESEND_UNSUBSCRIBE_URL'));
		assert.match(String(en.html), /\/en\/blog\/first-home-nas\//);
	});

	test('what was sent is on record per list, with who was on it', async () => {
		const html = await (await portal.get('/newsletter?tab=sent', { cookie })).text();
		assert.match(html, /Un sujet/);
	});

	test('a list is not sent a language the article does not have: that needs the English version asked for', async () => {
		const before = bodies().length;
		// out-the-shadow-3 is written in English only.
		const r = await portal.action('/newsletter?/send', { ...mailOf([dispatch({ list: 'fr', lang: 'fr', subject: 'x' })], 'out-the-shadow-3'), confirm: 'send' }, { cookie });
		assert.equal(r.status, 400);
		assert.match(r.raw, /no FR version/);
		assert.equal(bodies().length, before);
	});

	test('the English version can go to the French list when asked for, in English, to that list', async () => {
		const before = bodies().length;
		const r = await portal.action('/newsletter?/send', confirmed([dispatch({ list: 'fr', lang: 'en', subject: 'In English' })]), { cookie });
		assert.equal(r.type, 'success', r.raw);
		const [b] = bodies().slice(before);
		assert.equal(b.segment_id, SEGMENT_FR);
		assert.match(String(b.html), /<html lang="en"/);
		assert.match(String(b.html), /Read the article/);
	});

	test('a list that does not exist, a language that does not exist, a list twice and nothing at all are all refused', async () => {
		const before = bodies().length;
		for (const ds of [[dispatch({ list: 'it', lang: 'it' })], [dispatch({ lang: 'xx' })], [dispatch(), dispatch()], []]) {
			const r = await portal.action('/newsletter?/send', confirmed(ds), { cookie });
			assert.equal(r.status, 400, JSON.stringify(ds));
		}
		assert.equal(bodies().length, before);
	});

	test('when one list fails the others still go, and the page is told which did not', async () => {
		fakes.failFor(SEGMENT_FR);
		try {
			const sends = () => fakes.seen.filter((x) => x.method === 'POST' && /^\/broadcasts\/[^/]+\/send$/.test(x.path)).length;
			const before = sends();
			const r = await portal.action('/newsletter?/send', confirmed([dispatch({ subject: 'Goes' }), fr({ subject: 'Fails' })]), { cookie });
			assert.equal(r.type, 'success', r.raw);
			assert.match(r.raw, /boom|500/, 'the failure is reported, with its reason');
			assert.equal(sends() - before, 1, 'the English one went, the French one did not');
		} finally {
			fakes.failFor(null);
		}
	});

	test('a test copy is of one email, in its own language', async () => {
		const before = posts('/emails').length;
		const r = await portal.action('/newsletter?/test', { ...mailOf([fr()]), to: 'me@example.com' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const body = JSON.parse(posts('/emails').slice(before)[0].body ?? '{}');
		assert.equal(body.subject, '[Test] Un sujet');
		assert.match(String(body.html), /Lire l'article/);
	});

	test('the page offers the article\'s languages and how many are on each list', async () => {
		const html = await (await portal.get('/newsletter?slug=first-home-nas', { cookie })).text();
		assert.match(html, /Français/);
		assert.match(html, /Write to the English list|Write to the Français list|Write to the/);
	});

	test('what exists in each language is read for the article chosen', async () => {
		const r = await portal.get('/api/newsletter-article/first-home-nas', { cookie });
		assert.equal(r.status, 200);
		const a = (await r.json()) as { translations: Record<string, { exists: boolean }>; urls: Record<string, string> };
		assert.equal(a.translations.en.exists, true);
		assert.match(a.urls.fr, /\/fr\/blog\/first-home-nas\/$/);
		assert.equal((await portal.get('/api/newsletter-article/not-an-article', { cookie })).status, 404);
		assert.notEqual((await portal.get('/api/newsletter-article/first-home-nas')).status, 200);
	});
});

describe('newsletter: scheduling from the flow', () => {
	const mail = { ...mailOf([dispatch({ subject: 'Held subject', note: 'A word first.' })]), confirm: 'send' };
	const held = (subject: string) => ({ ...mail, ...mailOf([dispatch({ subject, note: 'A word first.' })]) });
	const broadcasts = () => fakes.seen.filter((s) => s.method === 'POST' && s.path === '/broadcasts').length;
	const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

	test('today is refused, and nothing is held', async () => {
		const r = await portal.action('/newsletter?/schedule', { ...mail, day: day(0) }, { cookie });
		assert.equal(r.status, 400);
		assert.match(r.raw, /after today/);
	});

	test('without the dialog\'s confirmation nothing is held either', async () => {
		const r = await portal.action('/newsletter?/schedule', { ...mail, confirm: '', day: day(3) }, { cookie });
		assert.equal(r.status, 400);
	});

	test('a later morning is held: listed as scheduled, and nothing is sent', async () => {
		const before = broadcasts();
		const r = await portal.action('/newsletter?/schedule', { ...mail, day: day(3) }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal(broadcasts(), before, 'held, not sent');
		const html = await (await portal.get('/newsletter?tab=sent', { cookie })).text();
		assert.match(html, /Held subject/);
		assert.match(html, /Waiting/);
	});

	test('the runner leaves it alone until its morning', async () => {
		const before = broadcasts();
		await portal.send('POST', '/api/schedule/run', { cookie, json: undefined });
		assert.equal(broadcasts(), before);
	});

	test('scheduling again replaces it rather than doubling it', async () => {
		await portal.action('/newsletter?/schedule', { ...held('Replaced subject'), day: day(4) }, { cookie });
		const html = await (await portal.get('/newsletter?tab=sent', { cookie })).text();
		assert.match(html, /Replaced subject/);
		assert.doesNotMatch(html, /Held subject/);
	});

	test('cancelling removes it', async () => {
		const r = await portal.action('/newsletter?/cancelScheduled', { slug: 'first-home-nas' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		const html = await (await portal.get('/newsletter?tab=sent', { cookie })).text();
		assert.doesNotMatch(html, /Replaced subject/);
	});

	test('what has been sent has a way to its numbers at Resend, and Resend\'s own word for its state', async () => {
		const html = await (await portal.get('/newsletter?tab=sent', { cookie })).text();
		assert.match(html, /resend\.com\/broadcasts\/bc-test-1/);
		assert.ok(fakes.seen.some((x) => x.method === 'GET' && x.path === '/broadcasts/bc-test-1'), 'Resend was asked how it stands');
	});
});

describe('which list a subscriber is on', () => {
	const ID = 'c1aaaaaa-0000-0000-0000-000000000001';
	const calls = () => fakes.seen.filter((s) => s.path.startsWith(`/contacts/${ID}/segments/`)).map((s) => `${s.method} ${s.path.split('/').pop()}`);

	test('the list shows each person with their language, and the language of a person can be changed', async () => {
		const html = await (await portal.get('/newsletter?tab=subscribers', { cookie })).text();
		assert.match(html, /lecteur@example\.com/);
		assert.match(html, /reader@example\.com/);
		assert.match(html, /EN \d+ · FR \d+/, 'a count per list');
	});

	test('moving someone adds them to the new list first and then takes them off the old one', async () => {
		const r = await portal.action('/newsletter?/setLanguage', { id: ID, email: 'reader@example.com', lang: 'fr' }, { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.deepEqual(calls(), [`POST ${SEGMENT_FR}`, `DELETE ${SEGMENT_EN}`]);
	});

	test('the log keeps who was moved and where, never the address', async () => {
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /subscriber-language/);
		assert.doesNotMatch(log.split('\n').filter((l) => l.includes('subscriber-language')).join('\n'), /example\.com/);
	});

	test('a stale page, a list that does not exist and a move to the same list change nothing', async () => {
		const before = calls().length;
		assert.equal((await portal.action('/newsletter?/setLanguage', { id: ID, email: 'someone-else@example.com', lang: 'fr' }, { cookie })).status, 409);
		assert.equal((await portal.action('/newsletter?/setLanguage', { id: ID, email: 'reader@example.com', lang: 'it' }, { cookie })).status, 400);
		assert.equal((await portal.action('/newsletter?/setLanguage', { id: ID, email: 'reader@example.com', lang: 'xx' }, { cookie })).status, 400);
		assert.equal(calls().length, before);
	});
});

describe('visitor numbers', () => {
	test('the Visitors page reads Litlyx through the shareable link', async () => {
		const html = await (await portal.get('/visitors', { cookie })).text();
		assert.match(html, />6<\/span>\s*<span class="l[^"]*">visits/);
		assert.match(html, />14<\/span>\s*<span class="l[^"]*">pages read/);
		assert.match(html, /href="\/posts\/first-home-nas"/);
		assert.match(html, /Italy/);
		assert.match(html, /mastodon\.social/);
		assert.doesNotMatch(html, /<td class="q[^"]*">lorenzo\.loconsole\.eu<\/td>/, 'the site referring to itself is not a source');
		const asked = fakes.seen.filter((s) => s.path.startsWith('/api/'));
		assert.ok(asked.length >= 5);
		assert.ok(asked.every((s) => s.headers['x-shared-link'] === SHARE && s.headers['x-shared-from'] && s.headers['x-limit']));
	});

	test('the home screen summary includes them', async () => {
		const r = (await (await portal.get('/api/insights', { cookie })).json()) as { visitors: { summary: { visits: number; views: number } } };
		assert.equal(r.visitors.summary.visits, 6);
		assert.equal(r.visitors.summary.views, 14);
	});

	test('and a daily line for the sparkline, and the audience with its month of growth', async () => {
		const r = (await (await portal.get('/api/insights', { cookie })).json()) as {
			visitors: { summary: { series: number[] } };
			subscribers: { total: number; newThisMonth: number; series: number[] } | null;
		};
		assert.ok(r.visitors.summary.series.length >= 7 && r.visitors.summary.series.every((n) => Number.isFinite(n)));
		// Three contacts across the lists, one of whom unsubscribed: two readers.
		assert.equal(r.subscribers?.total, 2);
		assert.equal(r.subscribers?.series.length, 30);
		assert.equal(r.subscribers?.series.at(-1), 2, 'today\'s figure is the whole list');
		assert.ok(r.subscribers!.series.every((n, i, a) => i === 0 || n >= a[i - 1]), 'cumulative, so it never falls');
	});
});

describe('outside links', () => {
	const gone = () => `${fakes.url}/gone`;

	test('a link found gone twice, a day apart, becomes a card, and fixing it rewrites the text', async () => {
		const file = 'content/blog/first-home-nas/index.md';
		const fm = FrontMatter.parse(portal.read(file)!);
		fs.writeFileSync(path.join(portal.root, file), fm.setBody(`${fm.body}\n\nSee [the old guide](${gone()}) and [this one](${fakes.url}/alive).\n`).serialize());
		const nowData = JSON.parse(portal.read(NOW_JSON)!);
		nowData.archive[0].note.fr = `Voir l’[ancien lien](${gone()}).`;
		fs.writeFileSync(path.join(portal.root, NOW_JSON), `${JSON.stringify(nowData, null, 2)}\n`);

		// It failed once already, two days ago.
		const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
		fs.mkdirSync(path.join(portal.state, 'state'), { recursive: true });
		fs.writeFileSync(
			path.join(portal.state, 'state', 'links.json'),
			JSON.stringify({ lastRun: twoDaysAgo, links: { [gone()]: { url: gone(), status: 'broken', code: 404, reason: 'x', checkedAt: twoDaysAgo, failures: 1, brokenSince: twoDaysAgo } } })
		);

		const run = await portal.action('/?/checklinks', {}, { cookie });
		assert.equal(run.type, 'success', run.raw);
		assert.match(String(run.data?.linksChecked), /Checked 2 links\. 1 no longer work/);
		const memory = JSON.parse(fs.readFileSync(path.join(portal.state, 'state', 'links.json'), 'utf8'));
		assert.equal(memory.links[`${fakes.url}/alive`].status, 'ok');
		assert.equal(memory.links[gone()].failures, 2);

		const home = await (await portal.get('/', { cookie })).text();
		assert.match(home, /links to fix/);

		const post = await portal.action(
			'/focus?/answer',
			{ id: `dead-link:post:first-home-nas:en:${gone()}`, kind: 'dead-link', slug: 'first-home-nas', lang: 'en', url: gone(), value: 'https://example.com/new-guide' },
			{ cookie }
		);
		assert.equal(post.type, 'success', post.raw);
		const page = await portal.action(
			'/focus?/answer',
			{ id: `dead-link:page:now:fr:${gone()}`, kind: 'dead-link', page: 'now', lang: 'fr', url: gone(), value: '', unlink: 'on' },
			{ cookie }
		);
		assert.equal(page.type, 'success', page.raw);
		assert.equal(portal.read(file)!.includes(gone()), true, 'nothing is written until leaving focus mode');

		const finish = await portal.action('/focus?/finish', {}, { cookie });
		assert.equal(finish.type, 'redirect', finish.raw);
		assert.match(portal.read(file)!, /\[the old guide\]\(https:\/\/example\.com\/new-guide\)/);
		const fixed = JSON.parse(portal.read(NOW_JSON)!);
		assert.equal(fixed.archive[0].note.fr, 'Voir l’ancien lien.', 'the words stay, the link goes');
		assert.equal(fixed.archive[0].note.en, nowData.archive[0].note.en, 'other languages untouched');
	});

	test('an answer that is not a web address is refused', async () => {
		const r = await portal.action(
			'/focus?/answer',
			{ id: 'dead-link:x', kind: 'dead-link', slug: 'first-home-nas', lang: 'en', url: gone(), value: 'not a url' },
			{ cookie }
		);
		assert.equal(r.type, 'failure');
	});
});
