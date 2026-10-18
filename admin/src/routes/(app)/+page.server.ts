import type { PageServerLoad } from './$types';
import { fetchBuildInfo, readLastPublish, deployStatus } from '$lib/server/integrations/buildinfo.ts';
import { listPosts } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { readQueue, submitQueued } from '$lib/server/integrations/indexnow.ts';
import { audit } from '$lib/server/store/kv.ts';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { openTasks } from '$lib/server/tasks/corpus.ts';
import { readSession } from '$lib/server/tasks/session.ts';
import { readLinkState, runLinkCheck } from '$lib/server/integrations/linkcheck.ts';
import { readScheduled } from '$lib/server/schedule/runner.ts';
import { readHealth, runHealth, certNotices } from '$lib/server/integrations/uptime.ts';

const LANGS = ['en', 'fr', 'it'] as const;

export const load: PageServerLoad = async ({ url }) => {
	const [info, last, posts, indexNowQueue, tasks, session, links, scheduled, health] = await Promise.all([
		fetchBuildInfo(url.searchParams.has('refresh')),
		readLastPublish(),
		listPosts(),
		readQueue(),
		openTasks(),
		readSession(),
		readLinkState(),
		readScheduled(),
		readHealth()
	]);

	const status = deployStatus(info, last);

	/**
	 * Counts come from the published manifest when it is available, because it
	 * distinguishes a real translation from an `untranslated` placeholder — the
	 * repo file listing alone cannot. Falls back to the repo when the site is
	 * unreachable, which over-counts translations but is better than nothing.
	 */
	const translationDebt = info
		? info.posts.flatMap((p) =>
				LANGS.filter((l) => !p.langs.includes(l)).map((l) => ({ slug: p.slug, lang: l }))
			)
		: posts.flatMap((p) =>
				LANGS.filter((l) => !p.langs.includes(l)).map((l) => ({ slug: p.slug, lang: l }))
			);

	// Who has which language, from the same source as the debt above.
	const rows = (info ? info.posts : posts.filter((p) => !p.draft)).slice().sort((a, b) => b.date.localeCompare(a.date));
	const coverage = {
		total: rows.length,
		langs: Object.fromEntries(LANGS.map((l) => [l, rows.filter((r) => r.langs.includes(l)).length]))
	};

	return {
		posts: posts.slice(0, 8),
		coverage,
		grid: rows.map((r) => ({ slug: r.slug, title: r.title, langs: r.langs as string[] })).slice(0, 6),
		schedule: {
			waiting: scheduled.filter((i) => i.state === 'pending').length,
			newsletters: scheduled.filter((i) => i.state === 'published' && i.newsletter && !!i.announceAt && !i.announcedAt).length,
			failed: scheduled.filter((i) => i.state === 'failed').map((i) => ({ slug: i.slug, error: i.error ?? '' }))
		},
		// The home screen shows the shape of the queue; focus mode works it.
		tasks: {
			total: tasks.length,
			pending: session.edits.length,
			byKind: Object.entries(
				tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {})
			).sort((a, b) => b[1] - a[1]),
			next: tasks.slice(0, 3).map((t) => ({ title: t.title, where: t.where }))
		},
		tidied: Number(url.searchParams.get('tidied') ?? 0) || 0,
		status,
		siteUrl: integrations.siteUrl,
		indexNow: {
			configured: !!integrations.indexNowKey,
			queued: indexNowQueue.map((q) => q.url)
		},
		fromManifest: !!info,
		links: { lastRun: links.lastRun, count: Object.keys(links.links).length },
		// The daily health check: what was seen at the last look, and what is worth a mention.
		health: {
			at: health.last?.at ?? null,
			total: health.last?.checks.length ?? 0,
			problems: (health.last?.checks ?? []).filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })),
			notices: health.last ? certNotices(health.last).map((c) => ({ name: c.name, detail: c.detail })) : [],
			alerts: !!integrations.alertEmail
		},
		stats: {
			total: posts.length,
			drafts: posts.filter((p) => p.draft).length,
			translationDebt
		}
	};
};

export const actions: Actions = {
	/** Checks every outside link now rather than waiting for the weekly run. */
	checklinks: async () => {
		const r = await runLinkCheck({ force: true });
		await audit('link-check', { checked: r.checked, dead: r.dead });
		return {
			linksChecked: r.dead === 0
				? `Checked ${r.checked} links. None is confirmed dead.`
				: `Checked ${r.checked} links. ${r.dead} no longer work — they are in Worth doing.`
		};
	},

	/** Looks at the site's health now rather than at the next morning's run. */
	checkhealth: async () => {
		const { report, alerted } = await runHealth({ force: true });
		const bad = report?.checks.filter((c) => !c.ok).length ?? 0;
		await audit('health-check', { problems: bad, alerted });
		return { healthChecked: bad === 0 ? 'Everything answered, and no certificate is close to its end.' : `${bad} thing${bad === 1 ? '' : 's'} to look at.` };
	},

	indexnow: async () => {
		const r = await submitQueued();
		await audit('indexnow-submit', { ok: r.ok, status: r.status, submitted: r.submitted });
		return r.ok ? { indexNow: r.detail } : fail(502, { message: r.detail });
	}
};
