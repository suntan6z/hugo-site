import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isPageName, pageLabel, checkPage, LANGS, type Lang, type PageName, type PageFinding } from '$lib/pages.ts';
import { loadPage, planPageSave, type PageText } from '$lib/server/content/page.ts';
import { describePlan, fromForm } from '$lib/server/content/post.ts';
import { repo, ConcurrentWriteError } from '$lib/server/content/repo.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { queueUrls } from '$lib/server/integrations/indexnow.ts';
import { isConfigured as canTranslate } from '$lib/server/integrations/deepl.ts';
import { audit } from '$lib/server/store/kv.ts';
import { invalidate } from '$lib/server/cache.ts';
import { integrations } from '$lib/server/env.ts';

const nameOf = (raw: string): PageName => {
	if (!isPageName(raw)) error(404, 'No such page');
	return raw;
};

export const load: PageServerLoad = async ({ params }) => {
	const name = nameOf(params.name);
	return {
		name,
		label: pageLabel(name),
		page: await loadPage(name),
		canTranslate: canTranslate(),
		siteUrl: integrations.siteUrl
	};
};

/** The editor's fields, and the checks each language fails against what is committed. */
async function parse(f: FormData, name: PageName) {
	const current = await loadPage(name);
	const next = Object.fromEntries(
		LANGS.map((l) => [
			l,
			{
				title: fromForm(f.get(`title_${l}`)).trim(),
				description: fromForm(f.get(`description_${l}`)).trim(),
				body: fromForm(f.get(`body_${l}`))
			}
		])
	) as Record<Lang, PageText>;
	const findings: (PageFinding & { lang: Lang })[] = LANGS.flatMap((l) =>
		// A language with no file and nothing typed is not being written, so it has nothing to check.
		!current[l].exists && !next[l].title && !next[l].body.trim()
			? []
			: checkPage(name, next[l], current[l].exists ? current[l].body : null).map((x) => ({ ...x, lang: l }))
	);
	return { next, findings, ops: await planPageSave(name, next) };
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const name = nameOf(params.name);
		const { findings, ops } = await parse(await request.formData(), name);
		const errors = findings.filter((x) => x.severity === 'error');
		if (errors.length) {
			return fail(422, { message: `Not saved — ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix first.`, findings });
		}
		if (ops.length === 0) return fail(400, { message: 'Nothing changed.' });

		const langs = LANGS.filter((l) => ops.some((o) => o.path.endsWith(l === 'en' ? `/${name}.md` : `/${name}.${l}.md`)));
		try {
			const { sha } = await repo.commit(`Update the ${pageLabel(name)} page (${langs.join(', ')})`, ops);
			await recordPublish({ sha, at: new Date().toISOString(), slug: `page:${name}` });
			await queueUrls(langs.map((l) => `${integrations.siteUrl}/${l}/${name}/`));
			await audit('page-save', { slug: name, sha, langs });
			// The Now page's "still true?" task keys off when it last changed.
			invalidate('tasks:');
			return { saved: true, sha, langs };
		} catch (e) {
			if (e instanceof ConcurrentWriteError) return fail(409, { message: e.message });
			return fail(500, { message: e instanceof Error ? e.message : String(e) });
		}
	},

	/** The exact commit Save would make. Same parse, same planner; writes nothing. */
	review: async ({ request, params }) => {
		const name = nameOf(params.name);
		const { findings, ops } = await parse(await request.formData(), name);
		return { review: { changes: await describePlan(ops), message: `Update the ${pageLabel(name)} page` }, findings };
	}
};
