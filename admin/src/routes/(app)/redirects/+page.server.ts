import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { repo, ConcurrentWriteError, type FileOp } from '$lib/server/content/repo.ts';
import { listPosts, fromForm } from '$lib/server/content/post.ts';
import { SLUG_RE, redirectPath, redirectStubs } from '$lib/server/content/rename.ts';
import { parseRedirect, groupRedirects, PROBLEM_TEXT, type RedirectFile } from '$lib/server/content/redirects.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { audit } from '$lib/server/store/kv.ts';
import { LANGS } from '$lib/server/langs.ts';
import { integrations } from '$lib/server/env.ts';

const DIR = 'content/redirects';

async function readRedirects(): Promise<RedirectFile[]> {
	const paths = (await repo.listTree(DIR)).filter((p) => p.endsWith('.md') && !p.endsWith('/_index.md'));
	const files = await Promise.all(
		paths.map(async (p) => {
			const raw = await repo.readText(p);
			return raw === null ? null : parseRedirect(p, raw);
		})
	);
	return files.filter((f): f is RedirectFile => f !== null);
}

export const load: PageServerLoad = async () => {
	const [files, posts] = await Promise.all([readRedirects(), listPosts()]);
	return {
		groups: groupRedirects(files, posts.map((p) => p.slug)).map((g) => ({ ...g, messages: g.problems.map((p) => PROBLEM_TEXT[p]) })),
		articles: posts.map((p) => ({ slug: p.slug, title: p.title })),
		siteUrl: integrations.siteUrl
	};
};

async function commit(message: string, ops: FileOp[], event: string, detail: Record<string, unknown>) {
	try {
		const { sha } = await repo.commit(message, ops);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'redirects' });
		await audit(event, { ...detail, sha });
		return null;
	} catch (e) {
		if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
		return fail(500, { message: e instanceof Error ? e.message : String(e) });
	}
}

/** The two slugs a redirect form sends, checked against what exists. */
async function readPair(f: FormData) {
	const from = fromForm(f.get('from')).trim().replace(/^\/?(?:(?:en|fr|it)\/)?blog\//, '').replace(/\/$/, '');
	const to = fromForm(f.get('to')).trim();
	const slugs = new Set((await listPosts()).map((p) => p.slug));
	if (!SLUG_RE.test(from)) return { error: 'The old address should be an article address, like my-old-article.' };
	if (slugs.has(from)) return { error: `/blog/${from}/ is a live article. Redirecting it would hide that article.` };
	if (!slugs.has(to)) return { error: 'Pick the article it should lead to.' };
	return { from, to };
}

export const actions: Actions = {
	/** Sends an old address somewhere new. Also fills in any language file that went missing. */
	retarget: async ({ request }) => {
		const pair = await readPair(await request.formData());
		if ('error' in pair) return fail(400, { message: pair.error });
		const existing = (await readRedirects()).filter((r) => r.from.endsWith(`/blog/${pair.from}/`));
		if (existing.length === 0) return fail(404, { message: `There is no redirect for /blog/${pair.from}/.` });
		const failed = await commit(
			`Redirect /blog/${pair.from}/ to ${pair.to}`,
			redirectStubs(pair.from, pair.to),
			'redirect-retarget',
			{ slug: pair.from, to: pair.to }
		);
		return failed ?? { saved: `/blog/${pair.from}/ now leads to ${pair.to}.` };
	},

	/** A new redirect: for an article deleted without one, or a link printed somewhere with a typo. */
	add: async ({ request }) => {
		const pair = await readPair(await request.formData());
		if ('error' in pair) return fail(400, { message: pair.error });
		const taken = await Promise.all(LANGS.map((l) => repo.readText(redirectPath(pair.from, l))));
		if (taken.some((t) => t !== null)) {
			return fail(400, { message: `/blog/${pair.from}/ already redirects. Change it in the list instead.` });
		}
		const failed = await commit(
			`Redirect /blog/${pair.from}/ to ${pair.to}`,
			redirectStubs(pair.from, pair.to),
			'redirect-add',
			{ slug: pair.from, to: pair.to }
		);
		return failed ?? { saved: `/blog/${pair.from}/ will lead to ${pair.to} once the site rebuilds.` };
	},

	remove: async ({ request }) => {
		const f = await request.formData();
		const paths = fromForm(f.get('paths')).split('\n').map((p) => p.trim()).filter(Boolean);
		const known = new Set((await readRedirects()).map((r) => r.path));
		if (paths.length === 0 || paths.some((p) => !known.has(p))) {
			return fail(400, { message: 'Those files are not redirects any more. Reload and try again.' });
		}
		const failed = await commit(
			`Remove redirect ${paths.map((p) => p.replace(`${DIR}/`, '')).join(', ')}`,
			paths.map((path) => ({ path, delete: true as const })),
			'redirect-remove',
			{ files: paths.length }
		);
		return failed ?? { saved: 'Removed from the site source.', removedNote: true };
	}
};
