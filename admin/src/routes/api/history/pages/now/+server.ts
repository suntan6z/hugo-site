import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nowHistory } from '$lib/server/content/now.ts';

/** Every save of the Now page — its data, language files and pictures — newest first. */
export const GET: RequestHandler = async () =>
	json({ revisions: await nowHistory() }, { headers: { 'Cache-Control': 'no-store' } });
