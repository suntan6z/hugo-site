import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FrontMatter } from '../src/lib/server/content/frontmatter.ts';
import {
	PAGES, LANGS, pageFile, checkPage, unbalanced, stampOf, restamp, CONTACT_IDS, isPageName
} from '../src/lib/pages.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => FrontMatter.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

describe('the real pages', () => {
	for (const { name } of PAGES) {
		for (const lang of LANGS) {
			test(`${pageFile(name, lang)} exists and passes its own checks`, () => {
				const fm = read(pageFile(name, lang));
				const t = { title: String(fm.get('title') ?? ''), description: String(fm.get('description') ?? ''), body: fm.body };
				const errors = checkPage(name, t, t.body).filter((f) => f.severity === 'error');
				assert.deepEqual(errors, []);
				assert.equal(unbalanced(t.body), null, 'every element the page opens is closed');
			});
		}
	}

	test('every contact page carries every id the form script needs', () => {
		for (const lang of LANGS) {
			const body = read(pageFile('contact', lang)).body;
			for (const id of CONTACT_IDS) assert.match(body, new RegExp(`id="${id}"`), `${lang}: ${id}`);
		}
	});

	test('every id the list names is one static/js/main.js actually uses', () => {
		const js = fs.readFileSync(path.join(REPO, 'static', 'js', 'main.js'), 'utf8');
		for (const id of CONTACT_IDS) assert.ok(js.includes(`'${id}'`), id);
	});

	test('the Now and privacy pages have a "last updated" line in every language', () => {
		for (const lang of LANGS) {
			assert.ok(stampOf('now', lang, read(pageFile('now', lang)).body), `now ${lang}`);
			assert.ok(stampOf('privacy-policy', lang, read(pageFile('privacy-policy', lang)).body), `privacy ${lang}`);
		}
		assert.equal(stampOf('about', 'en', read(pageFile('about', 'en')).body), null);
	});
});

describe('checks', () => {
	test('an unclosed element is found, with its line', () => {
		assert.equal(unbalanced('<div>\n  <section>\n  </div>'), 'The <section> on line 2 is not closed before </div> on line 3.');
		assert.equal(unbalanced('<div><p>text</div>'), null, 'a <p> may close implicitly');
		assert.equal(unbalanced('<img src="a.jpg"><br><svg><path d="M0"/></svg>'), null);
		assert.equal(unbalanced('</span>'), 'A </span> on line 1 closes nothing that is open.');
		assert.equal(unbalanced('<div>\n<!-- </div> --><script>if (a < b) "</div>"</script>'), 'The <div> on line 1 is never closed.');
		assert.equal(unbalanced('<a title="x > y">link</a>'), null, 'a > inside a quoted attribute');
	});

	test('removing an id the contact form uses is refused; one already missing only warns', () => {
		const body = read(pageFile('contact', 'en')).body;
		const t = (b: string) => ({ title: 'Contact', description: 'x'.repeat(130), body: b });
		const without = body.replace('id="submit-btn"', 'id="send"');
		const refused = checkPage('contact', t(without), body);
		assert.equal(refused.find((f) => f.severity === 'error')?.message.includes('submit-btn'), true);
		const tolerated = checkPage('contact', t(without), without);
		assert.equal(tolerated.some((f) => f.severity === 'error'), false);
		assert.ok(tolerated.some((f) => f.message.includes('submit-btn')));
	});

	test('the id rule only applies to the contact page', () => {
		assert.deepEqual(checkPage('about', { title: 'About', description: 'x'.repeat(130), body: '<p>Hi</p>' }), []);
		assert.ok(isPageName('now'));
		assert.equal(isPageName('../hugo'), false);
	});
});

describe('"last updated"', () => {
	const sept = new Date('2026-09-16T10:00:00Z');

	test('the Now page is restamped in each language’s own words', () => {
		assert.equal(restamp('now', 'en', '<p class="page-eyebrow">Last updated July 2026</p>', sept), '<p class="page-eyebrow">Last updated September 2026</p>');
		assert.equal(restamp('now', 'fr', 'Mis à jour en juillet 2026', sept), 'Mis à jour en septembre 2026');
		assert.equal(restamp('now', 'it', 'Aggiornato a luglio 2026', sept), 'Aggiornato a settembre 2026');
	});

	test('the privacy policy carries the day too', () => {
		assert.equal(restamp('privacy-policy', 'en', 'Last updated: June 23, 2026', sept), 'Last updated: September 16, 2026');
		assert.equal(restamp('privacy-policy', 'fr', 'Dernière mise à jour : 23 juin 2026', sept), 'Dernière mise à jour : 16 septembre 2026');
		assert.equal(restamp('privacy-policy', 'it', 'Ultimo aggiornamento: 23 giugno 2026', sept), 'Ultimo aggiornamento: 16 settembre 2026');
	});

	test('a page without the line is left alone', () => {
		assert.equal(restamp('about', 'en', 'Last updated July 2026', sept), null);
		assert.equal(restamp('now', 'en', 'nothing here', sept), null);
	});
});
