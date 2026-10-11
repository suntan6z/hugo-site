/**
 * Removes metadata from image files before they are published.
 *
 * Phone and camera photos carry EXIF (camera, serial numbers, the date and the
 * GPS position where they were taken), XMP and IPTC (author, editing history),
 * comments, and on recent iPhones whole secondary images appended after the
 * picture. None of it is needed to show the image, and on a public site it is
 * a privacy leak.
 *
 * The pixels are never touched — nothing is re-encoded. The file is taken
 * apart into its JPEG segments / PNG chunks / WebP chunks, the ones that only
 * describe the image are dropped, and the rest is put back together byte for
 * byte. The ICC colour profile is kept: it is what makes a Display P3 photo
 * look right, and it says nothing about anyone.
 *
 * One thing cannot be dropped losslessly: a JPEG stored sideways with an EXIF
 * "rotate me" flag. Without the flag it would show sideways, so such files are
 * reported (jpegOrientation) and must be rotated for real first —
 * scripts/image-metadata.mjs does that with jpegtran, which is also lossless.
 *
 * Pure: no I/O. Used on every portal commit (repo.ts) and by
 * scripts/image-metadata.mjs for files that reach the repo any other way.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp';

const at = (b: Uint8Array, sig: number[], i = 0) => sig.every((v, k) => b[i + k] === v);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

export function imageKind(b: Uint8Array): ImageKind | null {
	if (at(b, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (at(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (at(b, [0x52, 0x49, 0x46, 0x46]) && at(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
	return null;
}

/* ------------------------------------------------------------------- JPEG */

interface Segment {
	marker: number;
	start: number; // offset of the 0xFF
	end: number; // offset just past the segment (and, for SOS, its scan data)
}

/** Markers with no length field. */
const standalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd7);

/**
 * Splits a JPEG into segments up to and including the EOI that ends the main
 * image. Anything after it (an iPhone's gain map, a depth map, trailing junk)
 * is reported through `trailing`.
 *
 * Never throws: a damaged or truncated file is read as far as it makes sense
 * and the rest counts as trailing data. That is safe here because stripping
 * keeps only segments positively recognised as picture data.
 */
function jpegSegments(b: Uint8Array): { segments: Segment[]; eoi: number; trailing: boolean } {
	const segments: Segment[] = [];
	let i = 2;
	while (i < b.length) {
		if (b[i] !== 0xff) return { segments, eoi: i, trailing: true };
		while (b[i] === 0xff) i++; // fill bytes
		const marker = b[i];
		const start = i - 1;
		i++;
		if (marker === 0xd9) {
			return { segments, eoi: i, trailing: i < b.length };
		}
		if (standalone(marker)) {
			segments.push({ marker, start, end: i });
			continue;
		}
		const len = u16be(b, i);
		i += len;
		if (marker === 0xda) {
			// Entropy-coded scan data runs until the next real marker: 0xFF
			// followed by something other than a stuffed 0x00 or a restart marker.
			while (i < b.length - 1 && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
			if (i >= b.length - 1) i = b.length; // truncated mid-scan: it runs to the end
		}
		segments.push({ marker, start, end: Math.min(i, b.length) });
	}
	return { segments, eoi: b.length, trailing: false }; // truncated: no EOI
}

/** APPn segments worth keeping: the ones needed to draw the picture correctly. */
function keepJpegSegment(b: Uint8Array, s: Segment): boolean {
	const m = s.marker;
	if (m === 0xfe) return false; // COM: free-text comment
	if (m < 0xe0 || m > 0xef) return true; // tables, frame, scans: the image itself
	const id = ascii(b, s.start + 4, 12);
	if (m === 0xe0) return id.startsWith('JFIF\0') || id.startsWith('JFXX\0');
	if (m === 0xe2) return id.startsWith('ICC_PROFILE\0'); // not MPF / FlashPix
	if (m === 0xee) return id.startsWith('Adobe'); // colour transform flag
	return false; // APP1 EXIF/XMP, APP13 IPTC/Photoshop, vendor blocks
}

/** Tag id -> value of the first IFD (IFD0) of an APP1 EXIF segment. */
function exifIfd0(b: Uint8Array, s: Segment): Map<number, number> {
	const tags = new Map<number, number>();
	const t = s.start + 10; // TIFF header, after "Exif\0\0"
	const le = b[t] === 0x49;
	const r16 = (i: number) => (le ? b[i] | (b[i + 1] << 8) : u16be(b, i));
	const r32 = (i: number) => (le ? u32le(b, i) : u32be(b, i));
	const ifd = t + r32(t + 4);
	if (ifd + 2 > s.end) return tags;
	const n = r16(ifd);
	for (let k = 0; k < n && ifd + 14 + 12 * k <= s.end; k++) {
		const e = ifd + 2 + 12 * k;
		const type = r16(e + 2);
		tags.set(r16(e), type === 3 ? r16(e + 8) : r32(e + 8)); // SHORT or LONG
	}
	return tags;
}

const isExif = (b: Uint8Array, s: Segment) => s.marker === 0xe1 && ascii(b, s.start + 4, 6) === 'Exif\0\0';

/** The EXIF orientation (1–8) of a JPEG; 1 when it has none. */
export function jpegOrientation(b: Uint8Array): number {
	if (imageKind(b) !== 'jpeg') return 1;
	for (const s of jpegSegments(b).segments) {
		if (isExif(b, s)) return exifIfd0(b, s).get(0x0112) || 1;
	}
	return 1;
}

/* -------------------------------------------------------------------- PNG */

/** Ancillary chunks needed to draw a PNG (or an APNG) correctly. Everything
 *  else ancillary — tEXt, zTXt, iTXt (XMP), eXIf, tIME, vendor chunks — goes. */
const PNG_KEEP = new Set([
	'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCv', 'cLLi',
	'bKGD', 'hIST', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT'
]);

function pngChunks(b: Uint8Array) {
	const chunks: { type: string; start: number; end: number }[] = [];
	let i = 8;
	while (i + 8 <= b.length) {
		const len = u32be(b, i);
		const type = ascii(b, i + 4, 4);
		const end = i + 12 + len;
		chunks.push({ type, start: i, end });
		i = end;
		if (type === 'IEND') break;
	}
	return { chunks, trailing: i < b.length };
}

/** Critical chunks (upper-case first letter) are the image; keep those too. */
const keepPngChunk = (type: string) => /^[A-Z]/.test(type) || PNG_KEEP.has(type);

/* ------------------------------------------------------------------- WebP */

function webpChunks(b: Uint8Array) {
	const chunks: { type: string; start: number; end: number }[] = [];
	const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
	let i = 12;
	while (i + 8 <= riffEnd) {
		const len = u32le(b, i + 4);
		const end = i + 8 + len + (len & 1);
		chunks.push({ type: ascii(b, i, 4), start: i, end });
		i = end;
	}
	return chunks;
}

const WEBP_DROP = new Set(['EXIF', 'XMP ']);

/* ----------------------------------------------------------------- public */

/**
 * What metadata a file carries, as short human labels (empty when clean).
 * Unknown formats report nothing: this only speaks for JPEG, PNG and WebP.
 */
export function findMetadata(b: Uint8Array): string[] {
	const kind = imageKind(b);
	const found = new Set<string>();
	if (kind === 'jpeg') {
		const { segments, trailing } = jpegSegments(b);
		for (const s of segments) {
			if (keepJpegSegment(b, s)) continue;
			if (isExif(b, s)) {
				found.add('EXIF');
				if (exifIfd0(b, s).has(0x8825)) found.add('GPS location'); // GPS sub-IFD pointer
			} else if (s.marker === 0xe1) found.add('XMP');
			else if (s.marker === 0xed) found.add('IPTC');
			else if (s.marker === 0xfe) found.add('comment');
			else if (s.marker === 0xe2) found.add('multi-picture data');
			else found.add(`APP${s.marker - 0xe0} block`);
		}
		if (trailing) found.add('data after the image');
	} else if (kind === 'png') {
		const { chunks, trailing } = pngChunks(b);
		for (const c of chunks) if (!keepPngChunk(c.type)) found.add(c.type === 'eXIf' ? 'EXIF' : c.type === 'iTXt' ? 'text/XMP' : c.type);
		if (trailing) found.add('data after the image');
	} else if (kind === 'webp') {
		for (const c of webpChunks(b)) if (WEBP_DROP.has(c.type)) found.add(c.type.trim());
	}
	return [...found];
}

/**
 * The same image without its metadata. Returns the input unchanged (same
 * object) when there is nothing to remove or the format is not handled.
 * Throws for a JPEG that relies on its EXIF orientation — see the top.
 */
export function stripMetadata(b: Uint8Array): Uint8Array {
	if (findMetadata(b).length === 0) return b;
	const kind = imageKind(b);

	if (kind === 'jpeg') {
		if (jpegOrientation(b) !== 1) {
			throw new Error('this JPEG is stored rotated (EXIF orientation); rotate it for real before stripping');
		}
		const { segments } = jpegSegments(b);
		const parts = [b.subarray(0, 2)]; // SOI
		for (const s of segments) if (keepJpegSegment(b, s)) parts.push(b.subarray(s.start, s.end));
		parts.push(new Uint8Array([0xff, 0xd9])); // EOI — and nothing after it
		return concat(parts);
	}

	if (kind === 'png') {
		const parts = [b.subarray(0, 8)];
		for (const c of pngChunks(b).chunks) if (keepPngChunk(c.type)) parts.push(b.subarray(c.start, c.end));
		return concat(parts);
	}

	if (kind === 'webp') {
		const kept = webpChunks(b).filter((c) => !WEBP_DROP.has(c.type));
		const body = concat(kept.map((c) => b.subarray(c.start, c.end)));
		const vp8x = kept.findIndex((c) => c.type === 'VP8X');
		if (vp8x !== -1) {
			// Clear the "has EXIF" (0x08) and "has XMP" (0x04) feature flags.
			const off = kept.slice(0, vp8x).reduce((n, c) => n + (c.end - c.start), 0) + 8;
			body[off] &= ~0x0c;
		}
		const head = new Uint8Array(12);
		head.set(b.subarray(0, 12));
		const size = body.length + 4;
		head[4] = size & 0xff;
		head[5] = (size >> 8) & 0xff;
		head[6] = (size >> 16) & 0xff;
		head[7] = (size >>> 24) & 0xff;
		return concat([head, body]);
	}

	return b;
}
