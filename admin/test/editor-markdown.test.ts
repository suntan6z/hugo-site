import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown, serializeMarkdown, normalize } from '../src/lib/editor/markdown.ts';
import { FrontMatter } from '../src/lib/server/content/frontmatter.ts';

const BLOG = path.resolve(import.meta.dirname, '..', '..', 'content', 'blog');
const bodies = () =>
	fs
		.readdirSync(BLOG, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) =>
			fs
				.readdirSync(path.join(BLOG, e.name))
				.filter((f) => f.endsWith('.md'))
				.map((f) => [`${e.name}/${f}`, FrontMatter.parse(fs.readFileSync(path.join(BLOG, e.name, f), 'utf8')).body] as const)
		);

describe('every real article through the editor and back', () => {
	const files = bodies();
	assert.ok(files.length > 30);

	/**
	 * Opening an article in the visual editor and saving it must not rewrite
	 * it. Four files cannot come back byte-identical, for reasons listed here
	 * rather than left to be discovered in a diff — both are invisible to Hugo,
	 * and the editor only writes a body you actually edited anyway.
	 */
	const EXPECTED_REFLOW: Record<string, string> = {
		'out-the-shadow-2/index.md': 'a hard-wrapped paragraph is rejoined onto one line',
		'youth-in-contact/index.md': 'a double blank line collapses to one',
		'youth-in-contact/index.fr.md': 'a double blank line collapses to one',
		'youth-in-contact/index.it.md': 'a double blank line collapses to one'
	};

	const reflowed: string[] = [];

	for (const [name, body] of files) {
		test(name, () => {
			const out = normalize(body);
			if (out !== body) reflowed.push(name);
			if (!EXPECTED_REFLOW[name]) {
				assert.equal(out, body, 'this article would be rewritten on its first edit');
				return;
			}
			// Still lossless: only whitespace moved.
			assert.equal(out.replace(/\s+/g, ' ').trim(), body.replace(/\s+/g, ' ').trim(), EXPECTED_REFLOW[name]);
		});
	}

	test('no other article reformats', () => {
		assert.deepEqual(reflowed.sort(), Object.keys(EXPECTED_REFLOW).sort());
	});
});

describe('the formatting it writes', () => {
	test('keeps "-" bullets, the marker the corpus uses', () => {
		const md = '\n- one\n- two\n';
		assert.equal(normalize(md), md);
	});

	test('keeps headings, bold, italic, links and code', () => {
		const md = '\n## A heading\n\nSome **bold**, some *soft*, a [link](https://example.eu) and `code`.\n';
		assert.equal(normalize(md), md);
	});

	test('keeps an image with its file name and alt text', () => {
		const md = '\n![A described photo](photo-1.jpg)\n';
		assert.equal(normalize(md), md);
	});

	test('keeps the blank line articles open with', () => {
		assert.equal(normalize('\n\nFirst paragraph.\n'), '\n\nFirst paragraph.\n');
		assert.equal(normalize('No leading blank.\n'), 'No leading blank.\n');
	});

	test('leaves raw HTML alone, as Hugo does', () => {
		const md = '\n<div class="note">Kept verbatim</div>\n';
		assert.equal(normalize(md).includes('<div class="note">Kept verbatim</div>'), true);
	});

	test('an autolink survives the trip', () => {
		const md = '\nWatch it here: <https://www.youtube.com/watch?v=06qwUUAAmX8>\n';
		assert.equal(normalize(md), md);
	});

	test('serializing an edited document keeps the surrounding whitespace', () => {
		const doc = parseMarkdown('Edited.');
		assert.equal(serializeMarkdown(doc, '\n\nOriginal.\n'), '\n\nEdited.\n');
	});
});
