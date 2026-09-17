import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchBing } from '$lib/server/integrations/bing.ts';
import { fetchVisitors } from '$lib/server/integrations/litlyx.ts';

/**
 * A short read of what search is doing, for the home screen. Fetched after the
 * page renders so Bing — someone else's API, behind a disk cache — never
 * delays the screen you land on.
 */
export const GET: RequestHandler = async () => {
	const [r, v] = await Promise.all([fetchBing(), fetchVisitors()]);
	const visitors = {
		configured: v.configured,
		error: v.error,
		summary: v.data && {
			days: v.data.days,
			visits: v.data.visits,
			views: v.data.views,
			trend: v.data.trend,
			pages: v.data.pages.slice(0, 3)
		}
	};
	if (!r.data) return json({ configured: r.configured, error: r.error, summary: null, visitors });

	const recent = r.data.traffic.slice(-28);
	const half = Math.floor(recent.length / 2);
	const sum = (rows: typeof recent, k: 'clicks' | 'impressions') => rows.reduce((n, p) => n + p[k], 0);
	const older = sum(recent.slice(0, half), 'impressions');
	const newer = sum(recent.slice(half), 'impressions');

	return json({
		configured: true,
		error: null,
		summary: {
			days: recent.length,
			clicks: sum(recent, 'clicks'),
			impressions: sum(recent, 'impressions'),
			// Direction of travel over the window, which is what you actually read.
			trend: older === 0 ? null : Math.round(((newer - older) / older) * 100),
			queries: r.data.queries.slice(0, 4).map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions })),
			pages: r.data.pages.slice(0, 3).map((p) => ({ url: p.url, clicks: p.clicks, impressions: p.impressions })),
			stale: r.data.stale
		},
		visitors
	});
};
