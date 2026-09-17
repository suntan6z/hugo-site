import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	I18nFile, I18nError, LANGS, checkDrift, driftCount, placeholders, renderKeyHeader, type Lang
} from '../src/lib/server/content/i18n-file.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const read = (lang: string) => fs.readFileSync(path.join(REPO, 'i18n', `${lang}.toml`), 'utf8');
const files = () =>
	Object.fromEntries(LANGS.map((l) => [l, I18nFile.parse(read(l))])) as Record<Lang, I18nFile>;

describe('round-trip against the real files', () => {
	for (const lang of LANGS) {
		test(`i18n/${lang}.toml survives parse -> serialize byte-for-byte`, () => {
			const raw = read(lang);
			assert.equal(I18nFile.parse(raw).serialize(), raw);
		});
	}

	test('all three carry the same 99 keys', () => {
		const f = files();
		assert.equal(f.en.keys().length, 99);
		for (const l of LANGS) assert.deepEqual(f[l].keys().sort(), f.en.keys().sort());
	});

	test('the quoted Erasmus+ key is read and re-rendered in quoted form', () => {
		const f = files();
		assert.ok(f.en.keys().includes('cat_Erasmus+'));
		assert.equal(renderKeyHeader('cat_Erasmus+'), '["cat_Erasmus+"]');
		assert.equal(renderKeyHeader('nav_home'), '[nav_home]');
	});

	test('section comments are preserved, not discarded', () => {
		const out = I18nFile.parse(read('en')).set('nav_home', 'Home').serialize();
		assert.ok(out.includes('# ── Navigation'));
	});
});

describe('editing', () => {
	test('setting a value touches only that one line', () => {
		const raw = read('en');
		const out = I18nFile.parse(raw).set('nav_home', 'Start').serialize();
		const before = raw.split('\n');
		const after = out.split('\n');
		assert.equal(before.length, after.length);
		const changed = before.filter((l, i) => l !== after[i]);
		assert.deepEqual(changed, ['other = "Home"']);
	});

	test('re-setting the identical value changes nothing at all', () => {
		const raw = read('en');
		assert.equal(I18nFile.parse(raw).set('nav_home', 'Home').serialize(), raw);
	});

	test('quotes and backslashes are escaped, accents stay literal', () => {
		const f = I18nFile.parse(read('en'));
		f.set('nav_home', 'a "b" \\ c — é 🇪🇺');
		assert.equal(f.get('nav_home'), 'a "b" \\ c — é 🇪🇺');
		assert.ok(f.serialize().includes('other = "a \\"b\\" \\\\ c — é 🇪🇺"'));
	});

	test('a new key is appended with the right header form', () => {
		const f = I18nFile.parse(read('en'));
		f.set('brand_new_key', 'Hello');
		assert.equal(f.get('brand_new_key'), 'Hello');
		assert.ok(f.serialize().trimEnd().endsWith('[brand_new_key]\nother = "Hello"'));
	});

	test('a new key needing quotes gets them', () => {
		const f = I18nFile.parse(read('en'));
		f.set('cat_Something+', 'X');
		assert.ok(f.serialize().includes('["cat_Something+"]'));
		assert.equal(I18nFile.parse(f.serialize()).get('cat_Something+'), 'X');
	});

	test('removing a key takes its value line with it', () => {
		const f = I18nFile.parse(read('en'));
		const n = f.keys().length;
		f.remove('nav_home');
		assert.equal(f.keys().length, n - 1);
		assert.ok(!f.serialize().includes('[nav_home]'));
		assert.ok(!f.serialize().includes('other = "Home"'));
	});
});

describe('drift detection', () => {
	test('the shipped files have no drift', () => {
		assert.equal(driftCount(checkDrift(files())), 0);
	});

	test('a key missing from one language is reported', () => {
		const f = files();
		f.fr.remove('nav_home');
		const r = checkDrift(f);
		assert.deepEqual(r.missing, [{ lang: 'fr', key: 'nav_home' }]);
	});

	test('a key only present in a translation is reported as extra', () => {
		const f = files();
		f.it.set('invented_key', 'x');
		assert.deepEqual(checkDrift(f).extra, [{ lang: 'it', key: 'invented_key' }]);
	});

	test('an empty value is reported when the other languages have text', () => {
		const f = files();
		f.fr.set('nav_home', '   ');
		assert.ok(checkDrift(f).empty.some((e) => e.lang === 'fr' && e.key === 'nav_home'));
	});

	test('a key empty in every language is deliberate, not drift', () => {
		// hero_intro2 is an optional second intro paragraph, empty everywhere, and
		// layouts/index.html guards it with `{{ with i18n "hero_intro2" }}`.
		const f = files();
		for (const l of LANGS) assert.equal((f[l].get('hero_intro2') ?? '').trim(), '');
		assert.deepEqual(checkDrift(f).empty, []);
	});

	test('a dropped %placeholder% is reported', () => {
		const f = files();
		// photo_alt contains %city%; a translation losing it breaks the substitution.
		assert.deepEqual(placeholders(f.en.get('photo_alt') ?? ''), ['%city%']);
		f.fr.set('photo_alt', 'Photo de la ville');
		const r = checkDrift(f);
		assert.ok(r.placeholderMismatch.some((m) => m.key === 'photo_alt' && m.lang === 'fr'));
	});

	test('placeholders are compared as a set, not by position', () => {
		assert.deepEqual(placeholders('%n% of %count%'), ['%count%', '%n%']);
		assert.deepEqual(placeholders('%count% then %n%'), ['%count%', '%n%']);
	});
});

describe('guards', () => {
	test('CRLF is rejected', () => {
		assert.throws(() => I18nFile.parse('[a]\r\nother = "x"\r\n'), I18nError);
	});

	test('an unrecognised line is rejected rather than silently dropped', () => {
		assert.throws(() => I18nFile.parse('[a]\nother = "x"\nzero = 1\n'), I18nError);
	});
});
