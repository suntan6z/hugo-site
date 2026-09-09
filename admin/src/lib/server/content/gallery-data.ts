/**
 * Serialisation for data/gallery_cities.json and data/gallery_photos.json.
 *
 * Both files are hand-maintained as column-aligned JSON: one record per line,
 * keys padded so values line up. JSON.stringify(x, null, 2) would explode each
 * record across five lines and turn every future edit into a large diff, so
 * this reproduces the house style instead — one line per record means changing
 * one caption shows up as a one-line diff.
 *
 * Free of SvelteKit imports so the test suite can drive it directly.
 */

export interface GalleryCity {
	name: string;
	slug: string;
	flag: string;
}

export interface GalleryPhoto {
	city: string;
	/** Language-independent published path, e.g. /gallery/paris/1.jpg */
	image_url: string;
	caption: string;
	alt_text: string;
}

/** The photo key used by layouts/index.html to look up an override. */
export const photoKey = (city: string, filename: string) => `/gallery/${city}/${filename}`;

const jsonString = (v: string) => JSON.stringify(v);

/**
 * Renders records as aligned single lines.
 *
 * Column widths are computed from the data, so the alignment stays consistent
 * as entries are added. Emoji are counted as the two UTF-16 code units they
 * occupy, matching how the existing file was aligned by eye in an editor.
 */
function writeAligned<T extends Record<string, string>>(rows: T[], keys: (keyof T)[]): string {
	if (rows.length === 0) return '[]\n';

	// Width of `"key": value` for every column except the last, which needs no pad.
	const widths = keys.map((k) =>
		Math.max(...rows.map((r) => `${jsonString(String(k))}: ${jsonString(r[k])},`.length))
	);

	const lines = rows.map((row, i) => {
		const parts = keys.map((k, ci) => {
			const last = ci === keys.length - 1;
			const frag = `${jsonString(String(k))}: ${jsonString(row[k])}${last ? '' : ','}`;
			return last ? frag : frag.padEnd(widths[ci] + 1);
		});
		return `  { ${parts.join('')} }${i === rows.length - 1 ? '' : ','}`;
	});

	return `[\n${lines.join('\n')}\n]\n`;
}

export function parseCities(raw: string | null): GalleryCity[] {
	if (!raw?.trim()) return [];
	return JSON.parse(raw) as GalleryCity[];
}

export function writeCities(cities: GalleryCity[]): string {
	return writeAligned(cities as unknown as Record<string, string>[], ['name', 'slug', 'flag']);
}

export function parsePhotos(raw: string | null): GalleryPhoto[] {
	if (!raw?.trim()) return [];
	return JSON.parse(raw) as GalleryPhoto[];
}

export function writePhotos(photos: GalleryPhoto[]): string {
	return writeAligned(photos as unknown as Record<string, string>[], [
		'city',
		'image_url',
		'caption',
		'alt_text'
	]);
}

/** `Câmara de Lobos` -> `camara-de-lobos` */
export function slugifyCity(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Display order comes from the numeric prefix of each filename
 * (layouts/index.html sorts on it), so reordering means renumbering.
 * Returns the renames needed to make `ordered` the on-disk order.
 */
export function renumber(
	ordered: string[]
): { from: string; to: string }[] {
	const ext = (f: string) => f.slice(f.lastIndexOf('.'));
	const target = ordered.map((f, i) => ({ from: f, to: `${i + 1}${ext(f)}` }));
	return target.filter((m) => m.from !== m.to);
}

/** Next free numeric prefixes for newly uploaded files. */
export function nextNumbers(existing: string[], count: number): number[] {
	const used = existing
		.map((f) => parseInt(/^\d+/.exec(f)?.[0] ?? '', 10))
		.filter((n) => Number.isFinite(n));
	let next = (used.length ? Math.max(...used) : 0) + 1;
	return Array.from({ length: count }, () => next++);
}

/**
 * The front matter every gallery city bundle carries, in all three languages.
 * `render: never` / `list: never` stops Hugo generating a page or listing the
 * bundle anywhere, while still publishing its photos as page resources.
 *
 * The stubs are byte-identical across languages: photos and the data files are
 * language-neutral. They must nonetheless exist per language, because
 * layouts/index.html resolves each city through the *current* language's site.
 */
export function cityStub(name: string): string {
	return `---\ntitle: ${JSON.stringify(name)}\nbuild:\n  render: never\n  list: never\n---\n`;
}
