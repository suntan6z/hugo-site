import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildBroadcastHtml, buildBroadcastText, validateBroadcast, UNSUBSCRIBE_TOKEN
} from '../src/lib/server/integrations/newsletter-email.ts';

const base = {
	title: 'It\'s not over. Chat control... Again !',
	intro: 'Chat Control is back on the table.\n\nHere is why it matters.',
	url: 'https://lorenzo.loconsole.eu/en/blog/chat-control-eu/',
	siteName: 'Lorenzo Loconsole',
	siteUrl: 'https://lorenzo.loconsole.eu'
};

describe('broadcast HTML', () => {
	test('always carries the unsubscribe token Resend requires', () => {
		assert.ok(buildBroadcastHtml(base).includes(UNSUBSCRIBE_TOKEN));
		assert.ok(buildBroadcastText(base).includes(UNSUBSCRIBE_TOKEN));
	});

	test('links the headline and the button to the article', () => {
		const html = buildBroadcastHtml(base);
		assert.equal(html.split(base.url).length - 1 >= 2, true);
		assert.ok(html.includes('Read the article'));
	});

	test('escapes text rather than letting it inject markup', () => {
		const html = buildBroadcastHtml({ ...base, title: '<script>alert(1)</script> & "quotes"' });
		assert.ok(!html.includes('<script>alert(1)</script>'));
		assert.ok(html.includes('&lt;script&gt;'));
		assert.ok(html.includes('&amp;'));
		assert.ok(html.includes('&quot;'));
	});

	test('blank lines become paragraphs, single newlines become breaks', () => {
		const html = buildBroadcastHtml(base);
		assert.equal((html.match(/Chat Control is back on the table\./g) ?? []).length, 1);
		assert.ok(html.includes('Here is why it matters.'));
		assert.ok(buildBroadcastHtml({ ...base, intro: 'a\nb' }).includes('a<br />b'));
	});

	test('the image is included only when there is one', () => {
		assert.ok(!buildBroadcastHtml(base).includes('<img'));
		assert.ok(buildBroadcastHtml({ ...base, imageUrl: 'https://x.eu/a.webp' }).includes('<img'));
	});

	test('an optional note appears above the article card', () => {
		const html = buildBroadcastHtml({ ...base, note: 'A quick word first.' });
		assert.ok(html.indexOf('A quick word first.') < html.indexOf(base.title));
	});

	test('styles are inline — email clients drop stylesheets', () => {
		const html = buildBroadcastHtml(base);
		assert.ok(!html.includes('<style'));
		assert.ok(!html.includes('rel="stylesheet"'));
	});
});

describe('validation', () => {
	const valid = {
		subject: 'New article',
		title: base.title,
		intro: base.intro,
		url: base.url,
		html: buildBroadcastHtml(base)
	};

	test('a complete broadcast passes', () => {
		assert.deepEqual(validateBroadcast(valid), { ok: true, errors: [], warnings: [] });
	});

	test('a missing unsubscribe link is an error, because Resend rejects it', () => {
		const r = validateBroadcast({ ...valid, html: '<p>no token here</p>' });
		assert.equal(r.ok, false);
		assert.ok(r.errors.some((e) => /unsubscribe/i.test(e)));
	});

	test('empty subject, headline, intro and a relative URL are all errors', () => {
		assert.ok(validateBroadcast({ ...valid, subject: '  ' }).errors.length > 0);
		assert.ok(validateBroadcast({ ...valid, title: '' }).errors.length > 0);
		assert.ok(validateBroadcast({ ...valid, intro: '' }).errors.length > 0);
		assert.ok(validateBroadcast({ ...valid, url: '/en/blog/x/' }).errors.length > 0);
	});

	test('a localhost URL is caught before it reaches subscribers', () => {
		const r = validateBroadcast({ ...valid, url: 'http://localhost:5180/en/blog/x/' });
		assert.equal(r.ok, false);
		assert.ok(r.errors.some((e) => /localhost/.test(e)));
	});

	test('an overlong subject warns but does not block', () => {
		const r = validateBroadcast({ ...valid, subject: 'x'.repeat(120) });
		assert.equal(r.ok, true);
		assert.equal(r.warnings.length, 1);
	});
});
