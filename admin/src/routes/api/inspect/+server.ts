import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inspectUrl, isConfigured, verdictLabel } from '$lib/server/integrations/gsc.ts';
import { integrations } from '$lib/server/env.ts';

/**
 * Whether one of the site's own pages is in Google's index. Behind the portal's
 * sign-in like everything else, and limited to this site's addresses: Google counts
 * each question against a daily quota, and the portal has no business asking about
 * other people's pages.
 */
export const GET: RequestHandler = async ({ url }) => {
	if (!isConfigured()) return json({ ok: false, error: 'Google Search Console is not connected.' }, { status: 400 });
	const target = url.searchParams.get('url') ?? '';
	if (!target.startsWith(`${integrations.siteUrl}/`) || target.length > 300) {
		return json({ ok: false, error: 'That is not a page of this site.' }, { status: 400 });
	}
	const { inspection, error } = await inspectUrl(target);
	if (error) return json({ ok: false, error }, { status: 502 });
	if (!inspection) return json({ ok: true, label: 'No answer', tone: 'plain', detail: 'Google returned nothing for this page yet.' });
	const v = verdictLabel(inspection.verdict);
	return json({
		ok: true,
		label: v.text,
		tone: v.tone,
		// Google's own sentence, and when it last looked.
		detail: [inspection.coverage, inspection.lastCrawl ? `last crawled ${inspection.lastCrawl}` : ''].filter(Boolean).join(' · '),
		canonical: inspection.googleCanonical && inspection.googleCanonical !== target ? inspection.googleCanonical : null
	});
};
