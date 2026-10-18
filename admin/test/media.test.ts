import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, mentions, buildLibrary, describeFile, sameKind, type TextFile } from '../src/lib/media.ts';

const names = { articles: { 'out-the-shadow': 'Out the Shadow' }, cities: { paris: 'Paris' } };

describe('where a picture lives', () => {
	test('each place pictures live has its group, and nothing else is a picture', () => {
		assert.equal(groupOf('content/blog/out-the-shadow/map.webp'), 'articles');
		assert.equal(groupOf('content/gallery/paris/3.jpg'), 'gallery');
		assert.equal(groupOf('static/img/logo.svg'), 'site');
		assert.equal(groupOf('assets/img/hero.webp'), 'hero');
		assert.equal(groupOf('content/blog/out-the-shadow/index.md'), null);
		assert.equal(groupOf('static/css/main.css'), null);
		assert.equal(groupOf('static/img/deeper/a.png'), null);
		assert.equal(groupOf('layouts/x.png'), null);
	});
});

describe('is a picture mentioned', () => {
	test('a bundle picture is its file name, standing alone', () => {
		assert.equal(mentions('![x](map.webp)', 'content/blog/a/map.webp', 'articles'), true);
		assert.equal(mentions('featured_image: "map.webp"', 'content/blog/a/map.webp', 'articles'), true);
		assert.equal(mentions('<img src="map.webp">', 'content/blog/a/map.webp', 'articles'), true);
		assert.equal(mentions('![x](roadmap.webp)', 'content/blog/a/map.webp', 'articles'), false, 'not inside another name');
		assert.equal(mentions('![x](map.webp.bak)', 'content/blog/a/map.webp', 'articles'), true, 'close enough to look at');
		assert.equal(mentions('no pictures here', 'content/blog/a/map.webp', 'articles'), false);
	});

	test('a static picture is its served path', () => {
		assert.equal(mentions('<img src="/img/logo.svg">', 'static/img/logo.svg', 'site'), true);
		assert.equal(mentions('url(/img/logo.svg)', 'static/img/logo.svg', 'site'), true);
		assert.equal(mentions('src="/img/my-logo.svg"', 'static/img/logo.svg', 'site'), false);
		assert.equal(mentions('logo.svg', 'static/img/logo.svg', 'site'), false, 'a bare name is not a served path');
	});
});

describe('the library', () => {
	const images = [
		'content/blog/out-the-shadow/used.webp', 'content/blog/out-the-shadow/lonely.webp', 'content/blog/out-the-shadow/logo.png',
		'content/gallery/paris/1.jpg', 'static/img/logo.svg', 'static/img/orphan.png', 'static/img/contact-chill.gif', 'assets/img/hero.webp',
		'content/blog/out-the-shadow/index.md'
	];
	const texts: TextFile[] = [
		{ path: 'content/blog/out-the-shadow/index.md', text: '![a](used.webp)\n\npartner_logo_url: "logo.png"' },
		{ path: 'content/blog/other/index.md', text: '![a](lonely.webp)' },
		{ path: 'content/contact.fr.md', text: '<img src="/img/contact-chill.gif">' },
		{ path: 'content/contact.md', text: '<img src="/img/contact-chill.gif">' },
		{ path: 'layouts/partials/footer.html', text: '<img src="/img/logo.svg">' },
		{ path: 'static/css/main.css', text: 'background: url(/img/logo.svg)' }
	];
	const lib = buildLibrary(images, texts, names);
	const get = (p: string) => lib.find((e) => e.path === p)!;

	test('non-pictures are left out, the rest are all listed', () => {
		assert.equal(lib.length, 8);
		assert.ok(!lib.some((e) => e.path.endsWith('.md')));
	});

	test('an article picture is used only by that article\'s own files', () => {
		assert.deepEqual(get('content/blog/out-the-shadow/used.webp').usedBy.map((u) => u.label), ['Article · Out the Shadow']);
		assert.equal(get('content/blog/out-the-shadow/logo.png').unused, false, 'front matter counts');
		const lonely = get('content/blog/out-the-shadow/lonely.webp');
		assert.equal(lonely.unused, true, 'another article\'s file by that name does not count');
		assert.equal(lonely.canDelete, true);
	});

	test('a static picture lists each place that shows it once, by name', () => {
		assert.deepEqual(get('static/img/logo.svg').usedBy.map((u) => u.label).sort(), ['Footer (every page)', 'Stylesheet']);
		const chill = get('static/img/contact-chill.gif');
		assert.deepEqual(chill.usedBy.map((u) => u.label), ['Contact page'], 'three languages, one page');
		assert.equal(chill.usedBy[0].href, '/pages/contact');
	});

	test('only an unused article picture may be deleted; unused site files only warn', () => {
		assert.equal(get('static/img/orphan.png').unused, true);
		assert.equal(get('static/img/orphan.png').canDelete, false);
		assert.equal(get('content/blog/out-the-shadow/used.webp').canDelete, false);
	});

	test('what can be replaced here, and what is replaced where it belongs', () => {
		assert.equal(get('content/blog/out-the-shadow/used.webp').canReplace, true);
		assert.equal(get('static/img/logo.svg').canReplace, true);
		assert.equal(get('content/gallery/paris/1.jpg').canReplace, false);
		assert.equal(get('assets/img/hero.webp').canReplace, false);
		assert.equal(get('content/gallery/paris/1.jpg').unused, false, 'a gallery photo belongs to its city');
	});
});

describe('naming what refers to a picture', () => {
	test('pages, partials and the rest read as people would say them', () => {
		assert.deepEqual(describeFile('content/about.it.md'), { label: 'About page', href: '/pages/about' });
		assert.equal(describeFile('content/privacy-policy.md').label, 'Privacy policy page');
		assert.equal(describeFile('layouts/partials/footer.html').label, 'Footer (every page)');
		assert.equal(describeFile('layouts/index.html').label, 'Homepage');
		assert.equal(describeFile('hugo.toml').label, 'Site settings');
	});
});

describe('replacing keeps the name working', () => {
	test('the same kind of file, whatever the capitals or the jpeg/jpg spelling', () => {
		assert.equal(sameKind('static/img/a.png', 'new.PNG'), true);
		assert.equal(sameKind('content/blog/x/a.jpg', 'photo.jpeg'), true);
		assert.equal(sameKind('content/blog/x/a.png', 'photo.jpg'), false);
		assert.equal(sameKind('static/img/contact-chill.gif', 'still.png'), false);
	});
});

describe('the Now page’s pictures', () => {
	const json: TextFile = { path: 'content/now/now.json', text: '{"cover":{"image":"cover.jpg"},"items":[{"logo":"/img/logo.svg"}]}' };

	test('live in its bundle, and are used when now.json names them', () => {
		assert.equal(groupOf('content/now/cover.jpg'), 'now');
		assert.equal(groupOf('content/now/now.json'), null);
		assert.equal(groupOf('content/now/index.md'), null);
		const lib = buildLibrary(['content/now/cover.jpg', 'content/now/old-cover.webp', 'static/img/logo.svg'], [json], names);
		const by = (p: string) => lib.find((e) => e.path === p)!;
		assert.deepEqual(by('content/now/cover.jpg').usedBy, [{ label: 'Now page', href: '/pages/now' }]);
		assert.equal(by('content/now/old-cover.webp').canDelete, true, 'an unused one can go');
		assert.equal(by('content/now/cover.jpg').canDelete, false);
		assert.deepEqual(by('static/img/logo.svg').usedBy, [{ label: 'Now page', href: '/pages/now' }], 'a site logo it shows');
	});

	test('the data file is described as the page', () => {
		assert.deepEqual(describeFile('content/now/now.json'), { label: 'Now page', href: '/pages/now' });
	});
});
