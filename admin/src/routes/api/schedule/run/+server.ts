import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runDue } from '$lib/server/schedule/runner.ts';

/**
 * The same work the scheduled trigger runs, done because you opened the
 * portal. Session-gated by hooks.server.ts, so this is you asking, and it
 * means a missed cron window delays scheduled publishing rather than losing it.
 */
export const POST: RequestHandler = async () => json(await runDue());
