import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	isConfigured, listSubscribers, removeSubscriber, sentBroadcasts, sendBroadcast, sendTest, looksLikeEmail,
	SITE_NAME, FROM_NAME, type Subscriber
} from '$lib/server/integrations/resend.ts';
import { listPosts, fromForm } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { audit } from '$lib/server/store/kv.ts';
import { thumbnailUrl } from '$lib/thumbnail.ts';


/** Published, English, newest first — what a broadcast can be built from. */
async function sendablePosts() {
	return (await listPosts())
		.filter((p) => !p.draft)
		.map((p) => ({
			slug: p.slug,
			title: p.title,
			description: p.description,
			date: p.date,
			image: p.thumbnail,
			imageUrl: p.thumbnail ? thumbnailUrl(integrations.siteUrl, p.slug, p.thumbnail) : null,
			url: `${integrations.siteUrl}/en/blog/${p.slug}/`
		}));
}

export const load: PageServerLoad = async ({ url }) => {
	const configured = isConfigured();
	const [posts, sent, subscribers] = await Promise.all([
		sendablePosts(),
		configured ? sentBroadcasts() : Promise.resolve([]),
		configured ? listSubscribers().catch((): Subscriber[] | null => null) : Promise.resolve(null)
	]);
	const audience = subscribers && {
		total: subscribers.length,
		subscribed: subscribers.filter((s) => !s.unsubscribed).length,
		unsubscribed: subscribers.filter((s) => s.unsubscribed).length
	};

	// Arriving from an article's schedule panel: that article is already
	// chosen, so the wizard opens on the writing step.
	const asked = url.searchParams.get('slug');
	const chosen = posts.find((p) => p.slug === asked) ?? null;

	return {
		configured,
		posts,
		sent,
		audience,
		subscribers,
		siteName: SITE_NAME,
		fromName: FROM_NAME,
		siteUrl: integrations.siteUrl,
		chosen
	};
};

function inputFrom(f: FormData, posts: Awaited<ReturnType<typeof sendablePosts>>) {
	const slug = fromForm(f.get('slug')).trim();
	const post = posts.find((p) => p.slug === slug);
	if (!post) return null;
	return {
		slug,
		subject: fromForm(f.get('subject')).trim(),
		title: fromForm(f.get('title')).trim(),
		intro: fromForm(f.get('intro')).trim(),
		note: fromForm(f.get('note')).trim() || undefined,
		url: post.url,
		imageUrl: post.image ? thumbnailUrl(integrations.siteUrl, slug, post.image) : undefined,
		siteName: SITE_NAME,
		siteUrl: integrations.siteUrl
	};
}

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

	/** One copy to one address, to see it in a real inbox first. Nothing is recorded as sent. */
	test: async ({ request }) => {
		if (!isConfigured()) return fail(400, { testError: 'Resend is not connected.' });
		const f = await request.formData();
		const input = inputFrom(f, await sendablePosts());
		if (!input) return fail(400, { testError: 'Pick an article first.' });
		const to = fromForm(f.get('to')).trim();
		if (!looksLikeEmail(to)) return fail(400, { testError: 'That does not look like an email address.' });
		try {
			const r = await sendTest(input, to);
			if (!r.ok) return fail(400, { testError: r.errors.join(' ') });
			// The address stays out of the log, as with removed subscribers.
			await audit('newsletter-test', { slug: input.slug });
			return { tested: true };
		} catch (e) {
			return fail(502, { testError: e instanceof Error ? e.message : String(e) });
		}
	},

	send: async ({ request }) => {
		const f = await request.formData();
		const posts = await sendablePosts();
		const input = inputFrom(f, posts);
		if (!input) return fail(400, { message: 'Pick an article first.' });

		// A broadcast cannot be recalled, so the page asks in a dialog and sends
		// this flag only from that dialog's button; nothing else triggers it.
		if (fromForm(f.get('confirm')).trim() !== 'send') {
			return fail(400, { message: 'Confirm the send first — a sent broadcast cannot be recalled.', values: input });
		}

		try {
			const r = await sendBroadcast(input);
			if (!r.ok) return fail(400, { message: r.errors.join(' '), values: input });
			await audit('newsletter-sent', { slug: input.slug, subject: input.subject, id: r.id });
			return { sent: true, id: r.id, warnings: r.warnings };
		} catch (e) {
			return fail(502, { message: e instanceof Error ? e.message : String(e), values: input });
		}
	}
};
