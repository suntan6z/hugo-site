import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { MODE, integrations } from '$lib/server/env.ts';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.session) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return { mode: MODE, siteUrl: integrations.siteUrl };
};
