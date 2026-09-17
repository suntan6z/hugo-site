/**
 * The two site files the portal replaces whole: the homepage photo and the CV.
 *
 * Both are checked by their first bytes, not by the name or type the browser
 * claims, since either can say anything. The photo arrives already resized
 * and encoded by the browser (lib/client/image.ts); the site's templates read
 * it through Hugo Pipes, which is why it lives in assets/ rather than static/.
 *
 * Free of I/O so the suite can drive it directly.
 */

export const HERO_WEBP = 'assets/img/hero.webp';
export const HERO_JPEG = 'assets/img/hero.jpeg';

export const MAX_HERO_BYTES = 4 * 1024 * 1024;
export const MAX_RESUME_BYTES = 8 * 1024 * 1024;

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export const isJpeg = (b: Uint8Array) => starts(b, [0xff, 0xd8, 0xff]);
/** RIFF....WEBP */
export const isWebp = (b: Uint8Array) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8);
/** %PDF- */
export const isPdf = (b: Uint8Array) => starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Where the CV lives in the repo, from the resumeUrl the homepage links to.
 * Only a PDF at the site root can be replaced: anything else (an external
 * link, a nested path) is not a file this portal should be writing.
 */
export function resumePath(resumeUrl: string): string | null {
	return /^\/[A-Za-z0-9._-]+\.pdf$/.test(resumeUrl) ? `static${resumeUrl}` : null;
}
