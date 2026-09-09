import { repo, type FileOp } from './repo.ts';
import { LANGS, type Lang } from './post.ts';
import {
	parseCities, writeCities, parsePhotos, writePhotos,
	photoKey, renumber, nextNumbers, cityStub,
	type GalleryCity, type GalleryPhoto
} from './gallery-data.ts';

export type { GalleryCity, GalleryPhoto };

const CITIES_JSON = 'data/gallery_cities.json';
const PHOTOS_JSON = 'data/gallery_photos.json';
const cityDir = (slug: string) => `content/gallery/${slug}`;
const cityFile = (slug: string, lang: Lang) =>
	`${cityDir(slug)}/${lang === 'en' ? 'index.md' : `index.${lang}.md`}`;

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

export interface CityPhoto {
	filename: string;
	url: string;
	key: string;
	caption: string;
	altText: string;
}

export interface CityDetail extends GalleryCity {
	photos: CityPhoto[];
}

export async function listCities(): Promise<(GalleryCity & { photos: number })[]> {
	const cities = parseCities(await repo.readText(CITIES_JSON));
	const out: (GalleryCity & { photos: number })[] = [];
	for (const c of cities) {
		const files = await repo.listTree(cityDir(c.slug));
		out.push({ ...c, photos: files.filter((f) => IMAGE_RE.test(f)).length });
	}
	return out;
}

const numericOrder = (a: string, b: string) => {
	const n = (f: string) => parseInt(/^\d+/.exec(f)?.[0] ?? '', 10);
	const [x, y] = [n(a), n(b)];
	if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
	return a.localeCompare(b);
};

export async function loadCity(slug: string): Promise<CityDetail | null> {
	const city = parseCities(await repo.readText(CITIES_JSON)).find((c) => c.slug === slug);
	if (!city) return null;

	const overrides = new Map(
		parsePhotos(await repo.readText(PHOTOS_JSON)).map((p) => [p.image_url, p])
	);

	const files = (await repo.listTree(cityDir(slug)))
		.map((p) => p.split('/').pop()!)
		.filter((f) => IMAGE_RE.test(f))
		.sort(numericOrder);

	return {
		...city,
		photos: files.map((filename) => {
			const key = photoKey(slug, filename);
			const o = overrides.get(key);
			return {
				filename,
				key,
				url: `/api/gallery-image/${slug}/${filename}`,
				caption: o?.caption ?? '',
				altText: o?.alt_text ?? ''
			};
		})
	};
}

/** Rewrites gallery_photos.json, dropping entries with nothing to override. */
function mergePhotos(existing: GalleryPhoto[], changes: GalleryPhoto[]): GalleryPhoto[] {
	const byKey = new Map(existing.map((p) => [p.image_url, p]));
	for (const c of changes) {
		if (!c.caption && !c.alt_text) byKey.delete(c.image_url);
		else byKey.set(c.image_url, c);
	}
	return [...byKey.values()];
}

export interface SaveCityInput {
	slug: string;
	/** Final display order, by current filename. */
	order: string[];
	captions: { filename: string; caption: string; altText: string }[];
	newImages?: { bytes: Uint8Array; ext: string }[];
	deleteFilenames?: string[];
	message: string;
}

/** Applies uploads, deletions, reordering and caption edits as ONE commit. */
export async function saveCity(input: SaveCityInput): Promise<{ sha: string }> {
	const { slug } = input;
	const ops: FileOp[] = [];

	const deleted = new Set(input.deleteFilenames ?? []);
	for (const f of deleted) ops.push({ path: `${cityDir(slug)}/${f}`, delete: true });

	// Uploads are appended after the surviving photos, then the whole list is
	// renumbered so display order matches the numeric prefixes.
	const kept = input.order.filter((f) => !deleted.has(f));
	const incoming = input.newImages ?? [];
	const numbers = nextNumbers(kept, incoming.length);
	const added = incoming.map((img, i) => ({ bytes: img.bytes, name: `${numbers[i]}.${img.ext}` }));
	for (const a of added) ops.push({ path: `${cityDir(slug)}/${a.name}`, bytes: a.bytes });

	const finalOrder = [...kept, ...added.map((a) => a.name)];
	const moves = renumber(finalOrder);
	// A file just uploaded under its final number needs no move; one uploaded
	// then renumbered is rewritten rather than moved, since its blob is new.
	const addedNames = new Set(added.map((a) => a.name));
	for (const m of moves) {
		if (addedNames.has(m.from)) {
			const a = added.find((x) => x.name === m.from)!;
			ops.push({ path: `${cityDir(slug)}/${m.to}`, bytes: a.bytes });
			ops.push({ path: `${cityDir(slug)}/${m.from}`, delete: true });
		} else {
			ops.push({ path: `${cityDir(slug)}/${m.to}`, moveFrom: `${cityDir(slug)}/${m.from}` });
		}
	}

	// Captions are keyed by published path, so a renumbered photo carries its
	// caption to the new name rather than silently losing it.
	const renamed = new Map(moves.map((m) => [m.from, m.to]));
	const finalName = (f: string) => renamed.get(f) ?? f;

	const changes: GalleryPhoto[] = input.captions
		.filter((c) => !deleted.has(c.filename))
		.map((c) => ({
			city: slug,
			image_url: photoKey(slug, finalName(c.filename)),
			caption: c.caption.trim(),
			alt_text: c.altText.trim()
		}));

	let photos = parsePhotos(await repo.readText(PHOTOS_JSON));
	// Drop every entry for names that moved or vanished, then re-add the survivors
	// under their final names.
	const stale = new Set([
		...[...deleted].map((f) => photoKey(slug, f)),
		...moves.map((m) => photoKey(slug, m.from))
	]);
	photos = photos.filter((p) => !stale.has(p.image_url));
	photos = mergePhotos(photos, changes);

	ops.push({ path: PHOTOS_JSON, content: writePhotos(photos) });
	return repo.commit(input.message, ops);
}

export async function addCity(name: string, slug: string, flag: string): Promise<{ sha: string }> {
	const cities = parseCities(await repo.readText(CITIES_JSON));
	if (cities.some((c) => c.slug === slug)) throw new Error(`City "${slug}" already exists.`);

	const ops: FileOp[] = LANGS.map((lang) => ({
		path: cityFile(slug, lang),
		content: cityStub(name)
	}));
	ops.push({ path: CITIES_JSON, content: writeCities([...cities, { name, slug, flag }]) });
	return repo.commit(`Add gallery city ${slug}`, ops);
}

export async function removeCity(slug: string): Promise<{ sha: string }> {
	const cities = parseCities(await repo.readText(CITIES_JSON));
	const photos = parsePhotos(await repo.readText(PHOTOS_JSON));

	const ops: FileOp[] = (await repo.listTree(cityDir(slug))).map((path) => ({
		path,
		delete: true as const
	}));
	ops.push({ path: CITIES_JSON, content: writeCities(cities.filter((c) => c.slug !== slug)) });
	ops.push({ path: PHOTOS_JSON, content: writePhotos(photos.filter((p) => p.city !== slug)) });
	return repo.commit(`Remove gallery city ${slug}`, ops);
}
