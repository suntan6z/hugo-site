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
import { execFileSync } from 'node:child_process';
import { startPortal, startFakeDeepL, type Portal, type FakeDeepL } from './harness.ts';
import { FrontMatter } from '../../src/lib/server/content/frontmatter.ts';
import { readSiteText } from '../../src/lib/server/content/site-params.ts';

const LANGS = ['en', 'fr', 'it'] as const;
const AUDIENCE = 'aud-test-0000';
const SHARE = 'test-share-link';

type Seen = { method: string; path: string; headers: http.IncomingHttpHeaders };

/** Resend, Litlyx and two outside websites (one alive, one gone) on one port. */
async function startFakes() {
	const seen: Seen[] = [];
	const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
	const contacts = [
		{ id: 'c1aaaaaa-0000-0000-0000-000000000001', email: 'reader@example.com', created_at: '2026-09-01 10:00:00.000000+00', unsubscribed: false },
		{ id: 'c2bbbbbb-0000-0000-0000-000000000002', email: 'gone@example.com', created_at: '2026-08-01 10:00:00.000000+00', unsubscribed: true }
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
	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		seen.push({ method: req.method ?? '', path: url.pathname, headers: req.headers });
		res.setHeader('Content-Type', 'application/json');
		if (url.pathname === '/alive') return res.end('{}');
		if (url.pathname === '/gone') {
			res.statusCode = 404;
			return res.end('{}');
		}
		if (url.pathname === `/audiences/${AUDIENCE}/contacts` && req.method === 'GET') {
			return res.end(JSON.stringify({ object: 'list', data: contacts }));
		}
		if (url.pathname.startsWith(`/audiences/${AUDIENCE}/contacts/`) && req.method === 'DELETE') {
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
			RESEND_AUDIENCE_ID: AUDIENCE,
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

const pageFile = (name: string, l: string) => (l === 'en' ? `content/${name}.md` : `content/${name}.${l}.md`);

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
		['/pages/now?/save', { title_en: 'x' }],
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

	test('editing the English Now page changes that file and nothing else', async () => {
		const before = Object.fromEntries(LANGS.map((l) => [l, portal.read(pageFile('now', l))]));
		const en = FrontMatter.parse(before.en!);
		const body = en.body.replace('Last updated July 2026', 'Last updated September 2026');
		const r = await portal.action('/pages/now?/save', pageForm('now', { body_en: body }), { cookie });
		assert.equal(r.type, 'success', r.raw);
		assert.equal(portal.read(pageFile('now', 'fr')), before.fr);
		assert.equal(portal.read(pageFile('now', 'it')), before.it);
		const after = portal.read(pageFile('now', 'en'))!;
		assert.ok(after.startsWith('---\n'), 'front matter still starts at byte 0');
		const a = before.en!.split('\n');
		assert.deepEqual(after.split('\n').filter((l, i) => l !== a[i]), ['      <p class="page-eyebrow">Last updated September 2026</p>']);
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
		const original = portal.read(pageFile('now', 'en'))!;
		const edited = FrontMatter.parse(original).body.replace('<h1>Now</h1>', '<h1>Right now</h1>');
		const saved = await portal.action('/pages/now?/save', pageForm('now', { body_en: edited }), { cookie });
		assert.equal(saved.type, 'success', saved.raw);
		git('commit', '-qam', 'Retitle Now');

		const list = (await (await portal.get('/api/history/pages/now', { cookie })).json()) as { revisions: { sha: string; message: string }[] };
		assert.deepEqual(list.revisions.map((r) => r.message), ['Retitle Now', 'Start']);

		const now = portal.read(pageFile('now', 'en'));
		const detail = (await (await portal.get(`/api/history/pages/now/${list.revisions[1].sha}`, { cookie })).json()) as {
			version: Record<string, { body: string }>;
			changes: { path: string }[];
		};
		assert.equal(detail.version.en.body, FrontMatter.parse(original).body);
		assert.deepEqual(detail.changes.map((c) => c.path), ['content/now.md']);
		assert.equal(portal.read(pageFile('now', 'en')), now, 'comparing wrote nothing');

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
		assert.deepEqual(fakes.seen.filter((s) => s.method === 'DELETE').map((s) => s.path), [`/audiences/${AUDIENCE}/contacts/c1aaaaaa-0000-0000-0000-000000000001`]);
		const log = fs.readdirSync(path.join(portal.state, 'audit')).map((f) => fs.readFileSync(path.join(portal.state, 'audit', f), 'utf8')).join('\n');
		assert.match(log, /subscriber-removed/);
		assert.doesNotMatch(log, /reader@example\.com/);
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
});

describe('outside links', () => {
	const gone = () => `${fakes.url}/gone`;

	test('a link found gone twice, a day apart, becomes a card, and fixing it rewrites the text', async () => {
		const file = 'content/blog/first-home-nas/index.md';
		const fm = FrontMatter.parse(portal.read(file)!);
		fs.writeFileSync(path.join(portal.root, file), fm.setBody(`${fm.body}\n\nSee [the old guide](${gone()}) and [this one](${fakes.url}/alive).\n`).serialize());
		const nowFr = FrontMatter.parse(portal.read('content/now.fr.md')!);
		fs.writeFileSync(path.join(portal.root, 'content/now.fr.md'), nowFr.setBody(`${nowFr.body}\n<p><a href="${gone()}">ancien lien</a></p>\n`).serialize());

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
		assert.match(portal.read('content/now.fr.md')!, /<p>ancien lien<\/p>/);
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
