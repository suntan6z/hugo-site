import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { LANGS, type Lang } from '$lib/pages.ts';
import { checkNow, parseNow, NowError, type NowFinding } from '$lib/now.ts';
import { loadNow, planNowSave, NowSaveError, type NowVersion, type Upload } from '$lib/server/content/now.ts';
import { describePlan, fromForm } from '$lib/server/content/post.ts';
import { repo, ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { queueUrls } from '$lib/server/integrations/indexnow.ts';
import { isConfigured as canTranslate } from '$lib/server/integrations/deepl.ts';
import { audit } from '$lib/server/store/kv.ts';
import { invalidate } from '$lib/server/cache.ts';
import { integrations } from '$lib/server/env.ts';

/**
 * The Now page's own editor. It takes the place of the generic page editor
 * (pages/[name]) for this one page: its words are structured data in
 * content/now/now.json, not hand-written HTML (see lib/now.ts).
 */

export const load: PageServerLoad = async () => ({
	now: await loadNow(),
	canTranslate: canTranslate(),
	siteUrl: integrations.siteUrl
});

/** The editor's fields, the pictures sent with them, and the checks they fail. */
async function parse(f: FormData) {
	let next: NowVersion;
	try {
		const raw = JSON.parse(fromForm(f.get('state')));
		next = {
			data: parseNow(JSON.stringify(raw.data ?? {})),
			meta: Object.fromEntries(
				LANGS.map((l) => [
					l,
					{ title: String(raw.meta?.[l]?.title ?? ''), description: String(raw.meta?.[l]?.description ?? ''), exists: true }
				])
			) as NowVersion['meta']
		};
	} catch (e) {
		throw new NowSaveError(e instanceof NowError ? e.message : 'Malformed form data — reload and try again.');
	}
	const uploads: Upload[] = [];
	for (const entry of f.getAll('upload')) {
		if (entry instanceof File && entry.size > 0) uploads.push({ name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
	}
	const { files, icons } = await loadNow();
	const findings: NowFinding[] = checkNow(next.data, [...files, ...uploads.map((u) => u.name)], Object.keys(icons));
	for (const l of LANGS) {
		if (!next.meta[l].title.trim()) findings.push({ severity: 'error', message: 'The page title is empty.', lang: l });
	}
	return { next, uploads, findings, ops: await planNowSave(next, uploads) };
}

const langsTouched = (paths: string[]): Lang[] =>
	LANGS.filter((l) => paths.some((p) => p.endsWith('now.json') || p.endsWith(l === 'en' ? '/index.md' : `/index.${l}.md`)));

export const actions: Actions = {
	save: async ({ request }) => {
		let parsed;
		try {
			parsed = await parse(await request.formData());
		} catch (e) {
			if (e instanceof NowSaveError) return fail(400, { message: e.message });
			throw e;
		}
		const { findings, ops } = parsed;
		const errors = findings.filter((x) => x.severity === 'error');
		if (errors.length) {
			return fail(422, { message: `Not saved — ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix first.`, findings });
		}
		if (ops.length === 0) return fail(400, { message: 'Nothing changed.' });

		const langs = langsTouched(ops.map((o) => o.path));
		try {
			const { sha } = await repo.commit(`Update the Now page`, ops);
			await recordPublish({ sha, at: new Date().toISOString(), slug: 'page:now' });
			if (langs.length) await queueUrls(langs.map((l) => `${integrations.siteUrl}/${l}/now/`));
			await audit('page-save', { slug: 'now', sha, langs });
			// The "still true?" task keys off when the page last changed; the Library lists its pictures.
			invalidate('tasks:');
			if (ops.some((o) => !('content' in o))) invalidate('media:');
			return { saved: true, sha };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	},

	/** The exact commit Save would make. Same parse, same planner; writes nothing. */
	review: async ({ request }) => {
		try {
			const { findings, ops } = await parse(await request.formData());
			return { review: { changes: await describePlan(ops) }, findings };
		} catch (e) {
			if (e instanceof NowSaveError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
