import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkFunctions } from '$lib/server/integrations/functions.ts';

// Signed-in only (deny-by-default in hooks.server.ts). Fetched by the dashboard
// after it renders, so two external round trips never delay the page itself.
export const GET: RequestHandler = async () => {
	return json({ functions: await checkFunctions() }, { headers: { 'Cache-Control': 'no-store' } });
};
