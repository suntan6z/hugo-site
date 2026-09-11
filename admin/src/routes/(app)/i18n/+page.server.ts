import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { repo, type FileOp } from '$lib/server/content/repo.ts';
import { fromForm } from '$lib/server/content/post.ts';
import {
	I18nFile, LANGS, checkDrift, placeholders, type Lang
} from '$lib/server/content/i18n-file.ts';
import { audit } from '$lib/server/store/kv.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';

const filePath = (lang: Lang) => `i18n/${lang}.toml`;

async function loadFiles(): Promise<Record<Lang, I18nFile>> {
	const raws = await Promise.all(LANGS.map((l) => repo.readText(filePath(l))));
	const out = {} as Record<Lang, I18nFile>;
	LANGS.forEach((l, i) => {
		if (raws[i] === null) throw new Error(`${filePath(l)} is missing.`);
		out[l] = I18nFile.parse(raws[i]!);
	});
	return out;
}

export const load: PageServerLoad = async () => {
	const files = await loadFiles();
	const drift = checkDrift(files);

	const rows = files.en.keys().map((key) => ({
		key,
		values: Object.fromEntries(LANGS.map((l) => [l, files[l].get(key) ?? ''])) as Record<Lang, string>,
		placeholders: placeholders(files.en.get(key) ?? '')
	}));

	return { rows, drift, langs: LANGS };
};

export const actions: Actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const files = await loadFiles();

		// Only changed values are written, so an untouched file is not rewritten.
		let changes = 0;
		for (const key of files.en.keys()) {
			for (const lang of LANGS) {
				const submitted = fromForm(f.get(`v_${lang}_${key}`));
				if (f.get(`v_${lang}_${key}`) === null) continue;
				if (submitted !== (files[lang].get(key) ?? '')) {
					files[lang].set(key, submitted);
					changes++;
				}
			}
		}

		const newKey = fromForm(f.get('new_key')).trim();
		if (newKey) {
			if (!/^[A-Za-z0-9_+-]+$/.test(newKey)) {
				return fail(400, { message: 'A key may contain letters, digits, underscore, hyphen and +.' });
			}
			if (files.en.keys().includes(newKey)) {
				return fail(400, { message: `"${newKey}" already exists.` });
			}
			// Added to all three at once: a key in one file and not the others
			// makes i18n render an empty string there, with no build error.
			for (const lang of LANGS) files[lang].set(newKey, fromForm(f.get(`new_${lang}`)));
			changes++;
		}

		if (changes === 0) return fail(400, { message: 'Nothing changed.' });

		const drift = checkDrift(files);
		if (drift.missing.length > 0 || drift.extra.length > 0) {
			return fail(400, {
				message: `Refusing to save: the three files would no longer carry the same keys (${drift.missing.length} missing, ${drift.extra.length} extra).`
			});
		}

		const ops: FileOp[] = LANGS.map((lang) => ({
			path: filePath(lang),
			content: files[lang].serialize()
		}));
		const { sha } = await repo.commit(
			newKey ? `Add i18n key ${newKey}` : `Update ${changes} i18n string${changes === 1 ? '' : 's'}`,
			ops
		);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'i18n' });
		await audit('i18n-save', { sha, changes, newKey: newKey || undefined });
		return { success: true, sha, changes };
	}
};
