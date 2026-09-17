import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRedirect, groupRedirects, blogSlugOf } from '../src/lib/server/content/redirects.ts';
import { redirectStubs } from '../src/lib/server/content/rename.ts';

/** The files a rename would write, read back. */
const renamed = (from: string, to: string) =>
	redirectStubs(from, to).map((s) => parseRedirect(s.path, s.content)!);

describe('reading redirects back', () => {
	test('a stub written by a rename parses to where it came from and where it goes', () => {
		const [en] = renamed('old-name', 'new-name');
		assert.deepEqual(en, {
			path: 'content/redirects/blog-old-name-en.md',
			from: '/en/blog/old-name/',
			to: '/en/blog/new-name/'
		});
	});

	test('a page that is not a redirect is ignored', () => {
		assert.equal(parseRedirect('content/redirects/_index.md', '---\ntitle: "Redirects"\n---\n'), null);
	});

	test('only language-prefixed blog addresses count as blog redirects', () => {
		assert.deepEqual(blogSlugOf('/fr/blog/a-b/'), { lang: 'fr', slug: 'a-b' });
		assert.equal(blogSlugOf('/blog/a-b/'), null);
		assert.equal(blogSlugOf('/en/now/'), null);
	});
});

describe('grouping and judging them', () => {
	test('the three language files of one rename are one row, and a healthy one has no problems', () => {
		const groups = groupRedirects(renamed('old', 'new'), ['new']);
		assert.equal(groups.length, 1);
		assert.equal(groups[0].oldSlug, 'old');
		assert.equal(groups[0].targetSlug, 'new');
		assert.deepEqual(groups[0].langs, ['en', 'fr', 'it']);
		assert.deepEqual(groups[0].problems, []);
	});

	test('a redirect to a deleted article is flagged, and listed first', () => {
		const groups = groupRedirects([...renamed('a', 'kept'), ...renamed('b', 'deleted')], ['kept']);
		assert.equal(groups[0].oldSlug, 'b');
		assert.deepEqual(groups[0].problems, ['missing-target']);
	});

	test('a redirect into another redirect is a chain, not a dead end', () => {
		const groups = groupRedirects([...renamed('first', 'second'), ...renamed('second', 'third')], ['third']);
		const first = groups.find((g) => g.oldSlug === 'first')!;
		assert.deepEqual(first.problems, ['chain']);
	});

	test('an article living at the old address again is flagged', () => {
		const groups = groupRedirects(renamed('back', 'elsewhere'), ['back', 'elsewhere']);
		assert.deepEqual(groups[0].problems, ['shadowed']);
	});

	test('a hand-written redirect for some other address is still listed', () => {
		const odd = parseRedirect('content/redirects/cv.md', '---\ntype: "redirect"\nurl: "/cv/"\nredirect_to: "/cv-fr.pdf"\n---\n')!;
		const groups = groupRedirects([odd], []);
		assert.equal(groups[0].oldSlug, null);
		assert.deepEqual(groups[0].problems, []);
	});
});
