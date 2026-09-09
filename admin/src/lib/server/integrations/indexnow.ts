import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';

/**
 * IndexNow tells Bing (and other participating engines) that a URL changed,
 * instead of waiting to be crawled.
 *
 * Submission is deliberately NOT fired on publish: at that moment StaticHost
 * has not rebuilt yet, so the URL would still 404 and the submission would be
 * wasted or counted against the host. URLs are queued instead, and submitted
 * once the dashboard sees the deploy go live.
 */

const QUEUE_KEY = 'state/indexnow-queue';

export interface QueuedUrl {
	url: string;
	queuedAt: string;
}

export const keyFileUrl = () => `${integrations.siteUrl}/${integrations.indexNowKey}.txt`;

export async function queueUrls(urls: string[]): Promise<void> {
	if (!integrations.indexNowKey) return;
	const existing = (await store.get<QueuedUrl[]>(QUEUE_KEY)) ?? [];
	const byUrl = new Map(existing.map((q) => [q.url, q]));
	for (const url of urls) byUrl.set(url, { url, queuedAt: new Date().toISOString() });
	await store.put(QUEUE_KEY, [...byUrl.values()]);
}

export async function readQueue(): Promise<QueuedUrl[]> {
	return (await store.get<QueuedUrl[]>(QUEUE_KEY)) ?? [];
}

export async function clearQueue(): Promise<void> {
	await store.put(QUEUE_KEY, []);
}

/** All language variants of a blog post, which are separate indexable URLs. */
export function postUrls(slug: string, langs: string[]): string[] {
	return langs.map((l) => `${integrations.siteUrl}/${l}/blog/${slug}/`);
}

export interface SubmitResult {
	ok: boolean;
	status: number;
	submitted: number;
	detail: string;
}

export async function submitQueued(): Promise<SubmitResult> {
	const key = integrations.indexNowKey;
	if (!key) return { ok: false, status: 0, submitted: 0, detail: 'INDEXNOW_KEY is not configured.' };

	const queue = await readQueue();
	if (queue.length === 0) return { ok: true, status: 200, submitted: 0, detail: 'Nothing queued.' };

	const host = new URL(integrations.siteUrl).host;
	const r = await fetch('https://api.indexnow.org/indexnow', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		body: JSON.stringify({
			host,
			key,
			keyLocation: keyFileUrl(),
			urlList: queue.map((q) => q.url)
		}),
		signal: AbortSignal.timeout(10_000)
	});

	// 200 accepted, 202 accepted pending key validation. Anything else keeps the
	// queue so nothing is lost.
	const ok = r.status === 200 || r.status === 202;
	if (ok) await clearQueue();
	return {
		ok,
		status: r.status,
		submitted: ok ? queue.length : 0,
		detail: ok
			? `Submitted ${queue.length} URL${queue.length === 1 ? '' : 's'} (HTTP ${r.status}).`
			: `IndexNow returned ${r.status}. The queue was kept. ${(await r.text()).slice(0, 200)}`
	};
}
