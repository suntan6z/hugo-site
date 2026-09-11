import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildBrandCss, extractBlock, extractFontFaces } from '../scripts/sync-brand.mjs';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const siteCss = fs.readFileSync(path.join(REPO, 'static', 'css', 'main.css'), 'utf8');
const tokens = (block: string) =>
	Object.fromEntries([...block.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

describe('brand tokens are derived from the site, not copied', () => {
	const out = buildBrandCss(siteCss);

	test('every light-theme token matches the site exactly', () => {
		const site = tokens(extractBlock(siteCss, /:root\s*\{(?=[^}]*--background)/)!);
		const portal = tokens(extractBlock(out, /:root\s*\{(?=[^}]*--background)/)!);
		assert.deepEqual(portal, site);
		assert.equal(site['--primary'], 'hsl(350, 45%, 40%)', 'fixture assumption: burgundy primary');
	});

	test('every dark-theme token matches the site exactly', () => {
		const site = tokens(extractBlock(siteCss, /\[data-theme="dark"\]\s*\{/)!);
		const portal = tokens(extractBlock(out, /\[data-theme="dark"\]\s*\{/)!);
		assert.deepEqual(portal, site);
	});

	test('the brand yellow comes through', () => {
		assert.match(out, /--brand-yellow:\s*#ffd16a/);
	});

	test('fonts are rewritten to the portal path, and all of them come across', () => {
		const faces = extractFontFaces(out);
		assert.equal(faces.length, extractFontFaces(siteCss).length);
		assert.ok(faces.every((f: string) => f.includes('url(/brand/fonts/')));
		assert.ok(!out.includes('url(/fonts/'), 'a font still points at the site path');
	});

	test('both typefaces are present', () => {
		assert.match(out, /font-family:\s*'DM Sans'/);
		assert.match(out, /font-family:\s*'Fraunces'/);
	});

	test('every referenced font file actually exists in the site', () => {
		const refs = [...out.matchAll(/url\(\/brand\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
		for (const f of new Set(refs)) {
			assert.ok(fs.existsSync(path.join(REPO, 'static', 'fonts', f)), `missing font ${f}`);
		}
	});
});

describe('block extraction', () => {
	test('matches braces rather than stopping at the first }', () => {
		const css = 'a { b: 1; } :root { --x: 1; @media (x) { y: 2; } --background: 0; } z {}';
		const block = extractBlock(css, /:root\s*\{(?=[^}]*--x)/);
		assert.ok(block?.endsWith('--background: 0; }'));
	});

	test('a missing block is null rather than throwing', () => {
		assert.equal(extractBlock('a {}', /:root\s*\{/), null);
	});
});
