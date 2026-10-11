#!/usr/bin/env node
/**
 * Finds — and with --fix, removes — metadata in the site's images: EXIF
 * (camera, date, GPS position), XMP, IPTC, comments, appended secondary
 * images. Pixels are never re-encoded; see the module it uses,
 * admin/src/lib/server/content/image-metadata.ts, which the admin portal also
 * runs on every image it commits.
 *
 *   node scripts/image-metadata.mjs            # report, exit 1 if anything found
 *   node scripts/image-metadata.mjs --fix      # clean every file in place
 *   node scripts/image-metadata.mjs --fix content/blog/my-post   # just these
 *
 * A JPEG stored sideways with an EXIF rotation flag is first rotated for real
 * with jpegtran (lossless; `brew install jpeg-turbo`), since dropping the flag
 * alone would leave it sideways.
 *
 * Runs in CI (.github/workflows/hugo-build.yml); the Hugo build itself also
 * refuses to publish a photo that still carries metadata
 * (layouts/partials/image-metadata-guard.html).
 *
 * Needs Node 23.6+ (imports the TypeScript module directly).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findMetadata, stripMetadata, jpegOrientation, imageKind } from '../admin/src/lib/server/content/image-metadata.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const fix = args.includes('--fix');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = (targets.length ? targets : ['content', 'static', 'assets']).map((d) => path.resolve(ROOT, d));
const SKIP = new Set(['node_modules', 'public', 'resources', '.git']);
const EXT = /\.(jpe?g|png|webp)$/i;

function* walk(p) {
	const st = fs.statSync(p, { throwIfNoEntry: false });
	if (!st) return;
	if (st.isFile()) {
		if (EXT.test(p)) yield p;
		return;
	}
	for (const e of fs.readdirSync(p, { withFileTypes: true })) {
		if (SKIP.has(e.name)) continue;
		yield* walk(path.join(p, e.name));
	}
}

// EXIF orientation -> the jpegtran transform that makes the pixels upright.
const UPRIGHT = {
	2: ['-flip', 'horizontal'],
	3: ['-rotate', '180'],
	4: ['-flip', 'vertical'],
	5: ['-transpose'],
	6: ['-rotate', '90'],
	7: ['-transverse'],
	8: ['-rotate', '270']
};

function jpegtranUpright(file, orientation) {
	const run = (extra) =>
		execFileSync('jpegtran', ['-copy', 'icc', ...extra, ...UPRIGHT[orientation], file], {
			maxBuffer: 256 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe']
		});
	try {
		return new Uint8Array(run(['-perfect']));
	} catch {
		// -perfect refuses when the size isn't a multiple of the JPEG block
		// size; -trim drops those few edge pixels (at most 15) instead.
		return new Uint8Array(run(['-trim']));
	}
}

let dirty = 0;
let cleaned = 0;
for (const root of roots) {
	for (const file of walk(root)) {
		const bytes = new Uint8Array(fs.readFileSync(file));
		if (!imageKind(bytes)) continue;
		const found = findMetadata(bytes);
		if (!found.length) continue;
		const rel = path.relative(ROOT, file);
		dirty++;
		if (!fix) {
			console.log(`${rel}: ${found.join(', ')}`);
			continue;
		}
		let out = bytes;
		const o = imageKind(bytes) === 'jpeg' ? jpegOrientation(bytes) : 1;
		if (o !== 1) out = jpegtranUpright(file, o);
		out = stripMetadata(out);
		const left = findMetadata(out);
		if (left.length) throw new Error(`${rel}: still has ${left.join(', ')} after cleaning`);
		fs.writeFileSync(file, out);
		cleaned++;
		console.log(`${rel}: removed ${found.join(', ')}${o !== 1 ? ' (rotated upright)' : ''}`);
	}
}

if (fix) {
	console.log(cleaned ? `\nCleaned ${cleaned} file(s).` : 'Nothing to clean.');
} else if (dirty) {
	console.log(`\n${dirty} image(s) carry metadata. Clean them with: node scripts/image-metadata.mjs --fix`);
	process.exit(1);
} else {
	console.log('No image metadata found.');
}
