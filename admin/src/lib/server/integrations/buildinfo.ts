import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';

/**
 * Reads the content inventory the live site publishes at /en/build-info.json
 * (see layouts/index.buildinfo.json) to answer "has what I pushed actually gone
 * live?".
 *
 * StaticHost exposes no build API, and a git SHA is not usable here — .GitInfo
 * needs a full clone, and StaticHost's clone depth is outside this repo's
 * control. Comparing published content against what we last committed answers
 * the real question without either.
 */

export type {
	BuildInfo,
	BuildInfoPost,
	LastPublish,
	DeployState,
	DeployStatus
} from './deploy-state.ts';
import type { BuildInfo, LastPublish } from './deploy-state.ts';
export { deployStatus } from './deploy-state.ts';

const LAST_PUBLISH_KEY = 'state/last-publish';
const CACHE_MS = 30_000;
const TIMEOUT_MS = 6_000;

let cache: { at: number; value: BuildInfo | null } | null = null;

export async function recordPublish(p: LastPublish): Promise<void> {
	await store.put(LAST_PUBLISH_KEY, p);
}

export async function readLastPublish(): Promise<LastPublish | null> {
	return store.get<LastPublish>(LAST_PUBLISH_KEY);
}

/** null when the site is unreachable or hasn't deployed the manifest yet. */
export async function fetchBuildInfo(force = false): Promise<BuildInfo | null> {
	if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

	let value: BuildInfo | null = null;
	try {
		const r = await fetch(`${integrations.siteUrl}/en/build-info.json`, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { 'Cache-Control': 'no-cache' }
		});
		if (r.ok) {
			const parsed = (await r.json()) as BuildInfo;
			// Guard against a stale deploy serving something else at this path.
			if (parsed && Array.isArray(parsed.posts) && typeof parsed.builtAt === 'string') {
				value = parsed;
			}
		}
	} catch {
		value = null;
	}
	cache = { at: Date.now(), value };
	return value;
}
