import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepareMarkdown, lineToXml, xmlToLine } from '../src/lib/server/translate/markdown-xml.ts';
import { FrontMatter } from '../src/lib/server/content/frontmatter.ts';

const BLOG = path.resolve(import.meta.dirname, '..', '..', 'content', 'blog');

/** A stand-in for DeepL: shouts every word, leaves tags alone — as DeepL must. */
const shout = (xml: string) => xml.replace(/(^|>)([^<]*)/g, (_, a, t) => a + t.toUpperCase().replace(/&AMP;/g, '&amp;').replace(/&LT;/g, '&lt;').replace(/&GT;/g, '&gt;'));
const translate = (md: string, fn = shout) => {
	const p = prepareMarkdown(md);
	return p.rebuild(p.texts.map(fn));
};

describe('every real article survives the trip unchanged', () => {
	const files = fs
		.readdirSync(BLOG, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) =>
			fs.readdirSync(path.join(BLOG, e.name)).filter((f) => f.endsWith('.md')).map((f) => path.join(e.name, f))
		);
	assert.ok(files.length > 10);

	for (const f of files) {
		test(f, () => {
			const body = FrontMatter.parse(fs.readFileSync(path.join(BLOG, f), 'utf8')).body;
			const p = prepareMarkdown(body);
			const { markdown, warnings } = p.rebuild(p.texts);
			assert.equal(markdown, body);
			assert.deepEqual(warnings, []);
		});
	}
});

describe('what DeepL sees, and what comes back', () => {
	test('an image keeps its file, and only its alt text is translated', () => {
		assert.equal(translate('![A group photo](otstc1-4.jpg)').markdown, '![A GROUP PHOTO](otstc1-4.jpg)');
		assert.doesNotMatch(prepareMarkdown('![A group photo](otstc1-4.jpg)').texts[0], /otstc1/);
	});

	test('a link keeps its target, and its text is translated', () => {
		const md = 'See [the project](https://www.outtheshadow.eu "Site") now.';
		assert.equal(translate(md).markdown, 'SEE [THE PROJECT](https://www.outtheshadow.eu "Site") NOW.');
		assert.doesNotMatch(prepareMarkdown(md).texts[0], /outtheshadow/);
	});

	test('code, shortcodes, HTML, autolinks, bare URLs and footnotes never reach DeepL', () => {
		const md = 'Run `ls -la` then {{< youtube abc >}} and <br> or <https://x.eu/a> or https://y.eu/b?c=d&e=f, see[^1].';
		const sent = prepareMarkdown(md).texts[0];
		for (const s of ['ls -la', 'youtube', '<br>', 'x.eu', 'y.eu', '^1']) assert.ok(!sent.includes(s), s);
		assert.equal(
			translate(md).markdown,
			'RUN `ls -la` THEN {{< youtube abc >}} AND <br> OR <https://x.eu/a> OR https://y.eu/b?c=d&e=f, SEE[^1].'
		);
	});

	test('a URL keeps its ampersand exactly, while text ampersands survive escaping', () => {
		const md = 'Salt & pepper at https://a.eu/?x=1&y=2';
		assert.equal(translate(md, (x) => x).markdown, md);
		assert.match(prepareMarkdown(md).texts[0], /Salt &amp; pepper/);
	});

	test('bold and italic travel with their words as tags', () => {
		const { xml } = lineToXml('A **bold** and *soft* word, but 2 * 3 * 4 stays.');
		assert.equal(xml, 'A <b>bold</b> and <em>soft</em> word, but 2 * 3 * 4 stays.');
		// DeepL reorders words; the markers follow the tags.
		assert.equal(xmlToLine('Un mot <em>doux</em> et <b>gras</b>', []).text, 'Un mot *doux* et **gras**');
	});

	test('block markers stay outside the text sent', () => {
		const md = '## A heading\n\n- first item\n- second item\n1. numbered\n> quoted';
		const p = prepareMarkdown(md);
		assert.deepEqual(p.texts, ['A heading', 'first item', 'second item', 'numbered', 'quoted']);
		assert.equal(p.rebuild(p.texts.map(shout)).markdown, '## A HEADING\n\n- FIRST ITEM\n- SECOND ITEM\n1. NUMBERED\n> QUOTED');
	});

	test('fenced code, rules, blank lines and reference definitions are never sent', () => {
		const md = '```js\nconst words = "never";\n```\n\n---\n\n[ref]: https://x.eu\nText.';
		const p = prepareMarkdown(md);
		assert.deepEqual(p.texts, ['Text.']);
		assert.equal(p.rebuild(['Texte.']).markdown, '```js\nconst words = "never";\n```\n\n---\n\n[ref]: https://x.eu\nTexte.');
	});

	test('trailing spaces (a hard line break) are kept even if DeepL trims them', () => {
		const p = prepareMarkdown('Line one  \nLine two');
		assert.equal(p.rebuild(['Ligne un', 'Ligne deux']).markdown, 'Ligne un  \nLigne deux');
	});

	test('DeepL writing a tag in its long form is understood', () => {
		const { xml, slots } = lineToXml('Watch `this` now');
		assert.equal(xml, 'Watch <k i="0"/> now');
		assert.equal(xmlToLine('Regarde <k i="0"></k> maintenant', slots).text, 'Regarde `this` maintenant');
	});

	test('a dropped link is appended rather than lost, with a warning', () => {
		const p = prepareMarkdown('Read [this](a.md) and `that`.');
		const { markdown, warnings } = p.rebuild(['Lisez ceci.']);
		assert.equal(markdown, 'Lisez ceci. (a.md) `that`');
		assert.equal(warnings.length, 1);
	});

	test('a count mismatch from the API is an error, not a shifted article', () => {
		const p = prepareMarkdown('One.\n\nTwo.');
		assert.throws(() => p.rebuild(['Un.']), /Expected 2/);
	});
});
