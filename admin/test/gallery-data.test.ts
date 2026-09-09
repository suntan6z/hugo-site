import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	parseCities, writeCities, parsePhotos, writePhotos,
	slugifyCity, renumber, nextNumbers, photoKey, cityStub
} from '../src/lib/server/content/gallery-data.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('data file serialisation', () => {
	test('cities: content survives a parse/write round-trip', () => {
		const raw = read('data/gallery_cities.json');
		assert.deepEqual(parseCities(writeCities(parseCities(raw))), parseCities(raw));
	});

	test('photos: content survives a parse/write round-trip', () => {
		const raw = read('data/gallery_photos.json');
		assert.deepEqual(parsePhotos(writePhotos(parsePhotos(raw))), parsePhotos(raw));
	});

	test('writing is idempotent, so a second edit produces no spurious diff', () => {
		const once = writePhotos(parsePhotos(read('data/gallery_photos.json')));
		assert.equal(writePhotos(parsePhotos(once)), once);
	});

	test('output is one line per record, so diffs stay small', () => {
		const photos = parsePhotos(read('data/gallery_photos.json'));
		const lines = writePhotos(photos).trimEnd().split('\n');
		assert.equal(lines.length, photos.length + 2, 'expected [ + one line per record + ]');
		assert.equal(lines[0], '[');
		assert.equal(lines.at(-1), ']');
	});

	test('accents and emoji survive as literal UTF-8', () => {
		const out = writeCities([
			{ name: 'Câmara de Lobos', slug: 'camara-de-lobos', flag: '🇵🇹' }
		]);
		assert.match(out, /Câmara de Lobos/);
		assert.match(out, /🇵🇹/);
	});

	test('quotes and backslashes are escaped by JSON.stringify, not by hand', () => {
		const out = writePhotos([
			{ city: 'x', image_url: '/gallery/x/1.jpg', caption: 'a "b" c', alt_text: 'back\\slash' }
		]);
		assert.deepEqual(parsePhotos(out)[0].caption, 'a "b" c');
		assert.deepEqual(parsePhotos(out)[0].alt_text, 'back\\slash');
	});

	test('an empty list is valid JSON', () => {
		assert.deepEqual(JSON.parse(writeCities([])), []);
		assert.equal(writeCities([]).endsWith('\n'), true);
	});

	test('the last record carries no trailing comma', () => {
		const out = writeCities(parseCities(read('data/gallery_cities.json')));
		const records = out.trimEnd().split('\n').slice(1, -1);
		assert.equal(records.at(-1)!.trimEnd().endsWith(','), false);
		assert.ok(records.slice(0, -1).every((l) => l.trimEnd().endsWith(',')));
	});
});

describe('ordering', () => {
	test('renumber returns only the files that actually move', () => {
		assert.deepEqual(renumber(['1.jpg', '2.jpg', '3.jpg']), []);
	});

	test('reversing three photos renames all three', () => {
		assert.deepEqual(renumber(['3.jpg', '2.jpg', '1.jpg']), [
			{ from: '3.jpg', to: '1.jpg' },
			{ from: '1.jpg', to: '3.jpg' }
		]);
	});

	test('renumbering closes gaps left by deletions', () => {
		assert.deepEqual(renumber(['1.jpg', '5.jpg', '9.jpg']), [
			{ from: '5.jpg', to: '2.jpg' },
			{ from: '9.jpg', to: '3.jpg' }
		]);
	});

	test('extensions are preserved per file, including the one PNG', () => {
		assert.deepEqual(renumber(['9.png', '1.jpg']), [
			{ from: '9.png', to: '1.png' },
			{ from: '1.jpg', to: '2.jpg' }
		]);
	});

	test('next numbers continue past the highest existing prefix', () => {
		assert.deepEqual(nextNumbers(['1.jpg', '2.jpg', '7.jpg'], 3), [8, 9, 10]);
	});

	test('next numbers start at 1 for an empty city', () => {
		assert.deepEqual(nextNumbers([], 2), [1, 2]);
	});

	test('non-numeric filenames do not break numbering', () => {
		assert.deepEqual(nextNumbers(['cover.jpg', '3.jpg'], 1), [4]);
	});
});

describe('keys and slugs', () => {
	test('photo keys match the form layouts/index.html looks up', () => {
		assert.equal(photoKey('paris', '1.jpg'), '/gallery/paris/1.jpg');
		// Every existing entry must be reachable by that construction.
		const photos = parsePhotos(read('data/gallery_photos.json'));
		for (const p of photos) {
			const file = p.image_url.split('/').pop()!;
			assert.equal(photoKey(p.city, file), p.image_url);
		}
	});

	test('city slugs strip accents and match the existing folders', () => {
		assert.equal(slugifyCity('Câmara de Lobos'), 'camara-de-lobos');
		assert.equal(slugifyCity('Paris'), 'paris');
		for (const c of parseCities(read('data/gallery_cities.json'))) {
			assert.ok(
				fs.existsSync(path.join(REPO, 'content', 'gallery', c.slug)),
				`no bundle for ${c.slug}`
			);
		}
	});
});

describe('city bundle stubs', () => {
	test('generated stubs are byte-identical to every existing one', () => {
		const cities = parseCities(read('data/gallery_cities.json'));
		for (const c of cities) {
			for (const f of ['index.md', 'index.fr.md', 'index.it.md']) {
				const p = path.join(REPO, 'content', 'gallery', c.slug, f);
				assert.equal(
					fs.readFileSync(p, 'utf8'),
					cityStub(c.name),
					`${c.slug}/${f} does not match the generated stub`
				);
			}
		}
	});

	test('an accented name is written as literal UTF-8, not escaped', () => {
		assert.match(cityStub('Câmara de Lobos'), /title: "Câmara de Lobos"/);
	});
});
