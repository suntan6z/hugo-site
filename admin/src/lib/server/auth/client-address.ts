import type { RequestEvent } from '@sveltejs/kit';

/**
 * The visitor's address, or "unknown".
 *
 * adapter-node throws when ADDRESS_HEADER is configured but the header is
 * absent. Scaleway's edge sets it on every request today, but a missing header
 * must degrade the audit log and the rate-limit key — never break sign-in.
 */
export function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress() || 'unknown';
	} catch {
		return 'unknown';
	}
}
