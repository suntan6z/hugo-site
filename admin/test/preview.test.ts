import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, resolveImage, resolveLink, buildPreviewDoc } from '../src/lib/preview/render.ts';

const ctx = { slug: 'my-post', siteUrl: 'https://lorenzo.loconsole.eu' };

describe('image resolution', () => {
	test('a bundle-relative image goes through the authenticated preview API', () => {
		assert.equal(resolveImage('hero.webp', ctx), '/api/image/my-post/hero.webp');
	});
	test('a just-uploaded image uses its in-browser copy', () => {
		assert.equal(resolveImage('new.webp', { ...ctx, pending: { 'new.webp': 'blob:abc' } }), 'blob:abc');
	});
	test('absolute and root-relative images are left alone or pointed at the site', () => {
		assert.equal(resolveImage('https://x.eu/a.png', ctx), 'https://x.eu/a.png');
		assert.equal(resolveImage('/img/logo.svg', ctx), 'https://lorenzo.loconsole.eu/img/logo.svg');
	});
	test('filenames are encoded, so a slug or name cannot break out of the path', () => {
		assert.equal(resolveImage('a b.jpg', ctx), '/api/image/my-post/a%20b.jpg');
	});
});

describe('markdown rendering', () => {
	test('renders prose, headings and emphasis', () => {
		const html = renderMarkdown('## Title\n\nSome *text* here.', ctx);
		assert.match(html, /<h2[^>]*>Title<\/h2>/);
		assert.match(html, /<em>text<\/em>/);
	});

	test('markdown images are resolved and keep their alt text', () => {
		const html = renderMarkdown('![A hero](hero.webp)', ctx);
		assert.match(html, /src="\/api\/image\/my-post\/hero\.webp"/);
		assert.match(html, /alt="A hero"/);
	});

	test('an image with no alt is visibly flagged while writing', () => {
		assert.match(renderMarkdown('![](hero.webp)', ctx), /data-missing-alt/);
		assert.doesNotMatch(renderMarkdown('![ok](hero.webp)', ctx), /data-missing-alt/);
	});

	test('raw <img> tags — allowed by the site — are resolved too', () => {
		const html = renderMarkdown('<img src="raw.jpg" alt="r">', ctx);
		assert.match(html, /src="\/api\/image\/my-post\/raw\.jpg"/);
	});

	test('root-relative links point at the live site and open a new tab', () => {
		const html = renderMarkdown('[see](/en/blog/other/)', ctx);
		assert.match(html, /href="https:\/\/lorenzo\.loconsole\.eu\/en\/blog\/other\/"/);
		assert.match(html, /target="_blank"/);
		assert.equal(resolveLink('https://x.eu', ctx), 'https://x.eu');
	});

	test('alt and title text are escaped', () => {
		const html = renderMarkdown('![a "quote" <b>](x.webp "t\\"x")', ctx);
		assert.doesNotMatch(html, /alt="a "quote"/);
	});
});

describe('preview document', () => {
	const doc = buildPreviewDoc({
		html: '<p>Hi</p>', title: 'A <Title>', date: '2026-02-12', category: 'Technology',
		siteCss: '.post-body{}', theme: 'dark', lang: 'fr'
	});

	test('uses the site markup and stylesheet', () => {
		assert.match(doc, /<article class="post-body"><p>Hi<\/p><\/article>/);
		assert.match(doc, /<h1 class="post-title">/);
		assert.match(doc, /\.post-body\{\}/);
	});

	test('follows the portal theme', () => {
		assert.match(doc, /data-theme="dark"/);
	});

	test('the title is escaped', () => {
		assert.match(doc, /A &lt;Title&gt;/);
	});

	test('dates render in the article language', () => {
		assert.match(doc, /12 février 2026/);
	});

	test('contains no script of its own', () => {
		assert.doesNotMatch(doc, /<script/i);
	});
});
