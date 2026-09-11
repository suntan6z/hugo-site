import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FrontMatter, FrontMatterError, formatScalar, fromForm } from '../src/lib/server/content/frontmatter.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');

function contentFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (/^_?index(\..+)?\.md$/.test(e.name)) out.push(p);
		}
	};
	walk(path.join(REPO, 'content', 'blog'));
	walk(path.join(REPO, 'content', 'gallery'));
	return out.sort();
}

const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('round-trip against real content', () => {
	const files = contentFiles();

	test('the corpus is non-empty (guards against a silently broken walk)', () => {
		assert.ok(files.length >= 60, `expected 60+ content files, found ${files.length}`);
	});

	for (const abs of files) {
		const rel = path.relative(REPO, abs);
		test(`${rel} survives parse -> serialize byte-for-byte`, () => {
			const raw = fs.readFileSync(abs, 'utf8');
			assert.equal(FrontMatter.parse(raw).serialize(), raw);
		});
	}
});

describe('corpus quirks that must not regress', () => {
	test('escaped quotes in first-home-nas round-trip and parse cleanly', () => {
		const raw = read('content/blog/first-home-nas/index.md');
		const fm = FrontMatter.parse(raw);
		assert.equal(fm.get('title'), 'I "Built" My First Home NAS');
		assert.equal(fm.serialize(), raw);
		// and re-setting the identical value must not perturb the bytes
		assert.equal(fm.set('title', 'I "Built" My First Home NAS').serialize(), raw);
	});

	test('front-matter comments in chat-control-eu survive an edit', () => {
		const raw = read('content/blog/chat-control-eu/index.fr.md');
		const out = FrontMatter.parse(raw).set('draft', true).serialize();
		assert.ok(out.includes('# No French translation yet.'), 'explanatory comment was dropped');
		assert.ok(out.includes('untranslated: true'), 'untranslated flag was dropped');
		assert.ok(out.includes('draft: true'));
		assert.equal(out.replace('draft: true', 'draft: false'), raw);
	});

	test('missing trailing newline is preserved (9 of 66 files have none)', () => {
		const raw = read('content/blog/ai-fatigue-is-real/index.md');
		assert.equal(raw.endsWith('\n'), false, 'fixture assumption changed');
		assert.equal(FrontMatter.parse(raw).set('draft', false).serialize().endsWith('\n'), false);
	});

	test('gallery nested build: block survives a title change', () => {
		const raw = read('content/gallery/camara-de-lobos/index.md');
		const fm = FrontMatter.parse(raw);
		assert.equal(fm.getNestedRaw('build'), 'build:\n  render: never\n  list: never');
		const out = fm.set('title', 'Câmara de Lobos').serialize();
		assert.equal(out, raw, 'accented title or nested block was rewritten');
	});
});

describe('editing', () => {
	test('a new key lands at its POST_ORDER position, not appended', () => {
		const fm = FrontMatter.parse(read('content/blog/ai-fatigue-is-real/index.md'));
		fm.set('featured_image', 'hero.webp');
		assert.deepEqual(fm.keys(), [
			'title', 'date', 'slug', 'category', 'draft', 'description', 'featured_image'
		]);
	});

	test('a key ordered before an existing one is inserted, not appended', () => {
		const fm = FrontMatter.parse(read('content/gallery/paris/index.md'));
		fm.set('slug', 'paris');
		assert.deepEqual(fm.keys(), ['title', 'slug', 'build']);
	});

	test('remove drops the key and its indented block', () => {
		const fm = FrontMatter.parse(read('content/gallery/paris/index.md'));
		assert.equal(fm.remove('build').serialize(), '---\ntitle: "Paris"\n---\n');
	});

	test('setOrRemove deletes on empty string', () => {
		const fm = FrontMatter.parse(read('content/blog/out-the-shadow/index.md'));
		assert.equal(fm.setOrRemove('project_url', '').has('project_url'), false);
		assert.equal(fm.setOrRemove('project_url', 'https://x.eu').get('project_url'), 'https://x.eu');
	});

	test('toObject exposes booleans and strings with the right types', () => {
		const o = FrontMatter.parse(read('content/blog/out-the-shadow/index.md')).toObject();
		assert.equal(o.draft, false);
		assert.equal(o.category, 'Erasmus+');
		assert.equal(o.date, '2024-12-20', 'date must stay a string, never become a Date');
	});
});

describe('guards', () => {
	test('dates are emitted bare and validated', () => {
		assert.equal(formatScalar('date', '2026-09-08'), '2026-09-08');
		assert.throws(() => formatScalar('date', '2026-9-8'), FrontMatterError);
		assert.throws(() => formatScalar('date', 'September 8, 2026'), FrontMatterError);
	});

	test('backslashes and quotes are the only things escaped', () => {
		assert.equal(formatScalar('title', 'a "b" c'), '"a \\"b\\" c"');
		assert.equal(formatScalar('title', 'C:\\path'), '"C:\\\\path"');
		assert.equal(formatScalar('description', 'em—dash, accenté, 🇪🇺'), '"em—dash, accenté, 🇪🇺"');
	});

	test('CRLF and BOM are rejected rather than silently breaking Hugo', () => {
		assert.throws(() => FrontMatter.parse('\uFEFF---\ntitle: "x"\n---\n'), FrontMatterError);
		assert.throws(() => FrontMatter.parse('---\r\ntitle: "x"\r\n---\r\n'), FrontMatterError);
	});

	test('a file with no front matter is rejected', () => {
		assert.throws(() => FrontMatter.parse('# just a heading\n'), FrontMatterError);
	});

	test('multi-line values are rejected', () => {
		assert.throws(() => formatScalar('description', 'a\nb'), FrontMatterError);
	});
});

describe('form-boundary line endings', () => {
	test('CRLF from a textarea is converted back to LF before writing', () => {
		// Browsers normalise textarea line breaks to CRLF on form submission.
		// Writing that verbatim breaks Hugo's front-matter regex and makes the
		// file unreadable by this very parser — see the guard test above.
		assert.equal(fromForm('a\r\nb\r\nc'), 'a\nb\nc');
		assert.equal(fromForm('no breaks'), 'no breaks');
		assert.equal(fromForm(null), '');
	});

	test('a body that arrived as CRLF round-trips cleanly once normalised', () => {
		const original = read('content/blog/ai-fatigue-is-real/index.md');
		const fm = FrontMatter.parse(original);
		const asSubmittedByBrowser = fm.body.replace(/\n/g, '\r\n');

		assert.throws(
			() => FrontMatter.parse(fm.setBody(asSubmittedByBrowser).serialize()),
			FrontMatterError,
			'writing raw CRLF must be rejected rather than silently corrupting the file'
		);

		assert.equal(
			FrontMatter.parse(original).setBody(fromForm(asSubmittedByBrowser)).serialize(),
			original
		);
	});
});

describe('empty front matter', () => {
	test('a blank block parses rather than throwing', () => {
		// Creating an article, and adding a first translation, both start here.
		const fm = FrontMatter.empty();
		assert.deepEqual(fm.keys(), []);
		assert.equal(fm.body, '');
	});

	test('round-trips as exactly `---\\n---\\n`, with no stray blank line', () => {
		assert.equal(FrontMatter.empty().serialize(), '---\n---\n');
		assert.equal(FrontMatter.parse('---\n---\n').serialize(), '---\n---\n');
	});

	test('keys added to a blank block land in POST_ORDER', () => {
		const fm = FrontMatter.empty();
		fm.set('description', 'd');
		fm.set('title', 't');
		fm.set('date', '2026-09-11');
		assert.deepEqual(fm.keys(), ['title', 'date', 'description']);
	});

	test('the result still satisfies Hugo’s front-matter regex', () => {
		const fm = FrontMatter.empty();
		fm.set('title', 'New');
		fm.set('date', '2026-09-11');
		const out = fm.setBody('\nBody.\n').serialize();
		// Mirrors layouts/partials/auto-untranslated-pages.html.
		assert.match(out, /^---\n[\s\S]*?\n---/);
		assert.equal(out.startsWith('---\n'), true);
		assert.equal(FrontMatter.parse(out).get('title'), 'New');
	});
});;
