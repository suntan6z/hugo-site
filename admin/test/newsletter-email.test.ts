import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildBroadcastHtml, buildBroadcastText, validateBroadcast, forSingleRecipient, looksLikeEmail, UNSUBSCRIBE_TOKEN,
	articleUrl, NEWSLETTER_LANGS, LANG_LABEL
} from '../src/lib/newsletter-email.ts';

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

describe('single-recipient mail', () => {
	test('a test copy has no unsubscribe token left in it, only a real link', () => {
		const out = forSingleRecipient(buildBroadcastHtml(base), base.siteUrl);
		assert.ok(!out.includes(UNSUBSCRIBE_TOKEN));
		assert.ok(out.includes(`href="${base.siteUrl}"`));
		assert.ok(!forSingleRecipient(buildBroadcastText(base), base.siteUrl).includes(UNSUBSCRIBE_TOKEN));
	});

	test('addresses: ordinary ones pass, obvious typos do not', () => {
		for (const ok of ['me@example.com', 'a.b+tag@sub.example.eu']) assert.equal(looksLikeEmail(ok), true, ok);
		for (const bad of ['', 'me', 'me@', 'me@example', 'me @example.com', '<me@example.com>', 'me@@example.com']) {
			assert.equal(looksLikeEmail(bad), false, bad);
		}
	});
});

describe('an email in each language', () => {
	test('English is the default, and says so', () => {
		const html = buildBroadcastHtml(base);
		assert.match(html, /<html lang="en">/);
		assert.match(html, /Read the article/);
		assert.match(html, /You are receiving this because you subscribed at Lorenzo Loconsole\./);
		assert.match(html, />Unsubscribe</);
	});

	test('French and Italian have their own button, reason and unsubscribe, and say what language they are', () => {
		const fr = buildBroadcastHtml({ ...base, lang: 'fr' });
		assert.match(fr, /<html lang="fr">/);
		assert.match(fr, /Lire l'article/);
		assert.match(fr, /Se désabonner/);
		assert.doesNotMatch(fr, /Read the article|Unsubscribe/);
		const it = buildBroadcastHtml({ ...base, lang: 'it' });
		assert.match(it, /<html lang="it">/);
		assert.match(it, /Leggi l'articolo/);
		assert.match(it, /Annulla l’iscrizione/);
	});

	test('every language still carries Resend\'s unsubscribe token, in the HTML and the text', () => {
		for (const lang of NEWSLETTER_LANGS) {
			assert.ok(buildBroadcastHtml({ ...base, lang }).includes(UNSUBSCRIBE_TOKEN), lang);
			assert.ok(buildBroadcastText({ ...base, lang }).includes(UNSUBSCRIBE_TOKEN), lang);
		}
	});

	test('the plain-text version is in the language too', () => {
		const text = buildBroadcastText({ ...base, lang: 'fr' });
		assert.match(text, /À lire : https:/);
		assert.match(text, /Vous recevez ce message/);
		assert.doesNotMatch(text, /Read it|You are receiving/);
	});

	test('a language-specific footer is escaped like any other text', () => {
		const html = buildBroadcastHtml({ ...base, lang: 'it', siteName: 'A & B' });
		assert.match(html, /iscritto\/a su A &amp; B\./);
	});

	test('an article\'s address is in the language of the email', () => {
		assert.equal(articleUrl('https://lorenzo.loconsole.eu', 'chat-control-eu', 'fr'), 'https://lorenzo.loconsole.eu/fr/blog/chat-control-eu/');
		assert.deepEqual(NEWSLETTER_LANGS.map((l) => LANG_LABEL[l]), ['English', 'Français', 'Italiano']);
	});
});
