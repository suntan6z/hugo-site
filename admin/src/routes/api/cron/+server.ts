import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { runDue } from '$lib/server/schedule/runner.ts';
import { runLinkCheck } from '$lib/server/integrations/linkcheck.ts';
import { auth, IS_LOCAL } from '$lib/server/env.ts';

/**
 * The one route that answers without a session, because a scheduler cannot
 * hold a passkey. It is gated on a bearer token and does nothing a caller can
 * steer: no parameters, no body — it only carries out work already scheduled
 * from inside the portal.
 *
 * A wrong or missing token gets 404, not 401: an unauthenticated caller learns
 * nothing about whether this route exists. Same reasoning as /enroll.
 */
const constantTimeEqual = (a: string, b: string) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	// timingSafeEqual throws on length mismatch, which would itself leak length.
	return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const POST: RequestHandler = async ({ request }) => {
	const token = auth.cronToken;
	const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	if (!token || !given || !constantTimeEqual(given, token)) error(404, 'Not found');

	const report = await runDue();
	// The same trigger also checks outside links, once a week. Not in local mode:
	// there is no trigger there, and a test run must never knock on real websites.
	const links = IS_LOCAL ? null : await runLinkCheck().catch(() => null);
	return json({ ...report, links }, { headers: { 'Cache-Control': 'no-store' } });
};
