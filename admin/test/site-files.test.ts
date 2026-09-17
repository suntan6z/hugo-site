import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isJpeg, isWebp, isPdf, resumePath, HERO_JPEG, HERO_WEBP } from '../src/lib/server/content/site-files.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const bytes = (rel: string) => new Uint8Array(fs.readFileSync(path.join(REPO, rel)));

test('the committed hero photo and CV are recognised by their contents', () => {
	assert.ok(isJpeg(bytes(HERO_JPEG)));
	assert.ok(isWebp(bytes(HERO_WEBP)));
	assert.ok(isPdf(bytes('static/cv-fr.pdf')));
});

test('a file is not accepted for what its name says', () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	assert.equal(isJpeg(png), false);
	assert.equal(isWebp(png), false);
	assert.equal(isPdf(new TextEncoder().encode('<html>%PDF-')), false);
	assert.equal(isWebp(new TextEncoder().encode('RIFF....WAVE')), false);
});

test('only a PDF at the site root can be replaced', () => {
	assert.equal(resumePath('/cv-fr.pdf'), 'static/cv-fr.pdf');
	assert.equal(resumePath('/docs/cv.pdf'), null);
	assert.equal(resumePath('https://example.com/cv.pdf'), null);
	assert.equal(resumePath('/../hugo.toml'), null);
	assert.equal(resumePath('/cv.docx'), null);
});
