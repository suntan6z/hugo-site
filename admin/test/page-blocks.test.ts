import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	scanBlocks, annotate, innerOf, patchInner, attrOf, patchAttr, removeBlock, duplicateBlock, isRepeatable
} from '../src/lib/page-blocks.ts';
import { unbalanced, checkPage, CONTACT_IDS, PAGES, LANGS, pageFile } from '../src/lib/pages.ts';

const SITE = path.resolve(import.meta.dirname, '../..');
const bodyOf = (file: string) => fs.readFileSync(path.join(SITE, file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');

const sample = `<div>
  <h1>About <span class="x">Me</span></h1>
  <p>First <strong>bold</strong> and <a href="/en/blog/">a link</a>.</p>
  <ul>
    <li>One</li>
    <li>Two</li>
  </ul>
  <p id="note">Own id</p>
  <p>Has <em id="inner">an id</em> inside</p>
  <p id="char-count">0 / 500</p>
  <p>Icon <svg><path d="M0 0"/></svg> here</p>
  <img src="/a.png" alt="">
  <a class="btn" href="/en/contact/">Say hello</a>
</div>
`;

describe('which elements are blocks', () => {
	const blocks = scanBlocks(sample);
	const inners = blocks.map((b) => sample.slice(b.start, b.end));

	test('text elements with only inline markup inside are blocks, in document order', () => {
		assert.deepEqual(blocks.map((b) => b.tag), ['h1', 'p', 'li', 'li', 'p', 'a']);
		assert.deepEqual(blocks.map((b) => b.id), [0, 1, 2, 3, 4, 5]);
		assert.equal(inners[0], 'About <span class="x">Me</span>');
	});

	test('the outermost block wins: the span inside the heading is not a block of its own', () => {
		assert.ok(!blocks.some((b) => b.tag === 'span'));
	});

	test('an element with an id inside it, or holding a non-inline child, is left alone', () => {
		assert.ok(!inners.some((t) => t.includes('inside')));
		assert.ok(!inners.includes('0 / 500'), 'text a script writes is not offered');
		assert.ok(inners.includes('Own id'), 'its own id sits on the start tag, which an edit never touches');
		assert.ok(!inners.some((t) => t.includes('Icon')));
	});

	test('structure and images are not blocks', () => {
		assert.ok(!blocks.some((b) => ['div', 'ul', 'img'].includes(b.tag)));
	});

	test('markup inside comments and scripts is invisible to it', () => {
		const html = '<!-- <p>no</p> --><script>var s = "<p>no</p>";</script><p>yes</p>';
		assert.deepEqual(scanBlocks(html).map((b) => html.slice(b.start, b.end)), ['yes']);
	});

	test('an empty element is not worth clicking', () => {
		assert.equal(scanBlocks('<p>  </p><p>&nbsp;</p><p><strong></strong></p>').length, 0);
	});
});

describe('editing leaves everything else as written', () => {
	test('patching a block replaces its inner HTML only', () => {
		const out = patchInner(sample, 1, 'Changed <em>words</em>');
		assert.equal(out, sample.replace('First <strong>bold</strong> and <a href="/en/blog/">a link</a>.', 'Changed <em>words</em>'));
	});

	test('the same text written back is the identical file', () => {
		for (const b of scanBlocks(sample)) assert.equal(patchInner(sample, b.id, innerOf(sample, b.id)!), sample);
	});

	test('an edit does not renumber the blocks', () => {
		const out = patchInner(sample, 2, 'A much longer first item with <strong>bold</strong>');
		assert.deepEqual(scanBlocks(out).map((b) => b.tag), scanBlocks(sample).map((b) => b.tag));
	});

	test('annotate marks exactly the blocks, and removing the marks gives the source back', () => {
		const out = annotate(sample);
		assert.equal(out.match(/data-ed="/g)?.length, scanBlocks(sample).length);
		assert.equal(out.replace(/ data-ed="\d+"/g, ''), sample);
		assert.match(out, /<h1 data-ed="0">/);
		assert.match(out, /<a class="btn" href="\/en\/contact\/" data-ed="5">/);
	});

	test('a block\'s own link address is read and set without touching the rest of the tag', () => {
		assert.equal(attrOf(sample, 5, 'href'), '/en/contact/');
		const out = patchAttr(sample, 5, 'href', '/en/about/?a=1&b="2"');
		assert.match(out, /<a class="btn" href="\/en\/about\/\?a=1&amp;b=&quot;2&quot;">Say hello<\/a>/);
		assert.equal(attrOf(out, 5, 'href'), '/en/about/?a=1&b="2"');
		assert.equal(out.replace(/<a class="btn"[^>]*>/, ''), sample.replace(/<a class="btn"[^>]*>/, ''));
	});

	test('an address a tag never had is added', () => {
		const out = patchAttr('<a class="btn">Go</a>', 0, 'href', '/x/');
		assert.equal(out, '<a class="btn" href="/x/">Go</a>');
	});
});

describe('copying and removing a block', () => {
	test('only paragraphs, list items and headings can be copied or removed', () => {
		assert.ok(isRepeatable('p') && isRepeatable('li'));
		assert.ok(!isRepeatable('a') && !isRepeatable('h1') && !isRepeatable('button') && !isRepeatable('label'));
		assert.equal(removeBlock(sample, 0), sample, 'the page heading stays');
		assert.equal(removeBlock(sample, 5), sample, 'a button stays');
	});

	test('removing a block on its own line leaves no blank line', () => {
		const out = removeBlock(sample, 2);
		assert.ok(!out.includes('<li>One</li>'));
		assert.ok(out.includes('<ul>\n    <li>Two</li>\n  </ul>'));
	});

	test('copying puts an identical block on the next line, same indent', () => {
		const out = duplicateBlock(sample, 2);
		assert.ok(out.includes('<ul>\n    <li>One</li>\n    <li>One</li>\n    <li>Two</li>'));
		assert.equal(scanBlocks(out).length, scanBlocks(sample).length + 1);
	});

	test('a block sharing its line is copied inline instead', () => {
		const html = '<div><p>a</p><p>b</p></div>';
		assert.equal(duplicateBlock(html, 0), '<div><p>a</p><p>a</p><p>b</p></div>');
		assert.equal(removeBlock(html, 1), '<div><p>a</p></div>');
	});

	test('copy, then remove the copy, is where it started', () => {
		assert.equal(removeBlock(duplicateBlock(sample, 3), 4), sample);
	});
});

describe('on the real pages', () => {
	const files = PAGES.flatMap((p) => LANGS.map((l) => pageFile(p.name, l)));

	for (const file of files) {
		test(`${file}: blocks are well-formed, never nest, carry no id, and survive a no-op edit`, () => {
			const html = bodyOf(file);
			const blocks = scanBlocks(html);
			assert.ok(blocks.length > 0, 'nothing to click');
			let prevEnd = -1;
			for (const b of blocks) {
				assert.ok(b.tagStart >= prevEnd, `block ${b.id} overlaps the previous one`);
				prevEnd = b.outerEnd;
				assert.ok(b.start <= b.end && html.slice(b.outerEnd - 1, b.outerEnd) === '>');
				assert.doesNotMatch(html.slice(b.start, b.end), /\sid\s*=/);
				assert.equal(patchInner(html, b.id, html.slice(b.start, b.end)), html);
			}
			assert.equal(annotate(html).replace(/ data-ed="\d+"/g, ''), html);
		});
	}

	test('the contact form\'s ids all survive replacing every block with its own text', () => {
		const html = bodyOf('content/contact.md');
		let out = html;
		for (const b of scanBlocks(html)) out = patchInner(out, b.id, 'x');
		const ids = new Set([...out.matchAll(/\sid\s*=\s*["']([^"']+)/g)].map((m) => m[1]));
		for (const id of CONTACT_IDS) assert.ok(ids.has(id), `lost id="${id}"`);
		assert.equal(checkPage('contact', { title: 't', description: '', body: out }, html).filter((f) => f.severity === 'error').length, 0);
		assert.equal(unbalanced(out), unbalanced(html));
	});

	test('the About page offers its paragraphs, timeline text and headings', () => {
		const html = bodyOf('content/about.md');
		const tags = scanBlocks(html).map((b) => b.tag);
		assert.ok(tags.filter((t) => t === 'p').length >= 8);
		assert.ok(tags.includes('h1') && tags.includes('h3'));
	});
});
