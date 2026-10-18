import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runSpeed, rate, rateScore, ms } from '$lib/server/integrations/pagespeed.ts';
import { integrations } from '$lib/server/env.ts';

/**
 * A PageSpeed Insights run for one of the site's own published pages. Behind the
 * portal's sign-in, and limited to this site's addresses: each run spends Google's
 * quota and ties up a request for up to half a minute.
 */
export const GET: RequestHandler = async ({ url }) => {
	const target = url.searchParams.get('url') ?? '';
	if (!target.startsWith(`${integrations.siteUrl}/`) || target.length > 300) {
		return json({ ok: false, error: 'That is not a page of this site.' }, { status: 400 });
	}
	const { result, error, cachedAt } = await runSpeed(target);
	if (!result) return json({ ok: false, error }, { status: 502 });

	// Worked out here, where the thresholds live, so the page only has to draw it.
	const s = result.scores;
	return json({
		ok: true,
		cachedAt,
		scores: [
			{ label: 'Performance', value: s.performance, rating: rateScore(s.performance) },
			{ label: 'Accessibility', value: s.accessibility, rating: rateScore(s.accessibility) },
			{ label: 'SEO', value: s.seo, rating: rateScore(s.seo) },
			{ label: 'Best practices', value: s.bestPractices, rating: rateScore(s.bestPractices) }
		],
		vitals: [
			{ label: 'Largest content', hint: 'LCP: when the main content is on screen', text: ms(result.lab.lcpMs), rating: rate('lcpMs', result.lab.lcpMs) },
			{ label: 'Layout shift', hint: 'CLS: how much the page jumps while loading', text: result.lab.cls === null ? '–' : result.lab.cls.toFixed(3), rating: rate('cls', result.lab.cls) },
			{ label: 'Blocking time', hint: 'TBT: how long the page ignores taps while loading', text: ms(result.lab.tbtMs), rating: rate('tbtMs', result.lab.tbtMs) },
			{ label: 'First paint', hint: 'FCP: when anything first appears', text: ms(result.lab.fcpMs), rating: rate('fcpMs', result.lab.fcpMs) }
		],
		field: result.field
	});
};
