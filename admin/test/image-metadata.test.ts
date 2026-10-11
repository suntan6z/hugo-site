import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imageKind, findMetadata, stripMetadata, jpegOrientation } from '../src/lib/server/content/image-metadata.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const enc = (s: string) => [...s].map((c) => c.charCodeAt(0));
const cat = (...parts: number[][]) => new Uint8Array(parts.flat());
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

/* A JPEG segment: marker + big-endian length (which counts itself) + payload. */
const seg = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];

/** Big-endian EXIF with an IFD0 of SHORT/LONG tags. */
function exif(tags: [number, number, number][]) {
	const ifd = [...u16(tags.length), ...tags.flatMap(([tag, type, v]) => [...u16(tag), ...u16(type), ...u32(1), ...(type === 3 ? [...u16(v), 0, 0] : u32(v))]), ...u32(0)];
	return [...enc('Exif\0\0'), ...enc('MM'), ...u16(42), ...u32(8), ...ifd];
}

const APP0 = seg(0xe0, [...enc('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = seg(0xe2, [...enc('ICC_PROFILE\0'), 1, 1, 9, 9, 9]);
const DQT = seg(0xdb, [0, 1, 2, 3]);
// Scan data containing a stuffed 0xFF00 and a restart marker, which must not
// be mistaken for the end of the scan.
const SCAN = [...seg(0xda, [1, 2, 3]), 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const EOI = [0xff, 0xd9];

describe('JPEG', () => {
	const dirty = cat(
		[0xff, 0xd8],
		APP0,
		seg(0xe1, exif([[0x010f, 3, 1], [0x8825, 4, 26]])), // Make + GPS pointer
		seg(0xe1, [...enc('http://ns.adobe.com/xap/1.0/\0'), ...enc('<x:xmpmeta/>')]),
		ICC,
		seg(0xe2, [...enc('MPF\0'), 0, 0]),
		seg(0xed, [...enc('Photoshop 3.0\0'), 0]),
		seg(0xfe, enc('shot at home')),
		DQT,
		SCAN,
		EOI,
		[0xff, 0xd8, 0xff, 0xd9] // an appended second image (iPhone gain map)
	);

	test('finds every kind of metadata, location included', () => {
		assert.equal(imageKind(dirty), 'jpeg');
		assert.deepEqual(findMetadata(dirty).sort(), ['EXIF', 'GPS location', 'IPTC', 'XMP', 'comment', 'data after the image', 'multi-picture data'].sort());
	});

	test('strips it all and keeps the picture byte for byte, colour profile included', () => {
		const clean = stripMetadata(dirty);
		assert.deepEqual(clean, cat([0xff, 0xd8], APP0, ICC, DQT, SCAN, EOI));
		assert.deepEqual(findMetadata(clean), []);
	});

	test('a clean file comes back as the very same object', () => {
		const clean = stripMetadata(dirty);
		assert.equal(stripMetadata(clean), clean);
	});

	test('refuses to drop a rotation flag the picture depends on', () => {
		const rotated = cat([0xff, 0xd8], seg(0xe1, exif([[0x0112, 3, 6]])), DQT, SCAN, EOI);
		assert.equal(jpegOrientation(rotated), 6);
		assert.throws(() => stripMetadata(rotated), /rotated/);
		const upright = cat([0xff, 0xd8], seg(0xe1, exif([[0x0112, 3, 1]])), DQT, SCAN, EOI);
		assert.equal(jpegOrientation(upright), 1);
		assert.deepEqual(findMetadata(stripMetadata(upright)), []);
	});
});

describe('PNG', () => {
	const chunk = (type: string, data: number[]) => [...u32(data.length), ...enc(type), ...data, 0, 0, 0, 0];
	const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	const IHDR = chunk('IHDR', Array(13).fill(1));
	const ICCP = chunk('iCCP', enc('p\0\0x'));
	const IDAT = chunk('IDAT', [1, 2, 3]);
	const IEND = chunk('IEND', []);
	const dirty = cat(SIG, IHDR, ICCP, chunk('tEXt', enc('Author\0me')), chunk('eXIf', [1, 2]), chunk('iTXt', enc('XML:com.adobe.xmp\0')), IDAT, chunk('tIME', [1, 2, 3, 4, 5, 6, 7]), IEND);

	test('drops text, EXIF, XMP and timestamps; keeps pixels and colour', () => {
		assert.equal(imageKind(dirty), 'png');
		assert.ok(findMetadata(dirty).includes('EXIF'));
		const clean = stripMetadata(dirty);
		assert.deepEqual(clean, cat(SIG, IHDR, ICCP, IDAT, IEND));
		assert.deepEqual(findMetadata(clean), []);
	});
});

describe('WebP', () => {
	const chunk = (type: string, data: number[]) => [...enc(type), ...u32le(data.length), ...data, ...(data.length & 1 ? [0] : [])];
	const riff = (...chunks: number[][]) => {
		const body = chunks.flat();
		return cat(enc('RIFF'), u32le(body.length + 4), enc('WEBP'), body);
	};
	const vp8x = (flags: number) => chunk('VP8X', [flags, 0, 0, 0, 9, 0, 0, 9, 0, 0]);
	const IMG = chunk('VP8 ', [1, 2, 3, 4, 5]);
	const dirty = riff(vp8x(0x20 | 0x08 | 0x04), chunk('ICCP', [7, 7]), IMG, chunk('EXIF', [1, 2, 3]), chunk('XMP ', [4, 5]));

	test('drops EXIF and XMP chunks, clears their flags, fixes the RIFF size', () => {
		assert.equal(imageKind(dirty), 'webp');
		assert.deepEqual(findMetadata(dirty).sort(), ['EXIF', 'XMP']);
		const clean = stripMetadata(dirty);
		assert.deepEqual(clean, riff(vp8x(0x20), chunk('ICCP', [7, 7]), IMG));
		assert.deepEqual(findMetadata(clean), []);
	});
});

test('a damaged or truncated JPEG is cleaned, not crashed on', () => {
	const truncated = cat([0xff, 0xd8], APP0, seg(0xe1, exif([[0x010f, 3, 1]])), DQT, SCAN.slice(0, 8));
	assert.deepEqual(findMetadata(truncated), ['EXIF']);
	const clean = stripMetadata(truncated);
	assert.deepEqual(findMetadata(clean), []);
	assert.doesNotThrow(() => findMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])));
});

test('other files pass through untouched', () => {
	const pdf = new Uint8Array(enc('%PDF-1.7 Author: me'));
	assert.equal(imageKind(pdf), null);
	assert.deepEqual(findMetadata(pdf), []);
	assert.equal(stripMetadata(pdf), pdf);
});

test('no image committed to the site carries metadata', () => {
	const bad: string[] = [];
	const walk = (dir: string) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.(jpe?g|png|webp)$/i.test(e.name)) {
				const found = findMetadata(new Uint8Array(fs.readFileSync(p)));
				if (found.length) bad.push(`${path.relative(REPO, p)}: ${found.join(', ')}`);
			}
		}
	};
	for (const d of ['content', 'static', 'assets']) walk(path.join(REPO, d));
	assert.deepEqual(bad, [], 'run: node scripts/image-metadata.mjs --fix');
});
