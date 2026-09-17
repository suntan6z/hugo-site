import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setAltText, replaceLink } from '../src/lib/server/tasks/edits.ts';

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

describe('fixing a dead link', () => {
	const url = 'https://gone.example/page';

	test('a Markdown link and an HTML anchor are both repointed, titles kept', () => {
		const body = `See [the page](${url} "Title") and <a href="${url}" target="_blank">this</a>.`;
		assert.equal(
			replaceLink(body, url, 'https://new.example/'),
			'See [the page](https://new.example/ "Title") and <a href="https://new.example/" target="_blank">this</a>.'
		);
	});

	test('removing the link keeps its words', () => {
		const body = `See [the page](${url}) and <a href="${url}" rel="noopener">this <em>one</em></a>.`;
		assert.equal(replaceLink(body, url, null), 'See the page and this <em>one</em>.');
	});

	test('a longer URL that merely starts the same is left alone', () => {
		const body = `[a](${url}) [b](${url}/deeper) <a href="${url}-2">c</a>`;
		assert.equal(replaceLink(body, url, 'https://new.example/'), `[a](https://new.example/) [b](${url}/deeper) <a href="${url}-2">c</a>`);
		assert.equal(replaceLink(body, url, null), `a [b](${url}/deeper) <a href="${url}-2">c</a>`);
	});

	test('a URL with regex characters is matched literally', () => {
		const odd = 'https://www.youtube.com/watch?v=06qwUUAAmX8&t=2s';
		assert.equal(replaceLink(`[v](${odd})`, odd, 'https://example.com/v'), '[v](https://example.com/v)');
	});
});
