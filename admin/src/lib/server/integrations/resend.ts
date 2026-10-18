import { integrations } from '../env.ts';
import { store } from '../store/kv.ts';
import { memo, invalidate, mapLimit } from '../cache.ts';
import { readAll } from './paginate.ts';
import { STAT_TYPES, summarise, type BroadcastStats, type RecipientRow, type StatType } from './resend-stats.ts';
import {
	buildBroadcastHtml, buildBroadcastText, validateBroadcast, forSingleRecipient,
	type BroadcastInput
} from '../../newsletter-email.ts';

export * from '../../newsletter-email.ts';
export type { BroadcastStats, LinkStat } from './resend-stats.ts';

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
/** What an inbox shows as the sender. */
export const FROM_NAME = 'Lorenzo Loconsole 〡Blog';
const FROM = `${FROM_NAME} <newsletter@loconsole.eu>`;
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
		type Row = { id?: string; email?: string; created_at?: string; unsubscribed?: boolean };
		// Every page: Resend returns 20 rows unless told otherwise, and a list that stops there is wrong without saying so.
		const rows = await readAll<Row>(async (after) => {
			const r = await call<{ data?: Row[]; has_more?: boolean }>(
				'GET',
				`/audiences/${integrations.resendAudienceId}/contacts?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
			);
			return { data: r.data ?? [], has_more: r.has_more };
		});
		return rows
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

export interface BroadcastState {
	/** Resend's word for it: draft, queued, sent. */
	status: string;
	sentAt: string | null;
}

/**
 * Where each broadcast stands at Resend (draft, queued, sent). What happened to it
 * afterwards is `broadcastStats`. A broadcast that cannot be read is null, never
 * an error.
 */
export async function broadcastStates(ids: string[]): Promise<Record<string, BroadcastState | null>> {
	const one = (id: string) =>
		memo(`resend:broadcast:${id}`, 5 * 60_000, async (): Promise<BroadcastState | null> => {
			if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
			try {
				const r = await call<{ status?: string; sent_at?: string | null }>('GET', `/broadcasts/${id}`);
				return typeof r.status === 'string' ? { status: r.status, sentAt: r.sent_at ?? null } : null;
			} catch {
				return null;
			}
		});
	return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await one(id)] as const)));
}

/** A person's worth of an event is one row; a page holds at most 100 of them. */
const RECIPIENT_PAGES = 5;

async function recipients(id: string, type: StatType): Promise<RecipientRow[]> {
	return readAll<RecipientRow>(async (after) => {
		const r = await call<{ data?: RecipientRow[]; has_more?: boolean }>(
			'GET',
			`/broadcasts/${id}/recipients?type=${type}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
		);
		return { data: r.data ?? [], has_more: r.has_more };
	}, RECIPIENT_PAGES);
}

/**
 * What happened to each broadcast: delivered, bounced, complained about, unsubscribed
 * from and, if Resend tracks them, opened and clicked. Pulled when the Sent tab is
 * opened rather than pushed by webhooks, which would wake this scale-to-zero
 * container for every event. One list per event type, one broadcast at a time per
 * lane, two lanes: Resend allows about five requests a second. A broadcast Resend
 * cannot answer for is null, never an error.
 */
export async function broadcastStats(sent: SentBroadcast[]): Promise<Record<string, BroadcastStats | null>> {
	const one = (b: SentBroadcast) =>
		memo(`resend:stats:${b.id}`, 30 * 60_000, async (): Promise<BroadcastStats | null> => {
			if (!/^[A-Za-z0-9-]{8,64}$/.test(b.id)) return null;
			try {
				const lists = {} as Record<StatType, RecipientRow[]>;
				for (const type of STAT_TYPES) lists[type] = await recipients(b.id, type);
				return summarise(lists, b.recipients);
			} catch {
				return null;
			}
		});
	const pairs = await mapLimit(sent, 2, async (b) => [b.id, await one(b)] as const);
	return Object.fromEntries(pairs);
}

/** A short plain message to the owner, for the health check. Not a broadcast: no audience, nothing recorded. */
export async function sendAlert(to: string, subject: string, text: string): Promise<void> {
	await call('POST', '/emails', { from: FROM, to: [to], subject, text });
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

/**
 * Sends the email to one address, so it can be seen in a real inbox before it
 * goes to everyone. It is an ordinary message, not a broadcast: no audience, no
 * unsubscribe state, and nothing is recorded as sent.
 */
export async function sendTest(input: SendInput, to: string): Promise<SendResult> {
	const html = buildBroadcastHtml(input);
	const check = validateBroadcast({
		subject: input.subject, title: input.title, intro: input.intro, url: input.url, html
	});
	if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings };
	const r = await call<{ id: string }>('POST', '/emails', {
		from: FROM,
		to: [to],
		subject: `[Test] ${input.subject}`,
		html: forSingleRecipient(html, input.siteUrl),
		text: forSingleRecipient(buildBroadcastText(input), input.siteUrl)
	});
	return { ok: true, id: r.id, errors: [], warnings: check.warnings };
}
