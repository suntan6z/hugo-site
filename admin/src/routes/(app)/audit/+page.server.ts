import type { PageServerLoad } from './$types';
import { store } from '$lib/server/store/kv.ts';
import { mapLimit } from '$lib/server/cache.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { GROUPS, groupOf, type Group } from '$lib/activity.ts';

/**
 * The full audit trail. Settings shows the last handful; this is the page you
 * want on the day something looks wrong — every sign-in, commit, broadcast and
 * translation, filterable, oldest entry included.
 *
 * Keys are ISO timestamps, so listing them is already chronological: only the
 * page being shown is actually fetched.
 */
const PAGE = 40;

export interface AuditEntry {
	at: string;
	event: string;
	[k: string]: unknown;
}

export const load: PageServerLoad = async ({ url }) => {
	const keys = (await store.list('audit')).reverse(); // newest first
	const asked = url.searchParams.get('group') ?? '';
	const group: Group | '' = GROUPS.some((g) => g.id === asked) ? (asked as Group) : '';
	const page = Math.max(0, Number(url.searchParams.get('p') ?? 0) || 0);

	// Filtering by event has to look inside the objects, so it reads a wider
	// window rather than the whole trail.
	const window = group ? keys.slice(0, Math.max(PAGE * 10, (page + 1) * PAGE * 4)) : keys;
	const slice = group ? window : window.slice(page * PAGE, (page + 1) * PAGE);

	const loaded = (await mapLimit(slice, 8, (k) => store.get<AuditEntry>(k))).filter(
		(e): e is AuditEntry => !!e?.event
	);
	const filtered = group ? loaded.filter((e) => groupOf(e.event) === group) : loaded;
	const shown = group ? filtered.slice(page * PAGE, (page + 1) * PAGE) : filtered;

	// Articles are named by title in the sentences, not by address.
	const titles = Object.fromEntries((await listPosts().catch(() => [])).map((p) => [p.slug, p.title]));

	return {
		entries: shown,
		page,
		hasMore: group ? filtered.length > (page + 1) * PAGE : keys.length > (page + 1) * PAGE,
		total: keys.length,
		group,
		titles
	};
};
