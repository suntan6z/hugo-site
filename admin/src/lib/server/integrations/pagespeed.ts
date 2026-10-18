import { createHash } from 'node:crypto';
import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';
import { parseSpeed, type SpeedResult } from './pagespeed-parse.ts';

export * from './pagespeed-parse.ts';

/**
 * Google PageSpeed Insights, on demand for one public page.
 *
 * It tests the live site from Google's servers, so it can only look at what is
 * published; a draft has no address to test. A run takes 10 to 30 seconds, hence
 * the button rather than anything automatic, and its answer is kept for a day.
 * Works without a key at a low daily quota (PAGESPEED_API_KEY lifts it).
 */

const API = () => `${integrations.pagespeedApiUrl || 'https://www.googleapis.com'}/pagespeedonline/v5/runPagespeed`;
const TTL_MS = 24 * 60 * 60_000;

interface Cached {
	at: string;
	value: SpeedResult;
}

export async function runSpeed(url: string): Promise<{ result: SpeedResult | null; error: string | null; cachedAt: string | null }> {
	const diskKey = `cache/pagespeed-${createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
	const hit = await store.get<Cached>(diskKey);
	if (hit && Date.now() - Date.parse(hit.at) < TTL_MS) return { result: hit.value, error: null, cachedAt: hit.at };

	const q = new URLSearchParams({ url, strategy: 'mobile' });
	for (const c of ['performance', 'accessibility', 'seo', 'best-practices']) q.append('category', c);
	if (integrations.pagespeedApiKey) q.set('key', integrations.pagespeedApiKey);

	try {
		const r = await fetch(`${API()}?${q}`, { signal: AbortSignal.timeout(90_000) });
		const body = await r.json().catch(() => null);
		if (!r.ok) {
			const reason = String((body as { error?: { message?: unknown } } | null)?.error?.message ?? '');
			if (r.status === 429) return { result: null, error: 'Google’s PageSpeed quota is used up for now. A key (PAGESPEED_API_KEY) lifts it; otherwise try again later.', cachedAt: null };
			return { result: null, error: `PageSpeed answered HTTP ${r.status}${reason ? `: ${reason}` : ''}.`, cachedAt: null };
		}
		const result = parseSpeed(body);
		if (!result) return { result: null, error: 'PageSpeed gave no result for this page.', cachedAt: null };
		const at = new Date().toISOString();
		await store.put(diskKey, { at, value: result } satisfies Cached);
		return { result, error: null, cachedAt: at };
	} catch (e) {
		// A stale answer beats none.
		if (hit) return { result: hit.value, error: null, cachedAt: hit.at };
		return { result: null, error: e instanceof Error && e.name === 'TimeoutError' ? 'PageSpeed took too long. Try again in a minute.' : 'PageSpeed could not be reached.', cachedAt: null };
	}
}
