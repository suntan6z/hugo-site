import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchBing } from '$lib/server/integrations/bing.ts';
import { fetchVisitors, fetchLive } from '$lib/server/integrations/litlyx.ts';
import { isConfigured as resendConfigured, listSubscribers } from '$lib/server/integrations/resend.ts';

/**
 * A short read of what search is doing, for the home screen. Fetched after the
 * page renders so Bing — someone else's API, behind a disk cache — never
 * delays the screen you land on.
 */
export const GET: RequestHandler = async () => {
	const [r, v, subscribers, live] = await Promise.all([fetchBing(), fetchVisitors(), audience(), fetchLive()]);
	const visitors = {
		configured: v.configured,
		error: v.error,
		summary: v.data && {
			days: v.data.days,
			visits: v.data.visits,
			views: v.data.views,
			trend: v.data.trend,
			pages: v.data.pages.slice(0, 3),
			series: v.data.daily.map((d) => d.visits)
		},
		live
	};
	if (!r.data) return json({ configured: r.configured, error: r.error, summary: null, visitors, subscribers });

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
			stale: r.data.stale,
			series: recent.map((p) => p.impressions)
		},
		visitors,
		subscribers
	});
};

/**
 * How many people are on the list and how it has grown over a month, as one
 * cumulative figure per day for a sparkline. Resend is someone else's API, so a
 * failure is a missing card, never a broken home screen.
 */
async function audience() {
	if (!resendConfigured()) return null;
	try {
		const all = (await listSubscribers()).filter((s) => !s.unsubscribed);
		const DAY = 86_400_000;
		const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
		const joined = all.map((s) => Date.parse(s.createdAt.replace(' ', 'T')) || 0);
		const series = Array.from({ length: 30 }, (_, i) => {
			const end = today - (29 - i) * DAY + DAY;
			return joined.filter((t) => t < end).length;
		});
		return { total: all.length, newThisMonth: joined.filter((t) => t >= today - 29 * DAY).length, series };
	} catch {
		return null;
	}
}
