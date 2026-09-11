import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clientAddress } from '$lib/server/auth/client-address.ts';

/**
 * Shows the caller what the server sees of their connection: the resolved
 * client address and the proxy headers it was derived from. Used to confirm
 * the audit log and the sign-in rate limit key off the real visitor rather
 * than one of Scaleway's internal proxy hops.
 *
 * Signed-in only (deny-by-default in hooks), and it only ever reflects the
 * caller's own request back to them.
 */
export const GET: RequestHandler = async (event) => {
	const { request } = event;
	const pick = (h: string) => request.headers.get(h);
	return json(
		{
			resolved: clientAddress(event),
			'x-forwarded-for': pick('x-forwarded-for'),
			'x-real-ip': pick('x-real-ip'),
			'x-envoy-external-address': pick('x-envoy-external-address'),
			forwarded: pick('forwarded'),
			'true-client-ip': pick('true-client-ip'),
			'cf-connecting-ip': pick('cf-connecting-ip')
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
