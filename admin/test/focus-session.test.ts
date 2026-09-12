import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setAltText } from '../src/lib/server/tasks/edits.ts';

describe('filling in alt text', () => {
	const body = 'Intro.\n\n![](one.jpg)\n\nMiddle.\n\n![](two.jpg)\n\nEnd.\n';

	test('fills the image asked for and leaves the rest byte-identical', () => {
		const out = setAltText(body, 'two.jpg', 'A described photo');
		assert.equal(out, 'Intro.\n\n![](one.jpg)\n\nMiddle.\n\n![A described photo](two.jpg)\n\nEnd.\n');
	});

	test('leaves an image that already has alt text alone', () => {
		const described = '![Already described](one.jpg)';
		assert.equal(setAltText(described, 'one.jpg', 'New text'), described);
	});

	test('keeps a title attribute', () => {
		assert.equal(setAltText('![](a.jpg "Title")', 'a.jpg', 'Alt'), '![Alt](a.jpg "Title")');
	});

	test('does not touch a different image whose name merely starts the same', () => {
		const two = '![](one.jpg)\n![](one.jpeg)';
		assert.equal(setAltText(two, 'one.jpg', 'X'), '![X](one.jpg)\n![](one.jpeg)');
	});

	test('brackets in the answer cannot break the Markdown', () => {
		assert.equal(setAltText('![](a.jpg)', 'a.jpg', 'A [weird] one'), '![A weird one](a.jpg)');
	});

	test('an image name with regex characters is matched literally', () => {
		assert.equal(setAltText('![](a+b(1).jpg)', 'a+b(1).jpg', 'X'), '![X](a+b(1).jpg)');
	});
});
