import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { readAuthState, removeCredential, bumpEpoch } from '$lib/server/auth/state.ts';
import { issueSession } from '$lib/server/auth/session.ts';
import { store, audit } from '$lib/server/store/kv.ts';
import { MODE, IS_LOCAL, auth, integrations, github } from '$lib/server/env.ts';
import { backupLinks, readRepoFacts } from '$lib/server/content/backup.ts';
import { readQueue } from '$lib/server/integrations/indexnow.ts';
import { isConfigured as bingConfigured } from '$lib/server/integrations/bing.ts';
import { isConfigured as deeplConfigured, usage as deeplUsage } from '$lib/server/integrations/deepl.ts';
import { memo } from '$lib/server/cache.ts';
import { repo, ConcurrentWriteError, type FileOp } from '$lib/server/content/repo.ts';
import { fromForm, listPosts } from '$lib/server/content/post.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import {
	SOCIALS, readSocials, writeSocials, whyNotUrl, type Socials,
	readSiteText, writeSiteText, whyNotSiteText, oneLine, readString, DESCRIPTION_IDEAL, type SiteText,
	readTitle, writeTitle, whyNotTitle, readMenu, writeMenu, whyNotMenu, TITLE_MAX, MENU_LABEL_MAX, type Menu
} from '$lib/server/content/site-params.ts';
import {
	HERO_JPEG, HERO_WEBP, MAX_HERO_BYTES, MAX_RESUME_BYTES, isJpeg, isWebp, isPdf, resumePath
} from '$lib/server/content/site-files.ts';
import { isConfigured as litlyxConfigured } from '$lib/server/integrations/litlyx.ts';
import { LANGS } from '$lib/server/langs.ts';

/**
 * How big the repository is and when it last changed, from GitHub's own API.
 * Only when deployed (local mode has no network to rely on, and tests must not
 * knock on GitHub), cached for an hour, and a failure is just a missing figure.
 */
const repoFacts = () =>
	IS_LOCAL
		? Promise.resolve(null)
		: memo('github:repo-facts', 60 * 60_000, async () => {
				try {
					const r = await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}`, {
						headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'loconsole-admin' },
						signal: AbortSignal.timeout(4000)
					});
					return r.ok ? readRepoFacts(await r.json()) : null;
				} catch {
					return null;
				}
			});

async function loadSocials(): Promise<{ raw: string; socials: Socials }> {
	const raw = await repo.readText('hugo.toml');
	if (raw === null) throw new Error('hugo.toml is missing.');
	return { raw, socials: readSocials(raw) };
}

export const load: PageServerLoad = async () => {
	const state = await readAuthState();
	// Best effort and cached: a slow or failing DeepL must not hold up this page.
	const deepl = deeplConfigured()
		? await memo('deepl:usage', 5 * 60_000, () => deeplUsage()).catch(() => null)
		: null;
	// A hugo.toml the editor cannot read must not take the whole page down.
	const socials = await loadSocials().then(
		(r) => ({ values: r.socials, error: null }),
		(e: unknown) => ({ values: null, error: e instanceof Error ? e.message : String(e) })
	);
	const site = await repo
		.readText('hugo.toml')
		.then((raw) => {
			if (raw === null) throw new Error('hugo.toml is missing.');
			return { text: readSiteText(raw), resumeUrl: readString(raw, 'params', 'resumeUrl'), error: null };
		})
		.catch((e: unknown) => ({ text: null, resumeUrl: '', error: e instanceof Error ? e.message : String(e) }));
	// The site's name and navigation, from the same file; a file the editor cannot read does not take the page down.
	const nav = await repo
		.readText('hugo.toml')
		.then((raw) => {
			if (raw === null) throw new Error('hugo.toml is missing.');
			return { title: readTitle(raw), menu: readMenu(raw), error: null };
		})
		.catch((e: unknown) => ({ title: '', menu: null, error: e instanceof Error ? e.message : String(e) }));
	const articles = (await listPosts()).filter((p) => !p.draft).map((p) => ({ slug: p.slug, title: p.title }));
	const redirects = (await repo.listTree('content/redirects')).filter((p) => p.endsWith('.md') && !p.endsWith('/_index.md')).length;
	const auditKeys = await store.list('audit');
	const recent = await Promise.all(
		auditKeys.slice(-15).reverse().map((k) => store.get<Record<string, unknown>>(k))
	);

	return {
		credentials: state.credentials.map((c) => ({
			id: c.id,
			label: c.label,
			createdAt: c.createdAt
		})),
		mode: MODE,
		rpId: auth.rpId,
		origin: auth.origin,
		siteUrl: integrations.siteUrl,
		socials: { fields: SOCIALS, ...socials },
		nav: { ...nav, titleMax: TITLE_MAX, labelMax: MENU_LABEL_MAX },
		backup: { links: backupLinks(github.owner, github.repo, github.branch), facts: await repoFacts(), subscribers: !!integrations.resendApiKey },
		site: { ...site, articles, ideal: DESCRIPTION_IDEAL, canReplaceResume: !!resumePath(site.resumeUrl) },
		redirects,
		integrations: {
			bing: bingConfigured(),
			indexNow: !!integrations.indexNowKey,
			indexNowQueued: (await readQueue()).length,
			resend: !!integrations.resendApiKey,
			deepl: deeplConfigured(),
			deeplUsage: deepl,
			litlyx: litlyxConfigured()
		},
		audit: recent.filter((e): e is Record<string, unknown> => !!e)
	};
};

export const actions: Actions = {
	removePasskey: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const state = await readAuthState();

		// Removing the last credential would lock the account out of everything
		// except the bootstrap-token recovery path.
		if (state.credentials.length <= 1) {
			return fail(400, {
				message: 'This is your only passkey. Enrol another device first — removing it would leave the Scaleway console as the only way back in.'
			});
		}
		if (!state.credentials.some((c) => c.id === id)) return fail(404, { message: 'No such passkey.' });

		await removeCredential(id);
		await audit('passkey-removed', { id });
		return { message: 'Passkey removed.' };
	},

	/** The footer's profile links, in hugo.toml [params]. One commit, only the lines that changed. */
	saveSocials: async ({ request }) => {
		const f = await request.formData();
		// A field that was not sent is left as it is, never read as "clear it".
		const submitted: Partial<Socials> = Object.fromEntries(
			SOCIALS.filter(({ key }) => f.get(key) !== null).map(({ key }) => [key, fromForm(f.get(key)).trim()])
		);

		for (const { key, label } of SOCIALS) {
			const bad = whyNotUrl(submitted[key] ?? '');
			if (bad) return fail(400, { socialsError: `${label}: ${bad}`, socials: submitted });
		}

		const { raw } = await loadSocials();
		const { raw: next, changed } = writeSocials(raw, submitted);
		if (changed.length === 0) return fail(400, { socialsError: 'Nothing changed.', socials: submitted });

		const labels = changed.map((k) => SOCIALS.find((s) => s.key === k)!.label);
		const { sha } = await repo.commit(`Update social links: ${labels.join(', ')}`, [
			{ path: 'hugo.toml', content: next }
		]);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'socials' });
		await audit('socials-save', { sha, changed });
		return { socialsSaved: labels };
	},

	/** Homepage quote and each language's description, in hugo.toml. One commit. */
	saveSiteText: async ({ request }) => {
		const f = await request.formData();
		const next: SiteText = {
			quote: oneLine(fromForm(f.get('quote'))),
			quoteAuthor: oneLine(fromForm(f.get('quoteAuthor'))),
			quoteArticle: fromForm(f.get('quoteArticle')).trim(),
			description: Object.fromEntries(LANGS.map((l) => [l, oneLine(fromForm(f.get(`description_${l}`)))])) as SiteText['description']
		};
		const articles = (await listPosts()).filter((p) => !p.draft).map((p) => p.slug);
		const bad = whyNotSiteText(next, articles);
		if (bad) return fail(400, { siteError: bad, siteValues: next });

		const raw = await repo.readText('hugo.toml');
		if (raw === null) return fail(500, { siteError: 'hugo.toml is missing.', siteValues: next });
		const { raw: out, changed } = writeSiteText(raw, next);
		if (changed.length === 0) return fail(400, { siteError: 'Nothing changed.', siteValues: next });
		try {
			const { sha } = await repo.commit(`Update ${changed.join(', ')}`, [{ path: 'hugo.toml', content: out }]);
			await recordPublish({ sha, at: new Date().toISOString(), slug: 'site-text' });
			await audit('site-text-save', { sha, changed });
		} catch (e) {
			return fail(e instanceof ConcurrentWriteError ? 409 : 500, {
				siteError: e instanceof Error ? e.message : String(e),
				siteValues: next
			});
		}
		return { siteSaved: changed };
	},

	/** The site's name and its navigation (names in three languages, and their order), in hugo.toml. One commit. */
	saveNav: async ({ request }) => {
		const f = await request.formData();
		const title = oneLine(fromForm(f.get('title')));
		const raw = await repo.readText('hugo.toml');
		if (raw === null) return fail(500, { navError: 'hugo.toml is missing.', navTitle: title, navValues: undefined as Menu | undefined });

		const current = readMenu(raw);
		const next: Menu = {
			order: f.getAll('order').map((v) => fromForm(v).trim()),
			names: Object.fromEntries(
				LANGS.map((l) => [l, Object.fromEntries(current.order.map((ref) => [ref, oneLine(fromForm(f.get(`name:${l}:${ref}`)))]))])
			) as Menu['names']
		};
		const bad = whyNotTitle(title) ?? whyNotMenu(next, current);
		if (bad) return fail(400, { navError: bad, navTitle: title, navValues: next });

		const t = writeTitle(raw, title);
		const m = writeMenu(t.raw, next);
		const changed = [...(t.changed ? ['site name'] : []), ...m.changed];
		if (changed.length === 0) return fail(400, { navError: 'Nothing changed.', navTitle: title, navValues: next });
		try {
			const { sha } = await repo.commit(`Update ${changed.join(', ')}`, [{ path: 'hugo.toml', content: m.raw }]);
			await recordPublish({ sha, at: new Date().toISOString(), slug: 'navigation' });
			await audit('nav-save', { sha, changed });
		} catch (e) {
			return fail(e instanceof ConcurrentWriteError ? 409 : 500, {
				navError: e instanceof Error ? e.message : String(e),
				navTitle: title,
				navValues: next
			});
		}
		return { navSaved: changed };
	},

	/**
	 * The homepage photo. The browser sends it twice — WebP for the page, JPEG for
	 * social previews and old browsers, as layouts/index.html expects — and both
	 * land in one commit so the two can never show different people.
	 */
	saveHero: async ({ request }) => {
		const f = await request.formData();
		const webp = f.get('hero_webp');
		const jpeg = f.get('hero_jpeg');
		if (!(webp instanceof File) || !(jpeg instanceof File) || webp.size === 0 || jpeg.size === 0) {
			return fail(400, { heroError: 'Choose a photo first.' });
		}
		if (webp.size > MAX_HERO_BYTES || jpeg.size > MAX_HERO_BYTES) {
			return fail(400, { heroError: 'That photo is still over 4 MB after resizing. Try a smaller one.' });
		}
		const w = new Uint8Array(await webp.arrayBuffer());
		const j = new Uint8Array(await jpeg.arrayBuffer());
		if (!isWebp(w) || !isJpeg(j)) return fail(400, { heroError: 'The photo did not arrive as WebP and JPEG. Reload and try again.' });
		const ops: FileOp[] = [
			{ path: HERO_WEBP, bytes: w },
			{ path: HERO_JPEG, bytes: j }
		];
		const { sha } = await repo.commit('Replace the homepage photo', ops);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'hero' });
		await audit('hero-replace', { sha, bytes: w.byteLength + j.byteLength });
		return { heroSaved: true };
	},

	/** Replaces the CV file the homepage button opens, keeping its address. */
	saveResume: async ({ request }) => {
		const raw = await repo.readText('hugo.toml');
		const target = raw === null ? null : resumePath(readString(raw, 'params', 'resumeUrl'));
		if (!target) return fail(400, { resumeError: 'The CV link in hugo.toml is not a PDF on this site, so there is no file to replace.' });
		const file = (await request.formData()).get('resume');
		if (!(file instanceof File) || file.size === 0) return fail(400, { resumeError: 'Choose a PDF first.' });
		if (file.size > MAX_RESUME_BYTES) return fail(400, { resumeError: 'That PDF is over 8 MB. Export a lighter version.' });
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!isPdf(bytes)) return fail(400, { resumeError: 'That file is not a PDF.' });
		const { sha } = await repo.commit('Replace the CV', [{ path: target, bytes }]);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'resume' });
		await audit('resume-replace', { sha, bytes: bytes.byteLength });
		return { resumeSaved: true };
	},

	signOutEverywhere: async ({ cookies }) => {
		// Bumping the epoch invalidates every token ever issued, including this
		// one — so re-issue immediately or the click logs you out too.
		const epoch = await bumpEpoch();
		await issueSession(cookies, epoch);
		await audit('sign-out-everywhere', { epoch });
		return { message: 'Every other session has been signed out.' };
	}
};
