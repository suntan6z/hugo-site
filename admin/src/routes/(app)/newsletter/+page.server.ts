import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	isConfigured, listSubscribers, removeSubscriber, moveSubscriber, sentBroadcasts, sendBroadcast, sendTest, looksLikeEmail,
	broadcastStates, broadcastStats, buildBroadcastHtml, validateBroadcast, configuredLangs, SITE_NAME, FROM_NAME, type Subscriber
} from '$lib/server/integrations/resend.ts';
import { newsletterArticle, type NewsletterArticle } from '$lib/server/content/newsletter-article.ts';
import type { Dispatch } from '$lib/server/schedule/plan.ts';
import { LANGS, type Lang } from '$lib/server/langs.ts';
import { readScheduled, scheduleNewsletter, cancelNewsletter } from '$lib/server/schedule/runner.ts';
import { whyNotDay, announceTimeOf, morningOf, tomorrowIn, isHeldNewsletter } from '$lib/server/schedule/plan.ts';
import { listPosts, fromForm } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { audit } from '$lib/server/store/kv.ts';
import { thumbnailUrl } from '$lib/thumbnail.ts';


/** Published, newest first: what a broadcast can be built from. What exists in each language is read when one is picked. */
async function sendablePosts() {
	return (await listPosts())
		.filter((p) => !p.draft)
		.map((p) => ({
			slug: p.slug,
			title: p.title,
			description: p.description,
			date: p.date,
			imageUrl: p.thumbnail ? thumbnailUrl(integrations.siteUrl, p.slug, p.thumbnail) : null,
			langs: p.langs as Lang[]
		}));
}

export const load: PageServerLoad = async ({ url }) => {
	const configured = isConfigured();
	const [posts, sent, subscribers, scheduledAll] = await Promise.all([
		sendablePosts(),
		configured ? sentBroadcasts() : Promise.resolve([]),
		configured ? listSubscribers().catch((): Subscriber[] | null => null) : Promise.resolve(null),
		readScheduled()
	]);
	const audience = subscribers && {
		total: subscribers.length,
		subscribed: subscribers.filter((s) => !s.unsubscribed).length,
		unsubscribed: subscribers.filter((s) => s.unsubscribed).length
	};
	// The lists that exist, with who is on each. A language with no list is not offered.
	const lists = configuredLangs().map((lang) => ({
		lang,
		subscribers: subscribers ? subscribers.filter((s) => s.lang === lang && !s.unsubscribed).length : 0
	}));

	// Arriving from an article's schedule panel: that article is already
	// chosen, so the wizard opens on the writing step.
	const asked = url.searchParams.get('slug');
	const chosen = posts.find((p) => p.slug === asked) ?? null;
	const chosenArticle = chosen ? await newsletterArticle(chosen.slug) : null;

	return {
		configured,
		posts,
		sent,
		audience,
		lists,
		subscribers,
		siteName: SITE_NAME,
		fromName: FROM_NAME,
		siteUrl: integrations.siteUrl,
		chosen,
		chosenArticle,
		// Newsletters waiting for their morning, for articles that are already live.
		held: scheduledAll
			.filter(isHeldNewsletter)
			.map((i) => ({
				slug: i.slug,
				at: i.announceAt!,
				subject: i.dispatches?.[0]?.subject ?? i.broadcast?.subject ?? null,
				lists: (i.dispatches ?? []).map((d) => d.list),
				error: i.error ?? null
			})),
		earliestDay: tomorrowIn(),
		// ?tab=sent opens on what is scheduled and sent, as a link from the dashboard does.
		tab: (['sent', 'subscribers'] as const).find((t) => t === url.searchParams.get('tab')) ?? ('compose' as const),
		// Streamed: the tabs show at once and Resend's answer fills in.
		states: (configured ? broadcastStates(sent.slice(0, 10).map((s) => s.id)) : Promise.resolve({})) as ReturnType<typeof broadcastStates>,
		// What happened to the latest few; older ones have long since settled and are one click away at Resend.
		stats: (configured ? broadcastStats(sent.slice(0, 5)) : Promise.resolve({})) as ReturnType<typeof broadcastStats>
	};
};

type Parsed = { ok: true; slug: string; article: NewsletterArticle; dispatches: Dispatch[] } | { ok: false; message: string };

/**
 * What the form sent, checked against what exists: the article, and for each list
 * its language, subject, headline and intro. A French email needs a French version
 * of the article; the English one may go to any list (the author asked for it).
 */
async function parse(f: FormData): Promise<Parsed> {
	const slug = fromForm(f.get('slug')).trim();
	const article = await newsletterArticle(slug);
	if (!article) return { ok: false, message: 'Pick an article first.' };

	let raw: unknown;
	try {
		raw = JSON.parse(fromForm(f.get('dispatches')) || '[]');
	} catch {
		return { ok: false, message: 'The emails could not be read. Reload and try again.' };
	}
	if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: 'Choose at least one list to write to.' };

	const lists = configuredLangs();
	const dispatches: Dispatch[] = [];
	for (const d of raw as Record<string, unknown>[]) {
		const list = String(d.list) as Lang;
		const lang = String(d.lang) as Lang;
		if (!lists.includes(list)) return { ok: false, message: `There is no ${String(d.list).toUpperCase()} list.` };
		if (!(LANGS as readonly string[]).includes(lang)) return { ok: false, message: 'Unknown language.' };
		if (dispatches.some((x) => x.list === list)) return { ok: false, message: `${list.toUpperCase()} is chosen twice.` };
		if (lang !== 'en' && !article.translations[lang].exists) {
			return { ok: false, message: `The article has no ${lang.toUpperCase()} version to send.` };
		}
		dispatches.push({
			list,
			lang,
			subject: fromForm(d.subject as string).trim(),
			title: fromForm(d.title as string).trim(),
			intro: fromForm(d.intro as string).trim(),
			note: fromForm(d.note as string).trim() || undefined
		});
	}
	return { ok: true, slug, article, dispatches };
}

const inputFor = (p: Extract<Parsed, { ok: true }>, d: Dispatch) => ({
	slug: p.slug,
	list: d.list,
	lang: d.lang,
	subject: d.subject,
	title: d.title,
	intro: d.intro,
	note: d.note,
	url: p.article.urls[d.lang],
	imageUrl: p.article.imageUrl ?? undefined,
	siteName: SITE_NAME,
	siteUrl: integrations.siteUrl
});

export const actions: Actions = {
	/**
	 * Forgets one subscriber entirely. The form sends the address it showed next
	 * to the button, and it must still belong to that id: a list that changed
	 * underneath (someone else removed, the page was stale) is refused rather
	 * than deleting whoever holds that id now.
	 */
	removeSubscriber: async ({ request }) => {
		if (!isConfigured()) return fail(400, { removeError: 'Resend is not connected.' });
		const f = await request.formData();
		const id = fromForm(f.get('id')).trim();
		const email = fromForm(f.get('email')).trim();
		const match = (await listSubscribers()).find((s) => s.id === id);
		if (!match || match.email !== email) {
			return fail(409, { removeError: 'That subscriber is no longer on the list. Reload and try again.' });
		}
		try {
			await removeSubscriber(id);
		} catch (e) {
			return fail(502, { removeError: e instanceof Error ? e.message : String(e) });
		}
		// The address itself stays out of the log: forgetting someone should not leave a copy behind.
		await audit('subscriber-removed', { id });
		return { removed: email };
	},

	/**
	 * Moves one subscriber to another language's list. Like removing, it names the address
	 * it saw and must still match the id, so a stale page cannot move whoever holds that id now.
	 */
	setLanguage: async ({ request }) => {
		if (!isConfigured()) return fail(400, { languageError: 'Resend is not connected.' });
		const f = await request.formData();
		const id = fromForm(f.get('id')).trim();
		const email = fromForm(f.get('email')).trim();
		const to = fromForm(f.get('lang')).trim() as Lang;
		if (!configuredLangs().includes(to)) return fail(400, { languageError: 'There is no such list.' });
		const match = (await listSubscribers()).find((s) => s.id === id);
		if (!match || match.email !== email) {
			return fail(409, { languageError: 'That subscriber is no longer on the list. Reload and try again.' });
		}
		try {
			await moveSubscriber(id, match.lang, to);
		} catch (e) {
			return fail(502, { languageError: e instanceof Error ? e.message : String(e) });
		}
		await audit('subscriber-language', { id, from: match.lang, to });
		return { moved: email, to };
	},

	/** One copy to one address, to see it in a real inbox first. Nothing is recorded as sent. */
	test: async ({ request }) => {
		if (!isConfigured()) return fail(400, { testError: 'Resend is not connected.' });
		const f = await request.formData();
		const p = await parse(f);
		if (!p.ok) return fail(400, { testError: p.message });
		const to = fromForm(f.get('to')).trim();
		if (!looksLikeEmail(to)) return fail(400, { testError: 'That does not look like an email address.' });
		try {
			// The first email chosen: the page sends one at a time, in the language being looked at.
			const r = await sendTest(inputFor(p, p.dispatches[0]), to);
			if (!r.ok) return fail(400, { testError: r.errors.join(' ') });
			// The address stays out of the log, as with removed subscribers.
			await audit('newsletter-test', { slug: p.slug, lang: p.dispatches[0].lang });
			return { tested: true };
		} catch (e) {
			return fail(502, { testError: e instanceof Error ? e.message : String(e) });
		}
	},

	/** Hold the newsletter for a morning (9:30 Paris): the trigger sends it, to each list, once the site is live. */
	schedule: async ({ request }) => {
		if (!isConfigured()) return fail(400, { message: 'Resend is not connected.' });
		const f = await request.formData();
		const p = await parse(f);
		if (!p.ok) return fail(400, { message: p.message });
		if (fromForm(f.get('confirm')).trim() !== 'send') {
			return fail(400, { message: 'Confirm first — a sent broadcast cannot be recalled.' });
		}
		const day = fromForm(f.get('day')).trim();
		const why = whyNotDay(day);
		if (why) return fail(400, { message: why });
		for (const d of p.dispatches) {
			const input = inputFor(p, d);
			const check = validateBroadcast({ ...input, html: buildBroadcastHtml(input) });
			if (!check.ok) return fail(400, { message: `${d.list.toUpperCase()}: ${check.errors.join(' ')}` });
		}

		const now = new Date().toISOString();
		await scheduleNewsletter({
			slug: p.slug,
			at: morningOf(day)!,
			announceAt: announceTimeOf(day)!,
			newsletter: true,
			state: 'published',
			createdAt: now,
			publishedAt: now,
			dispatches: p.dispatches
		});
		await audit('newsletter-scheduled', { slug: p.slug, day, lists: p.dispatches.map((d) => d.list) });
		return { scheduled: true, at: announceTimeOf(day)! };
	},

	cancelScheduled: async ({ request }) => {
		const slug = fromForm((await request.formData()).get('slug')).trim();
		const done = await cancelNewsletter(slug);
		if (done) await audit('newsletter-schedule-cancelled', { slug });
		return { cancelled: done ? slug : null };
	},

	send: async ({ request }) => {
		const f = await request.formData();
		const p = await parse(f);
		if (!p.ok) return fail(400, { message: p.message });

		// A broadcast cannot be recalled, so the page asks in a dialog and sends
		// this flag only from that dialog's button; nothing else triggers it.
		if (fromForm(f.get('confirm')).trim() !== 'send') {
			return fail(400, { message: 'Confirm the send first — a sent broadcast cannot be recalled.' });
		}

		// One broadcast per list. A failure on one does not stop the others, and the page is told which went and which did not.
		const results: { list: Lang; ok: boolean; id?: string; error?: string }[] = [];
		const warnings: string[] = [];
		for (const d of p.dispatches) {
			try {
				const r = await sendBroadcast(inputFor(p, d));
				if (!r.ok) {
					results.push({ list: d.list, ok: false, error: r.errors.join(' ') });
					continue;
				}
				warnings.push(...r.warnings);
				results.push({ list: d.list, ok: true, id: r.id });
				await audit('newsletter-sent', { slug: p.slug, subject: d.subject, id: r.id, list: d.list });
			} catch (e) {
				results.push({ list: d.list, ok: false, error: e instanceof Error ? e.message : String(e) });
			}
		}
		if (!results.some((r) => r.ok)) {
			return fail(502, { message: results.map((r) => `${r.list.toUpperCase()}: ${r.error}`).join(' ') });
		}
		return { sent: true, results, warnings };
	}
};
