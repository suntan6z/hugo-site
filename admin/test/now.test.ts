import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	NOW_JSON, NOW_ICONS, parseNow, readNow, serializeNow, checkNow, usedFiles, logoKind, nowText, fixLink,
	localizeLinks, monthYear, today, untranslated, emptyItem, emptyYear, SAFE_NAME, unsafeSvg, NowError
} from '../src/lib/now.ts';
import { replaceLink } from '../src/lib/server/tasks/edits.ts';
import { externalLinks } from '../src/lib/server/seo/links.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const bundle = () => fs.readdirSync(path.join(REPO, 'content/now'));

describe('the real Now page', () => {
	test('now.json survives parse -> serialize byte-for-byte', () => {
		const raw = read(NOW_JSON);
		assert.equal(serializeNow(parseNow(raw)), raw);
	});

	test('passes its own checks, with every picture it names in the folder', () => {
		const d = parseNow(read(NOW_JSON));
		const icons = Object.keys(JSON.parse(read(NOW_ICONS)));
		const errors = checkNow(d, bundle(), icons).filter((f) => f.severity === 'error');
		assert.deepEqual(errors, []);
		for (const f of usedFiles(d)) assert.ok(bundle().includes(f), f);
	});

	test('every icon it uses exists, and every icon is drawable path data', () => {
		const icons: Record<string, string[]> = JSON.parse(read(NOW_ICONS));
		for (const [name, paths] of Object.entries(icons)) {
			assert.match(name, /^[a-z][a-z-]*$/);
			assert.ok(paths.length > 0, name);
			for (const d of paths) assert.match(d, /^[Mm][\d\s.,a-zA-Z-]+$/, name);
		}
		for (const item of parseNow(read(NOW_JSON)).items) {
			if (logoKind(item.logo) === 'icon') assert.ok(icons[item.logo.slice(5)], item.logo);
		}
		// The archive's note icon is hard-coded in the template.
		assert.ok(icons.lightbulb);
	});

	test('the template and the portal describe the same fields', () => {
		const tpl = read('layouts/now/single.html');
		for (const key of ['updated', 'cover', 'intro', 'items', 'archive', '.logo', '.url', '.label', '.text', '.year', '.note', '.position', '.alt']) {
			assert.ok(tpl.includes(key), key);
		}
	});

	test('the page’s strings are in every language', () => {
		for (const l of ['en', 'fr', 'it']) {
			const toml = read(`i18n/${l}.toml`);
			for (const key of ['now_heading', 'now_updated', 'now_archive', 'now_about']) assert.match(toml, new RegExp(`^\\[${key}\\]$`, 'm'), `${l}: ${key}`);
		}
	});
});

describe('reading the file', () => {
	test('whatever is missing is filled in', () => {
		const d = parseNow('{"items":[{"text":"Hi"}],"archive":[{"year":2024}]}');
		assert.equal(d.cover.position, 'center');
		assert.deepEqual(d.items[0].label, { en: '', fr: '', it: '' });
		assert.deepEqual(d.items[0].text, { en: 'Hi', fr: '', it: '' }, 'a plain string is the English');
		assert.equal(d.archive[0].year, '2024');
		assert.deepEqual(parseNow(null).items, []);
	});

	test('a file that is not JSON is refused, but readers that only look see it empty', () => {
		assert.throws(() => parseNow('{oops'), NowError);
		assert.throws(() => parseNow('[1,2]'), NowError);
		assert.deepEqual(readNow('{oops').items, []);
	});

	test('an unknown cover position falls back to the centre', () => {
		assert.equal(parseNow('{"cover":{"position":"Bottom"}}').cover.position, 'bottom');
		assert.equal(parseNow('{"cover":{"position":"left"}}').cover.position, 'center');
	});

	test('serialising trims text and keeps a fixed shape', () => {
		const d = parseNow(null);
		d.updated = '2026-10-18';
		d.items.push({ ...emptyItem(), text: { en: '  Hello  ', fr: '', it: '' } });
		const out = JSON.parse(serializeNow(d));
		assert.equal(out.items[0].text.en, 'Hello');
		assert.deepEqual(Object.keys(out), ['updated', 'cover', 'intro', 'items', 'archive']);
		assert.ok(serializeNow(d).endsWith('}\n'));
	});
});

describe('checks', () => {
	const base = () => {
		const d = parseNow(null);
		d.updated = '2026-10-18';
		d.items.push({ ...emptyItem(), text: { en: 'Studying', fr: 'J’étudie', it: 'Studio' } });
		return d;
	};
	const errors = (d: ReturnType<typeof base>, files: string[] = []) => checkNow(d, files).filter((f) => f.severity === 'error').map((f) => f.message);

	test('a well-formed page has no errors', () => {
		assert.deepEqual(errors(base()), []);
	});

	test('a bad date, an empty English line, a bad link and a yearless entry are errors', () => {
		const d = base();
		d.updated = '18/10/2026';
		d.items.push({ ...emptyItem(), url: 'cnam.fr' });
		d.archive.push(emptyYear(''));
		const found = errors(d);
		assert.ok(found.some((m) => m.includes('not a date')));
		assert.ok(found.some((m) => m.includes('English text is empty')));
		assert.ok(found.some((m) => m.includes('https:// or /')));
		assert.ok(found.some((m) => m.includes('no year')));
	});

	test('the cover must be a photo; a missing picture only warns', () => {
		const d = base();
		d.cover.image = 'logo.svg';
		assert.ok(errors(d, ['logo.svg']).some((m) => m.includes('JPEG, PNG or WebP')));
		d.cover.image = 'gone.jpg';
		d.items[0].logo = 'gone.svg';
		assert.deepEqual(errors(d), []);
		assert.equal(checkNow(d, []).filter((f) => f.message.includes('not in the folder')).length, 2);
	});

	test('untranslated lines are counted per language', () => {
		const d = base();
		d.intro.en = 'Hello';
		d.intro.fr = 'Bonjour';
		assert.equal(untranslated(d, 'fr'), 0);
		assert.equal(untranslated(d, 'it'), 1);
		assert.ok(checkNow(d, []).some((f) => f.lang === 'it' && f.severity === 'warning'));
	});
});

describe('pictures', () => {
	test('logos are told apart by how they are written', () => {
		assert.equal(logoKind('icon:code'), 'icon');
		assert.equal(logoKind('/img/logo.svg'), 'site');
		assert.equal(logoKind('cnam.svg'), 'file');
		assert.equal(logoKind(''), 'none');
	});

	test('the files a page uses are its cover and uploaded logos, once each', () => {
		const d = parseNow(null);
		d.cover.image = 'cover.jpg';
		d.items = [{ ...emptyItem(), logo: 'cnam.svg' }, { ...emptyItem(), logo: 'icon:code' }, { ...emptyItem(), logo: 'cnam.svg' }];
		assert.deepEqual(usedFiles(d), ['cover.jpg', 'cnam.svg']);
	});

	test('only plain names of picture files can be uploaded', () => {
		for (const ok of ['cover.jpg', 'cnam-logo.svg', 'cover-paris-2.webp']) assert.ok(SAFE_NAME.test(ok), ok);
		for (const bad of ['../hugo.toml', 'now.json', 'index.md', 'Cover.JPG', '.svg', 'a/b.png', 'x.gif']) assert.equal(SAFE_NAME.test(bad), false, bad);
	});

	test('an SVG that could run something is refused', () => {
		const svg = (s: string) => new TextEncoder().encode(s);
		assert.equal(unsafeSvg(svg('<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>')), false);
		assert.equal(unsafeSvg(svg('<svg><script>alert(1)</script></svg>')), true);
		assert.equal(unsafeSvg(svg('<svg onload="x()"></svg>')), true);
		assert.equal(unsafeSvg(svg('<svg><a href="javascript:x()"/></svg>')), true);
		assert.equal(unsafeSvg(svg('<svg><foreignObject/></svg>')), true);
	});
});

describe('links', () => {
	const page = () => {
		const d = parseNow(null);
		d.items.push({ ...emptyItem(), url: 'https://www.cnam.fr', text: { en: 'At the [CNAM](https://www.cnam.fr).', fr: 'Au [CNAM](https://www.cnam.fr).', it: '' } });
		d.archive.push({ ...emptyYear('2025'), text: { en: 'See [old](https://old.example/).', fr: '', it: '' } });
		return d;
	};

	test('the link check finds every outside link in a language, the logo’s included', () => {
		assert.deepEqual(externalLinks(nowText(page(), 'en')).sort(), ['https://old.example/', 'https://www.cnam.fr']);
		assert.deepEqual(externalLinks(nowText(page(), 'it')), ['https://www.cnam.fr'], 'only the shared logo link');
	});

	test('a dead link is repointed in one language’s texts and in the shared logo link', () => {
		const url = 'https://www.cnam.fr';
		const next = 'https://www.cnam.fr/new';
		const d = fixLink(page(), 'en', url, next, (s) => replaceLink(s, url, next));
		assert.equal(d.items[0].text.en, 'At the [CNAM](https://www.cnam.fr/new).');
		assert.equal(d.items[0].text.fr, 'Au [CNAM](https://www.cnam.fr).', 'other languages are their own cards');
		assert.equal(d.items[0].url, next);
	});

	test('removing a dead link keeps the words', () => {
		const url = 'https://old.example/';
		const d = fixLink(page(), 'en', url, null, (s) => replaceLink(s, url, null));
		assert.equal(d.archive[0].text.en, 'See old.');
	});

	test('a machine-translated link to an English page goes to the same page in that language', () => {
		assert.equal(localizeLinks('[écrivez-moi](/en/contact/) ou [CV](/cv-fr.pdf)', 'fr'), '[écrivez-moi](/fr/contact/) ou [CV](/cv-fr.pdf)');
	});
});

describe('dates', () => {
	test('the month and year, in each language’s words', () => {
		assert.equal(monthYear('2026-10-18', 'en'), 'October 2026');
		assert.equal(monthYear('2026-10-18', 'fr'), 'octobre 2026');
		assert.equal(monthYear('2026-10-18', 'it'), 'ottobre 2026');
		assert.equal(monthYear('soon'), null);
	});

	test('today is the Paris calendar day', () => {
		assert.equal(today(new Date('2026-10-18T23:30:00Z')), '2026-10-19');
		assert.equal(today(new Date('2026-10-18T12:00:00Z')), '2026-10-18');
	});
});
