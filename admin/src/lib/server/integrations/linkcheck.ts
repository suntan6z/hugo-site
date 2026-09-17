import { store } from '../store/kv.ts';
import { integrations } from '../env.ts';
import { mapLimit, invalidate } from '../cache.ts';
import { listPosts, loadPost } from '../content/post.ts';
import { loadPage } from '../content/page.ts';
import { PAGES } from '../../pages.ts';
import { LANGS } from '../langs.ts';
import { externalLinks, classify, nextRecord, isDue, isDead, type LinkRecord } from '../seo/links.ts';

/**
 * Checks every outside link the site makes, from articles and pages alike,
 * and remembers the answers (see seo/links.ts for how they are judged).
 *
 * Runs weekly from the Scaleway trigger, or on demand from the home screen.
 * Nothing is fetched beyond the response headers where the site allows HEAD,
 * and every request says who is asking.
 */

const KEY = 'state/links';
const UA = 'loconsole-admin link check (+https://lorenzo.loconsole.eu)';

export interface LinkState {
	lastRun: string | null;
	links: Record<string, LinkRecord>;
}

export const readLinkState = async (): Promise<LinkState> =>
	(await store.get<LinkState>(KEY)) ?? { lastRun: null, links: {} };

/** Which links are dead now, with why. */
export async function deadLinks(now = new Date()): Promise<{ url: string; reason: string }[]> {
	const state = await readLinkState();
	return Object.values(state.links)
		.filter((r) => isDead(r, now))
		.map((r) => ({ url: r.url, reason: r.reason }));
}

/** Every outside link, from every language of every article and page. */
export async function gatherLinks(): Promise<string[]> {
	const found = new Set<string>();
	const posts = await mapLimit(await listPosts(), 6, (p) => loadPost(p.slug));
	for (const post of posts) {
		if (!post) continue;
		for (const l of LANGS) externalLinks(post.translations[l].body).forEach((u) => found.add(u));
		for (const u of [post.partner_url, post.project_url]) if (u && /^https?:\/\//.test(u)) found.add(u);
	}
	for (const { name } of PAGES) {
		const page = await loadPage(name);
		for (const l of LANGS) externalLinks(page[l].body).forEach((u) => found.add(u));
	}
	return [...found];
}

async function ask(url: string, method: 'HEAD' | 'GET'): Promise<number> {
	const r = await fetch(url, {
		method,
		redirect: 'follow',
		headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
		signal: AbortSignal.timeout(10_000)
	});
	// Only the status matters; do not download the page.
	await r.body?.cancel().catch(() => {});
	return r.status;
}

export async function checkUrl(url: string): Promise<{ code: number | null; error?: string }> {
	try {
		let code = await ask(url, 'HEAD');
		// Plenty of servers answer HEAD badly while serving GET fine.
		if (code === 403 || code === 404 || code === 405 || code === 501) code = await ask(url, 'GET');
		return { code };
	} catch (e) {
		const err = e as { name?: string; cause?: { code?: string } };
		return { code: null, error: err.cause?.code ?? err.name ?? 'error' };
	}
}

export interface LinkRun {
	skipped?: 'not-due';
	checked: number;
	dead: number;
}

export async function runLinkCheck(opts: { force?: boolean } = {}): Promise<LinkRun> {
	const now = new Date();
	const state = await readLinkState();
	if (!opts.force && !isDue(state.lastRun, now)) {
		return { skipped: 'not-due', checked: 0, dead: Object.values(state.links).filter((r) => isDead(r, now)).length };
	}

	let urls = await gatherLinks();
	// Tests only: never knock on real websites from a test run.
	if (integrations.linkCheckHosts) {
		const allowed = new Set(integrations.linkCheckHosts.split(',').map((h) => h.trim()));
		urls = urls.filter((u) => {
			try {
				return allowed.has(new URL(u).host);
			} catch {
				return false;
			}
		});
	}

	const results = await mapLimit(urls, 6, async (url) => ({ url, ...(await checkUrl(url)) }));
	// Links no longer on the site are forgotten, so the list cannot grow forever.
	const links: Record<string, LinkRecord> = {};
	for (const r of results) {
		links[r.url] = nextRecord(state.links[r.url], r.url, { ...classify(r.code, r.error), code: r.code }, now);
	}
	await store.put(KEY, { lastRun: now.toISOString(), links } satisfies LinkState);
	invalidate('tasks:');
	return { checked: urls.length, dead: Object.values(links).filter((r) => isDead(r, now)).length };
}
