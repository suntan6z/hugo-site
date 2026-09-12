import { listPosts, loadPost, bundleDir } from '../content/post.ts';
import { repo } from '../content/repo.ts';
import { parseCities, parsePhotos, photoKey } from '../content/gallery-data.ts';
import { mapLimit, memo } from '../cache.ts';
import { LANGS } from '../langs.ts';
import { findTasks, type Corpus, type Task } from './find.ts';
import { readSnoozed, readSession } from './session.ts';

/**
 * Gathers what the task list needs: every article in every language, every
 * gallery photo, and when the Now page last moved.
 *
 * Memoised, because this reads the whole corpus and the home screen is the
 * page you land on most.
 */
const TTL_MS = 3 * 60_000;
const NOW_PAGE = 'content/now.md';

async function gather(): Promise<Corpus> {
	const summaries = await listPosts();
	const posts = (await mapLimit(summaries, 6, (s) => loadPost(s.slug)))
		.filter((p): p is NonNullable<typeof p> => !!p)
		.map((p) => ({
			slug: p.slug,
			title: p.translations.en.title || p.slug,
			draft: p.draft,
			date: p.date,
			featured_image: p.featured_image,
			images: p.images,
			partner_logo_url: p.partner_logo_url,
			translations: Object.fromEntries(
				LANGS.map((l) => [
					l,
					{
						exists: p.translations[l].exists,
						title: p.translations[l].title,
						description: p.translations[l].description,
						body: p.translations[l].body,
						untranslated: p.translations[l].untranslated
					}
				])
			) as Corpus['posts'][number]['translations']
		}));

	const cities = parseCities(await repo.readText('data/gallery_cities.json'));
	const overrides = parsePhotos(await repo.readText('data/gallery_photos.json'));
	const alt = new Map(overrides.map((o) => [o.image_url, o.alt_text]));
	const photos = (
		await mapLimit(cities, 4, async (c) => {
			const files = (await repo.listTree(`content/gallery/${c.slug}`))
				.map((p) => p.split('/').pop() as string)
				.filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
			return files.map((file) => ({
				city: c.slug,
				cityName: c.name,
				file,
				alt: alt.get(photoKey(c.slug, file)) ?? ''
			}));
		})
	).flat();

	return { posts, photos, nowUpdated: await repo.lastModified(NOW_PAGE) };
}

export const readCorpus = () => memo('tasks:corpus', TTL_MS, gather);

/** The queue as the home screen and focus mode see it: snoozed and finished removed. */
export async function openTasks(): Promise<Task[]> {
	const [corpus, snoozed, session] = await Promise.all([readCorpus(), readSnoozed(), readSession()]);
	const done = new Set(session.done);
	return findTasks(corpus, snoozed).filter((t) => !done.has(t.id));
}

export const bundlePath = (slug: string) => bundleDir(slug);
