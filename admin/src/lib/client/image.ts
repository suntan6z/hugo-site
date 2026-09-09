/**
 * Client-side image preparation.
 *
 * Resizing here is mandatory, not an optimisation: the site's image render hook
 * (layouts/_default/_markup/render-image.html) resolves bundle images as page
 * resources but never calls .Resize, so whatever pixels are committed are the
 * pixels served.
 *
 * (Bundle resources are published once, under /en/ — verified against a real
 * build: /en is 381 MB while /fr and /it are ~2.8 MB each. The other languages
 * link back to the /en/ copies rather than duplicating them.)
 */

/** Long edge in px. The article column is ~800px, so this covers 2x DPR. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedImage {
	name: string;
	blob: Blob;
	width: number;
	height: number;
	previewUrl: string;
	originalBytes: number;
}

export class ImageError extends Error {}

/** `My Photo (2).JPEG` -> `my-photo-2` */
export function slugifyFilename(name: string): string {
	return (
		name
			.replace(/\.[^.]+$/, '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'image'
	);
}

/** Appends -2, -3 … until the name is free within the bundle. */
export function uniqueName(base: string, ext: string, taken: string[]): string {
	let name = `${base}.${ext}`;
	let n = 2;
	while (taken.includes(name)) name = `${base}-${n++}.${ext}`;
	return name;
}

export async function prepareImage(file: File, taken: string[] = []): Promise<PreparedImage> {
	// HEIC decodes only in Safari; createImageBitmap throws elsewhere with a
	// message that explains nothing. Catch it up front.
	if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
		throw new ImageError(
			`${file.name} is HEIC. Export it as JPEG or PNG first — browsers can't decode HEIC reliably.`
		);
	}
	if (!/^image\//.test(file.type)) {
		throw new ImageError(`${file.name} is not an image.`);
	}

	// imageOrientation:'from-image' applies the EXIF rotation; without it,
	// phone photos land sideways.
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		throw new ImageError(`Could not decode ${file.name}.`);
	}

	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new ImageError('Canvas is unavailable in this browser.');
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	// Re-encoding through canvas also strips all EXIF, including GPS
	// coordinates — worth keeping in mind as a feature for travel photos.
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/webp', QUALITY)
	);
	if (!blob) throw new ImageError(`Could not encode ${file.name} as WebP.`);

	return {
		name: uniqueName(slugifyFilename(file.name), 'webp', taken),
		blob,
		width,
		height,
		previewUrl: URL.createObjectURL(blob),
		originalBytes: file.size
	};
}

export const formatBytes = (n: number) =>
	n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
