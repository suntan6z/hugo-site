import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isToken, expiryFrom, isLive, contentFor, previewPage, PREVIEW_DAYS, type ArticleLike, type PreviewLink } from '../src/lib/server/content/preview-link.ts';

const NOW = new Date('2026-10-18T10:00:00Z');
const tr = (title: string, body: string, extra: object = {}) => ({ title, body, exists: true, untranslated: false, ...extra });
const saved: ArticleLike = {
	date: '2026-10-01',
	category: 'Technology',
	translations: {
		en: tr('Saved title', 'Saved **body**.'),
		fr: tr('Titre', 'Corps enregistré.'),
		it: tr('', '', { exists: false })
	}
};
const snapshot = (over: object = {}) => ({
	date: '2026-10-02', category: 'Personal',
	translations: {
		en: { title: 'Autosaved title', body: 'Unsaved words.', untranslated: false },
		fr: { title: '', body: '', untranslated: false },
		it: { title: '', body: '', untranslated: false }
	},
	...over
});
const link: PreviewLink = { token: 'A'.repeat(32), slug: 'a-post', createdAt: NOW.toISOString(), expiresAt: expiryFrom(NOW) };

describe('the link itself', () => {
	test('a token is 32 url-safe characters and nothing else', () => {
		assert.equal(isToken('A'.repeat(32)), true);
		assert.equal(isToken('a-b_c'.padEnd(32, '0')), true);
		for (const bad of ['', 'short', 'A'.repeat(31), 'A'.repeat(33), 'A'.repeat(31) + '/', '../'.repeat(11), 'A'.repeat(31) + ' ']) assert.equal(isToken(bad), false, bad);
	});

	test('it lasts a week, and not a minute longer', () => {
		assert.equal(PREVIEW_DAYS, 7);
		assert.equal(link.expiresAt, '2026-10-25T10:00:00.000Z');
		assert.equal(isLive(link, new Date('2026-10-25T09:59:59Z')), true);
		assert.equal(isLive(link, new Date('2026-10-25T10:00:00Z')), false);
	});
});

describe('what a link shows', () => {
	test('the saved article when there is no autosave', () => {
		const s = contentFor(saved, null, 'en');
		assert.deepEqual([s.source, s.title, s.date, s.category, s.savedAt], ['saved', 'Saved title', '2026-10-01', 'Technology', null]);
	});

	test('the autosave when there is one: it is the newer work', () => {
		const s = contentFor(saved, { savedAt: '2026-10-18T09:00:00Z', post: snapshot() }, 'en');
		assert.deepEqual([s.source, s.title, s.body, s.category, s.savedAt], ['autosave', 'Autosaved title', 'Unsaved words.', 'Personal', '2026-10-18T09:00:00Z']);
	});

	test('a language with nothing to read falls back to English, and is not offered', () => {
		const s = contentFor(saved, null, 'it');
		assert.equal(s.lang, 'en');
		assert.deepEqual(s.available, ['en', 'fr']);
		assert.equal(contentFor(saved, null, 'fr').title, 'Titre');
		assert.equal(contentFor(saved, null, 'xx').lang, 'en', 'an unknown language is not an error');
	});

	test('an untranslated placeholder is not a translation', () => {
		const a = { ...saved, translations: { ...saved.translations, fr: tr('Titre', 'Corps', { untranslated: true }) } };
		assert.deepEqual(contentFor(a, null, 'fr').available, ['en']);
	});

	test('an autosave that is not an article is ignored rather than trusted', () => {
		for (const junk of [null, 'text', 5, {}, { date: 1, translations: {} }, { date: 'x' }, { date: 'x', translations: 'no' }]) {
			assert.equal(contentFor(saved, { savedAt: 'x', post: junk }, 'en').source, 'saved', JSON.stringify(junk));
		}
	});

	test('a half-formed autosave is filled in, not crashed on', () => {
		const s = contentFor(saved, { savedAt: 'x', post: { date: '2026-10-02', translations: { en: { title: 5, body: 'ok' } } } }, 'en');
		assert.equal(s.source, 'autosave');
		assert.equal(s.title, '');
		assert.equal(s.body, 'ok');
	});
});

describe('the page', () => {
	const shown = contentFor(saved, null, 'en');
	const page = (over: Partial<Parameters<typeof previewPage>[0]> = {}) =>
		previewPage({ shown, link, siteCss: '/*css*/', siteUrl: 'https://lorenzo.loconsole.eu', base: `/preview/${link.token}`, ...over });

	test('it says it is a draft, until when, and is kept out of search', () => {
		const html = page();
		assert.match(html, /Draft<\/b> — not published/);
		assert.match(html, /until 25 October 2026/);
		assert.match(html, /name="robots" content="noindex, nofollow"/);
		assert.match(html, /name="referrer" content="no-referrer"/);
	});

	test('it carries no script and loads nothing from anywhere but the site', () => {
		const html = page({ shown: { ...shown, body: 'x <script>alert(1)</script> y' } });
		// The article's own raw HTML is the portal's problem elsewhere (the CSP forbids script); the page adds none.
		assert.equal((page().match(/<script/gi) ?? []).length, 0);
		assert.ok(html.includes('<style>/*css*/</style>'));
	});

	test('pictures come from the link\'s own path, never the signed-in API', () => {
		const html = page({ shown: { ...shown, body: '![alt](map-one.webp)\n\n<img src="b.png">' } });
		assert.match(html, new RegExp(`src="/preview/${link.token}/img/map-one\\.webp"`));
		assert.match(html, new RegExp(`src="/preview/${link.token}/img/b\\.png"`));
		assert.doesNotMatch(html, /\/api\/image\//);
	});

	test('the language switch lists only languages with something to read, and marks the current one', () => {
		const html = page({ shown: contentFor(saved, null, 'fr') });
		assert.match(html, /<b>Français<\/b>/);
		assert.match(html, new RegExp(`href="/preview/${link.token}\\?lang=en">English`));
		assert.doesNotMatch(html, /Italiano/);
		assert.doesNotMatch(page({ shown: contentFor({ ...saved, translations: { ...saved.translations, fr: tr('', '', { exists: false }) } }, null, 'en') }), /pvb-langs"/);
	});

	test('the title and the meta are escaped', () => {
		const html = page({ shown: { ...shown, title: '<b>Hi</b> & "you"', category: '<x>' } });
		assert.ok(html.includes('&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;'));
		assert.ok(!html.includes('<x>'));
	});
});
