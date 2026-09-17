import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { thumbnailOf, thumbnailUrl } from '../src/lib/thumbnail.ts';

describe('which image stands for an article', () => {
	test('featured_image wins over the body', () => {
		assert.equal(thumbnailOf('chosen.jpg', '![first](first.jpg)'), 'chosen.jpg');
	});

	test('without one, the first Markdown image is it', () => {
		assert.equal(thumbnailOf(undefined, 'Intro.\n\n![a view](one.jpg "Title")\n\n![](two.jpg)'), 'one.jpg');
		assert.equal(thumbnailOf('', '![](one.jpg)'), 'one.jpg');
	});

	test('a raw <img> counts, in document order', () => {
		assert.equal(thumbnailOf(undefined, '<img alt="x" src="raw.png">\n\n![](md.jpg)'), 'raw.png');
		assert.equal(thumbnailOf(undefined, '![](md.jpg)\n\n<img src="raw.png">'), 'md.jpg');
	});

	test('an iframe is not an image, and a text-only article has none', () => {
		assert.equal(thumbnailOf(undefined, '<iframe src="https://video.example/x"></iframe>\n\n![](photo.jpg)'), 'photo.jpg');
		assert.equal(thumbnailOf(undefined, 'Just words, and a [link](page/).'), undefined);
	});
});

describe('the URL an email uses', () => {
	const site = 'https://lorenzo.loconsole.eu';

	test('a bundle file resolves against the English article', () => {
		assert.equal(thumbnailUrl(site, 'a-post', 'one.jpg'), `${site}/en/blog/a-post/one.jpg`);
	});

	test('root-relative and absolute sources are kept', () => {
		assert.equal(thumbnailUrl(site, 'a-post', '/img/logo.png'), `${site}/img/logo.png`);
		assert.equal(thumbnailUrl(site, 'a-post', 'https://cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
		assert.equal(thumbnailUrl(site, 'a-post', '//cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
	});
});
