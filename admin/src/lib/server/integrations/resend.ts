import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';
import { memo, invalidate } from '../cache.ts';
import {
	buildBroadcastHtml, buildBroadcastText, validateBroadcast,
	type BroadcastInput
} from './newsletter-email.ts';

export * from './newsletter-email.ts';

/**
 * Resend, for the subscriber list and broadcasts.
 *
 * The audience id is the same one functions/newsletter.js enrols people into,
 * so the portal sends to exactly the list the site's signup form fills. The
 * sender is newsletter@loconsole.eu, which is the verified identity that form
 * already uses for its welcome email.
 */

const API = integrations.resendApiUrl || 'https://api.resend.com';
/** The name a broadcast comes from, shared by the newsletter page and the scheduler. */
export const SITE_NAME = 'Lorenzo Loconsole';
const FROM = 'Lorenzo Loconsole 〡Blog <newsletter@loconsole.eu>';
const SENT_KEY = 'state/broadcasts';

export const isConfigured = () => !!integrations.resendApiKey;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const key = integrations.resendApiKey;
	if (!key) throw new Error('RESEND_API_KEY is not configured.');

	const r = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${key}`,
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(20_000)
	});
	const text = await r.text();
	if (!r.ok) throw new Error(`Resend ${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
	return (text ? JSON.parse(text) : {}) as T;
}

export interface AudienceSummary {
	total: number;
	subscribed: number;
	unsubscribed: number;
}

export interface Subscriber {
	id: string;
	email: string;
	createdAt: string;
	unsubscribed: boolean;
}

/** Everyone the signup form has enrolled, newest first. Cached like the count it feeds. */
export async function listSubscribers(): Promise<Subscriber[]> {
	return memo('resend:contacts', 5 * 60_000, async () => {
		const r = await call<{ data?: { id?: string; email?: string; created_at?: string; unsubscribed?: boolean }[] }>(
			'GET',
			`/audiences/${integrations.resendAudienceId}/contacts`
		);
		return (r.data ?? [])
			.filter((c): c is { id: string; email: string; created_at?: string; unsubscribed?: boolean } =>
				typeof c.id === 'string' && typeof c.email === 'string'
			)
			.map((c) => ({ id: c.id, email: c.email, createdAt: c.created_at ?? '', unsubscribed: !!c.unsubscribed }))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	});
}

/** Cached: the count is shown on a page load, not acted on in real time. */
export async function audienceSummary(): Promise<AudienceSummary> {
	const contacts = await listSubscribers();
	const unsubscribed = contacts.filter((c) => c.unsubscribed).length;
	return { total: contacts.length, subscribed: contacts.length - unsubscribed, unsubscribed };
}

/**
 * Deletes one contact outright — for a request to be forgotten, which an
 * unsubscribe link does not do (Resend keeps the address, marked unsubscribed).
 */
export async function removeSubscriber(id: string): Promise<void> {
	if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error('That is not a subscriber id.');
	await call('DELETE', `/audiences/${integrations.resendAudienceId}/contacts/${id}`);
	invalidate('resend:');
}

/** Broadcasts the portal has sent. Kept locally: it is our audit trail, not Resend's. */
export interface SentBroadcast {
	id: string;
	slug: string;
	subject: string;
	at: string;
	recipients: number;
}

export async function sentBroadcasts(): Promise<SentBroadcast[]> {
	return (await store.get<SentBroadcast[]>(SENT_KEY)) ?? [];
}

async function recordSent(b: SentBroadcast): Promise<void> {
	const all = await sentBroadcasts();
	await store.put(SENT_KEY, [b, ...all].slice(0, 50));
}

export interface SendInput extends BroadcastInput {
	subject: string;
	slug: string;
}

export interface SendResult {
	ok: boolean;
	id?: string;
	errors: string[];
	warnings: string[];
}

/**
 * Creates the broadcast and sends it. Two calls, deliberately in this order:
 * if the send fails, the draft still exists in Resend and can be sent from
 * their dashboard rather than being lost.
 */
export async function sendBroadcast(input: SendInput): Promise<SendResult> {
	const html = buildBroadcastHtml(input);
	const check = validateBroadcast({
		subject: input.subject,
		title: input.title,
		intro: input.intro,
		url: input.url,
		html
	});
	if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings };

	const created = await call<{ id: string }>('POST', '/broadcasts', {
		audience_id: integrations.resendAudienceId,
		from: FROM,
		subject: input.subject,
		html,
		text: buildBroadcastText(input)
	});

	await call('POST', `/broadcasts/${created.id}/send`, {});

	const audience = await audienceSummary().catch(() => ({ subscribed: 0 }) as AudienceSummary);
	await recordSent({
		id: created.id,
		slug: input.slug,
		subject: input.subject,
		at: new Date().toISOString(),
		recipients: audience.subscribed
	});
	invalidate('resend:');

	return { ok: true, id: created.id, errors: [], warnings: check.warnings };
}

/** Renders the email without sending, for the preview pane. */
export function previewBroadcast(input: BroadcastInput): string {
	return buildBroadcastHtml(input);
}
