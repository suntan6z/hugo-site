import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkPost, errorsIn, warningsIn, type CheckablePost } from '../src/lib/server/seo/rules.ts';
import { FrontMatter } from '../src/lib/server/content/frontmatter.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const TODAY = new Date('2026-09-09T12:00:00Z');

const base = (over: Partial<CheckablePost> = {}): CheckablePost => ({
	slug: 'a-post',
	folder: 'a-post',
	date: '2026-01-01',
	category: 'Technology',
	draft: false,
	featuredImage: 'hero.webp',
	bundleFiles: ['hero.webp', 'index.md'],
	knownSlugs: ['a-post', 'other-post'],
	knownGalleryCities: ['paris'],
	translations: [
		{
			lang: 'en',
			exists: true,
			untranslated: false,
			title: 'A reasonable title',
			description: 'x'.repeat(140),
			body: 'Some body text.'
		}
	],
	...over
});

const ids = (p: CheckablePost) => checkPost(p, TODAY).map((f) => f.id).sort();

describe('structural errors', () => {
	test('a clean post produces no findings at all', () => {
		assert.deepEqual(checkPost(base(), TODAY), []);
	});

	test('slug that disagrees with the folder is an error', () => {
		assert.ok(ids(base({ slug: 'wrong' })).includes('slug-mismatch'));
	});

	test('a future date is an error, because Hugo would omit the page entirely', () => {
		const f = checkPost(base({ date: '2027-01-01' }), TODAY);
		assert.equal(f.find((x) => x.id === 'future-date')?.severity, 'error');
	});

	test('today is not in the future', () => {
		assert.ok(!ids(base({ date: '2026-09-09' })).includes('future-date'));
	});

	test('a category outside the four is an error', () => {
		assert.ok(ids(base({ category: 'Travel' })).includes('bad-category'));
	});

	test('featured_image pointing outside the bundle is an error, absent is a warning', () => {
		const missing = checkPost(base({ featuredImage: 'nope.webp' }), TODAY);
		assert.equal(missing.find((x) => x.id === 'featured-missing')?.severity, 'error');
		const absent = checkPost(base({ featuredImage: undefined }), TODAY);
		assert.equal(absent.find((x) => x.id === 'no-featured')?.severity, 'warning');
	});
});

describe('images and links', () => {
	const withBody = (body: string, over: Partial<CheckablePost> = {}) =>
		base({ ...over, translations: [{ ...base().translations[0], body }] });

	test('an image with no alt text is an error', () => {
		assert.ok(ids(withBody('![](hero.webp)')).includes('image-no-alt'));
	});

	test('an image with alt text passes', () => {
		assert.deepEqual(checkPost(withBody('![A hero](hero.webp)'), TODAY), []);
	});

	test('an image not in the bundle is an error', () => {
		assert.ok(ids(withBody('![Alt](ghost.webp)')).includes('image-missing'));
	});

	test('external and root-relative images are not bundle-checked', () => {
		assert.deepEqual(checkPost(withBody('![A](https://x.dev/i.png)\n![B](/img/logo.svg)'), TODAY), []);
	});

	test('a link to a non-existent post is an error', () => {
		assert.ok(ids(withBody('See [this](/blog/ghost-post/).')).includes('broken-link'));
	});

	test('links to real posts and gallery cities pass, in any language prefix', () => {
		const body = '[a](/blog/other-post/) [b](/en/blog/other-post/) [c](/fr/gallery/paris/)';
		assert.deepEqual(checkPost(withBody(body), TODAY), []);
	});

	test('an image is not mistaken for a link', () => {
		// ![x](/blog/nope/) is an image, and must not raise broken-link.
		assert.ok(!ids(withBody('![x](/blog/nope/)')).includes('broken-link'));
	});
});

describe('per-language text', () => {
	test('placeholder and absent translations are skipped entirely', () => {
		const p = base({
			translations: [
				base().translations[0],
				{ lang: 'fr', exists: true, untranslated: true, title: '', description: '', body: '' },
				{ lang: 'it', exists: false, untranslated: false, title: '', description: '', body: '' }
			]
		});
		assert.deepEqual(checkPost(p, TODAY), []);
	});

	test('findings carry the language they belong to', () => {
		const p = base({
			translations: [
				base().translations[0],
				{ lang: 'fr', exists: true, untranslated: false, title: 'Titre', description: '', body: 'x' }
			]
		});
		const f = checkPost(p, TODAY).find((x) => x.id === 'no-description');
		assert.equal(f?.lang, 'fr');
	});

	test('description length is a warning at both ends, never an error', () => {
		for (const len of [60, 200]) {
			const p = base({ translations: [{ ...base().translations[0], description: 'x'.repeat(len) }] });
			assert.equal(checkPost(p, TODAY).find((x) => x.id === 'description-length')?.severity, 'warning');
		}
	});
});

describe('against the real corpus', () => {
	const blog = path.join(REPO, 'content', 'blog');
	const slugs = fs.readdirSync(blog).filter((d) =>
		fs.existsSync(path.join(blog, d, 'index.md'))
	);

	function realPost(slug: string): CheckablePost {
		const files = fs.readdirSync(path.join(blog, slug));
		const fm = FrontMatter.parse(fs.readFileSync(path.join(blog, slug, 'index.md'), 'utf8'));
		const o = fm.toObject();
		return {
			slug: String(o.slug ?? slug),
			folder: slug,
			date: String(o.date ?? ''),
			category: String(o.category ?? ''),
			draft: o.draft === true,
			featuredImage: o.featured_image ? String(o.featured_image) : undefined,
			partnerName: o.partner_name ? String(o.partner_name) : undefined,
			partnerUrl: o.partner_url ? String(o.partner_url) : undefined,
			partnerLogo: o.partner_logo_url ? String(o.partner_logo_url) : undefined,
			bundleFiles: files,
			knownSlugs: slugs,
			knownGalleryCities: fs.readdirSync(path.join(REPO, 'content', 'gallery')).filter((d) =>
				fs.statSync(path.join(REPO, 'content', 'gallery', d)).isDirectory()
			),
			translations: [
				{
					lang: 'en',
					exists: true,
					untranslated: o.untranslated === true,
					title: String(o.title ?? ''),
					description: String(o.description ?? ''),
					body: fm.body
				}
			]
		};
	}

	test('no published article has a blocking error', () => {
		const broken = slugs
			.map((s) => ({ slug: s, errors: errorsIn(checkPost(realPost(s), TODAY)) }))
			.filter((r) => r.errors.length > 0);
		assert.deepEqual(
			broken.map((b) => `${b.slug}: ${b.errors.map((e) => e.id).join(', ')}`),
			[],
			'existing content must pass the rules that block publishing'
		);
	});

	test('warnings are selective, not universal', () => {
		const flagged = slugs.filter((s) => warningsIn(checkPost(realPost(s), TODAY)).some(
			(w) => w.id !== 'no-featured'
		));
		// Two short descriptions and one long title today. A rule firing on every
		// post would be noise, so guard against that regressing.
		assert.ok(flagged.length <= 4, `too many posts flagged: ${flagged.join(', ')}`);
		assert.ok(flagged.length >= 1, 'expected the known short-description posts to be flagged');
	});
});
