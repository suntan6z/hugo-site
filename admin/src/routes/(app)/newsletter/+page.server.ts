import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	isConfigured, audienceSummary, sentBroadcasts, sendBroadcast, previewBroadcast
} from '$lib/server/integrations/resend.ts';
import { listPosts, fromForm } from '$lib/server/content/post.ts';
import { integrations } from '$lib/server/env.ts';
import { audit } from '$lib/server/store/kv.ts';

const SITE_NAME = 'Lorenzo Loconsole';

/** Published, English, newest first — what a broadcast can be built from. */
async function sendablePosts() {
	return (await listPosts())
		.filter((p) => !p.draft)
		.map((p) => ({
			slug: p.slug,
			title: p.title,
			description: p.description,
			date: p.date,
			featured: p.featured_image,
			url: `${integrations.siteUrl}/en/blog/${p.slug}/`
		}));
}

export const load: PageServerLoad = async () => {
	const configured = isConfigured();
	const [posts, sent, audience] = await Promise.all([
		sendablePosts(),
		configured ? sentBroadcasts() : Promise.resolve([]),
		configured ? audienceSummary().catch(() => null) : Promise.resolve(null)
	]);

	return { configured, posts, sent, audience, siteName: SITE_NAME, siteUrl: integrations.siteUrl };
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
		imageUrl: post.featured
			? `${integrations.siteUrl}/en/blog/${slug}/${post.featured}`
			: undefined,
		siteName: SITE_NAME,
		siteUrl: integrations.siteUrl
	};
}

export const actions: Actions = {
	preview: async ({ request }) => {
		const f = await request.formData();
		const input = inputFrom(f, await sendablePosts());
		if (!input) return fail(400, { message: 'Pick an article first.' });
		return { preview: previewBroadcast(input), values: input };
	},

	send: async ({ request }) => {
		const f = await request.formData();
		const posts = await sendablePosts();
		const input = inputFrom(f, posts);
		if (!input) return fail(400, { message: 'Pick an article first.' });

		// Typing the subject back is the confirmation. A broadcast cannot be
		// recalled, so this should not be a single click.
		if (fromForm(f.get('confirm')).trim() !== input.subject) {
			return fail(400, {
				message: 'Type the subject line exactly to confirm — a sent broadcast cannot be recalled.',
				values: input,
				preview: previewBroadcast(input)
			});
		}

		try {
			const r = await sendBroadcast(input);
			if (!r.ok) {
				return fail(400, { message: r.errors.join(' '), values: input, preview: previewBroadcast(input) });
			}
			await audit('newsletter-sent', { slug: input.slug, subject: input.subject, id: r.id });
			return { sent: true, id: r.id, warnings: r.warnings };
		} catch (e) {
			return fail(502, {
				message: e instanceof Error ? e.message : String(e),
				values: input,
				preview: previewBroadcast(input)
			});
		}
	}
};
