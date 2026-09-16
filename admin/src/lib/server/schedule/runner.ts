import { store, audit } from '../store/kv.ts';
import { loadPost, savePost, LANGS } from '../content/post.ts';
import { fetchBuildInfo, recordPublish } from '../integrations/buildinfo.ts';
import { queueUrls, postUrls } from '../integrations/indexnow.ts';
import { sendBroadcast, isConfigured as canSend, SITE_NAME } from '../integrations/resend.ts';
import { integrations } from '../env.ts';
import { invalidate } from '../cache.ts';
import { dueToPublish, dueToAnnounce, prune, type Scheduled } from './plan.ts';

/**
 * Carries out scheduled publishing. Called by the scheduled trigger, and by
 * the portal whenever it happens to be open, so a missed cron only delays
 * things rather than losing them.
 *
 * Everything here is idempotent: each item's state moves forward one step at a
 * time and is written back before the next step, so a run that dies halfway
 * repeats at worst the step it was in.
 */

const KEY = 'state/scheduled';

export const readScheduled = async (): Promise<Scheduled[]> => (await store.get<Scheduled[]>(KEY)) ?? [];
export const writeScheduled = (items: Scheduled[]) => store.put(KEY, prune(items));

export async function schedule(entry: Scheduled): Promise<void> {
	const items = (await readScheduled()).filter((i) => !(i.slug === entry.slug && i.state === 'pending'));
	items.push(entry);
	await writeScheduled(items);
}

export async function cancel(slug: string): Promise<boolean> {
	const items = await readScheduled();
	const next = items.filter((i) => !(i.slug === slug && i.state === 'pending'));
	if (next.length === items.length) return false;
	await writeScheduled(next);
	return true;
}

export interface RunReport {
	published: string[];
	announced: string[];
	failed: { slug: string; error: string }[];
	waiting: number;
}

export async function runDue(now = new Date()): Promise<RunReport> {
	const items = await readScheduled();
	const report: RunReport = { published: [], announced: [], failed: [], waiting: 0 };

	for (const item of dueToPublish(items, now)) {
		item.tries = (item.tries ?? 0) + 1;
		try {
			const post = await loadPost(item.slug);
			if (!post) throw new Error('the article no longer exists');
			// Publishing is exactly what the editor's Publish does: draft: false,
			// every language written from what is on disk now.
			const { sha } = await savePost({
				shared: { ...post, draft: false },
				translations: post.translations,
				message: `Publish ${item.slug} (scheduled)`
			});
			item.state = 'published';
			item.publishedAt = new Date().toISOString();
			item.sha = sha;
			delete item.error;
			await recordPublish({ sha, at: item.publishedAt, slug: item.slug });
			await queueUrls(
				postUrls(
					item.slug,
					LANGS.filter((l) => post.translations[l].exists && !post.translations[l].untranslated)
				)
			);
			report.published.push(item.slug);
			await audit('scheduled-publish', { slug: item.slug, sha });
		} catch (e) {
			item.error = e instanceof Error ? e.message : String(e);
			report.failed.push({ slug: item.slug, error: item.error });
			await audit('scheduled-publish-failed', { slug: item.slug, error: item.error, tries: item.tries });
		}
		await writeScheduled(items);
	}

	// Announce only what the built site actually serves: a newsletter pointing
	// at a page StaticHost has not published yet is a link to a 404.
	const pendingAnnounce = items.filter((i) => i.state === 'published' && i.newsletter);
	if (pendingAnnounce.length > 0) {
		const info = await fetchBuildInfo(true);
		// The manifest only lists what the build produced, so being in it is
		// exactly what "live" means here.
		const live = (info?.posts ?? []).map((p) => p.slug);
		for (const item of dueToAnnounce(items, live)) {
			item.tries = (item.tries ?? 0) + 1;
			try {
				if (!canSend()) throw new Error('RESEND_API_KEY is not configured');
				const post = await loadPost(item.slug);
				if (!post) throw new Error('the article no longer exists');
				const title = post.translations.en.title;
				const r = await sendBroadcast({
					slug: item.slug,
					subject: title,
					title,
					intro: post.translations.en.description,
					url: `${integrations.siteUrl}/en/blog/${item.slug}/`,
					imageUrl: post.featured_image
						? `${integrations.siteUrl}/en/blog/${item.slug}/${post.featured_image}`
						: undefined,
					siteName: SITE_NAME,
					siteUrl: integrations.siteUrl
				});
				if (!r.ok) throw new Error(r.errors.join(' '));
				item.state = 'announced';
				item.announcedAt = new Date().toISOString();
				delete item.error;
				report.announced.push(item.slug);
				await audit('newsletter-sent', { slug: item.slug, subject: title, id: r.id, scheduled: true });
			} catch (e) {
				item.error = e instanceof Error ? e.message : String(e);
				report.failed.push({ slug: item.slug, error: item.error });
				await audit('scheduled-announce-failed', { slug: item.slug, error: item.error, tries: item.tries });
			}
			await writeScheduled(items);
		}
	}

	if (report.published.length || report.announced.length) invalidate('tasks:');
	report.waiting = (await readScheduled()).filter((i) => i.state === 'pending').length;
	return report;
}
