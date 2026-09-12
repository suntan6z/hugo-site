import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SLUG_RE, redirectPath, redirectStub, redirectStubs, rewriteLinks, repointStub } from '../src/lib/server/content/rename.ts';
import { FrontMatter } from '../src/lib/server/content/frontmatter.ts';

describe('the redirect left at the old address', () => {
	test('is a legacy-redirect page pinned to the exact old path', () => {
		const raw = redirectStub('old-name', 'new-name', 'fr');
		const fm = FrontMatter.parse(raw);
		assert.equal(fm.get('type'), 'legacy-redirect');
		assert.equal(fm.get('url'), '/fr/blog/old-name/');
		assert.equal(fm.get('redirect_to'), '/fr/blog/new-name/');
		// Verified against a real Hugo build: this publishes at /fr/blog/old-name/
		// and stays out of both sitemaps.
		assert.match(raw, /^---\n/);
		assert.match(raw, /\nbuild:\n {2}list: false\n/);
	});

	test('covers every language, since each prefix served its own page', () => {
		const stubs = redirectStubs('old-name', 'new-name');
		assert.deepEqual(stubs.map((s) => s.path), [
			'content/redirect-blog-old-name-en.md',
			'content/redirect-blog-old-name-fr.md',
			'content/redirect-blog-old-name-it.md'
		]);
		assert.equal(redirectPath('x', 'it'), 'content/redirect-blog-x-it.md');
	});
});

describe('links to the renamed article', () => {
	const go = (s: string) => rewriteLinks(s, 'old-name', 'new-name');

	test('are rewritten with or without a language prefix, in Markdown and HTML', () => {
		assert.equal(go('See [it](/en/blog/old-name/).'), 'See [it](/en/blog/new-name/).');
		assert.equal(go('See [it](/blog/old-name/).'), 'See [it](/blog/new-name/).');
		assert.equal(go('<a href="/it/blog/old-name/">qui</a>'), '<a href="/it/blog/new-name/">qui</a>');
	});

	test('keep anchors, query strings and a missing trailing slash', () => {
		assert.equal(go('[a](/en/blog/old-name/#part-2)'), '[a](/en/blog/new-name/#part-2)');
		assert.equal(go('[a](/en/blog/old-name?utm=x)'), '[a](/en/blog/new-name/?utm=x)');
		assert.equal(go('bare /en/blog/old-name end'), 'bare /en/blog/new-name/ end');
	});

	test('never touch a different article whose slug merely starts the same', () => {
		assert.equal(go('[a](/en/blog/old-name-2/)'), '[a](/en/blog/old-name-2/)');
		assert.equal(go('[a](/en/blog/old-names/)'), '[a](/en/blog/old-names/)');
	});

	test('leave unrelated text alone', () => {
		const s = 'The old-name of the thing, and /en/gallery/old-name/.';
		assert.equal(go(s), s);
	});
});

describe('a redirect from an earlier rename', () => {
	test('is repointed so two renames do not chain into a 404', () => {
		const first = redirectStub('first', 'second', 'en');
		const after = repointStub(first, 'second', 'third');
		assert.ok(after);
		assert.equal(FrontMatter.parse(after!).get('redirect_to'), '/en/blog/third/');
		// The address it answers on never changes: only its destination.
		assert.equal(FrontMatter.parse(after!).get('url'), '/en/blog/first/');
	});

	test('is left untouched when it points somewhere else', () => {
		assert.equal(repointStub(redirectStub('a', 'b', 'en'), 'unrelated', 'x'), null);
		assert.equal(repointStub('no front matter here', 'a', 'b'), null);
	});
});

test('a slug must be lowercase words joined by single hyphens', () => {
	for (const ok of ['post', 'my-post', 'post-2', 'a1-b2-c3']) assert.ok(SLUG_RE.test(ok), ok);
	for (const bad of ['My-Post', 'my--post', '-post', 'post-', 'my post', 'my_post', 'café', '']) {
		assert.equal(SLUG_RE.test(bad), false, bad);
	}
});
