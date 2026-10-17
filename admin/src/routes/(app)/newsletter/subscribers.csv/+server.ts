import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isConfigured, listSubscribers } from '$lib/server/integrations/resend.ts';
import { toCsv } from '$lib/server/integrations/subscribers-csv.ts';
import { invalidate } from '$lib/server/cache.ts';
import { audit } from '$lib/server/store/kv.ts';

/**
 * Everyone on the list, as a CSV download. Signed-in only (the deny-by-default
 * hook). Read fresh from Resend rather than from the five-minute cache: an
 * export that is minutes behind is the wrong kind of backup. The log records
 * that it happened and how many rows, never an address.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	if (!isConfigured()) error(400, 'Resend is not connected.');
	invalidate('resend:contacts');
	const rows = await listSubscribers();
	await audit('subscribers-exported', { count: rows.length });
	setHeaders({
		'Content-Type': 'text/csv; charset=utf-8',
		'Content-Disposition': `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
		'Cache-Control': 'private, no-store'
	});
	// A byte-order mark, so a spreadsheet reads accents in an address as UTF-8.
	return new Response('﻿' + toCsv(rows));
};
