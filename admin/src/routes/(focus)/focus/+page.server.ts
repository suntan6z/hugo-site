import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { openTasks, readCorpus } from '$lib/server/tasks/corpus.ts';
import { readSession, writeSession, clearSession, planSession, snooze } from '$lib/server/tasks/session.ts';
import { snoozeUntil, type TaskKind } from '$lib/server/tasks/find.ts';
import { repo } from '$lib/server/content/repo.ts';
import { loadPost, LANGS } from '$lib/server/content/post.ts';
import { invalidate } from '$lib/server/cache.ts';
import { audit } from '$lib/server/store/kv.ts';
import { recordPublish } from '$lib/server/integrations/buildinfo.ts';
import { fromForm } from '$lib/server/content/frontmatter.ts';
import { isConfigured as canTranslate } from '$lib/server/integrations/deepl.ts';
import type { Lang } from '$lib/server/langs.ts';
import { whyNotUrl } from '$lib/server/content/site-params.ts';

/**
 * One task at a time, answered or skipped, with everything held back until you
 * leave. See tasks/session.ts for why the writes are batched.
 */
export const load: PageServerLoad = async () => {
	const [tasks, session] = await Promise.all([openTasks(), readSession()]);
	const task = tasks[0] ?? null;

	// Only the current card's context is loaded, never the whole corpus again.
	let context: Record<string, unknown> = {};
	if (task?.slug) {
		const post = await loadPost(task.slug);
		if (post) {
			context = {
				english: {
					title: post.translations.en.title,
					description: post.translations.en.description,
					body: post.translations.en.body
				},
				current: task.lang ? post.translations[task.lang] : undefined
			};
		}
	}

	return {
		task,
		context,
		remaining: tasks.length,
		pending: session.edits.length,
		canTranslate: canTranslate()
	};
};

export const actions: Actions = {
	// Records one answer. Nothing is committed until `finish`.
	answer: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const kind = String(f.get('kind') ?? '') as TaskKind;
		const slug = String(f.get('slug') ?? '');
		const lang = String(f.get('lang') ?? 'en') as Lang;
		const value = fromForm(f.get('value')).trim();

		const session = await readSession();
		if (kind === 'alt-text' && value) {
			session.edits.push({ kind, slug, lang, image: String(f.get('image') ?? ''), alt: value });
		} else if (kind === 'gallery-alt' && value) {
			session.edits.push({ kind, city: String(f.get('city') ?? ''), file: String(f.get('file') ?? ''), alt: value });
		} else if (kind === 'description' && value) {
			session.edits.push({ kind, slug, lang, description: value });
		} else if (kind === 'dead-link') {
			const url = fromForm(f.get('url')).trim();
			const page = fromForm(f.get('page')).trim();
			const field = fromForm(f.get('field')).trim();
			const unlink = f.get('unlink') === 'on' && !field;
			if (!unlink) {
				const bad = whyNotUrl(value) ?? (value === '' ? 'Give the new address, or choose to remove the link.' : null);
				if (bad) return fail(400, { message: bad });
				if (value === url) return fail(400, { message: 'That is the same address that no longer works.' });
			}
			session.edits.push({
				kind,
				target: page ? { type: 'page', name: page } : { type: 'post', slug },
				lang: field ? undefined : lang,
				field: field === 'partner_url' || field === 'project_url' ? field : undefined,
				url,
				next: unlink ? null : value
			});
		} else if (kind === 'translation') {
			const title = fromForm(f.get('title')).trim();
			const body = fromForm(f.get('body'));
			if (!title || !body.trim()) return fail(400, { message: 'A translation needs at least a title and a body.' });
			session.edits.push({ kind, slug, lang, title, description: fromForm(f.get('description')).trim(), body });
		}
		// 'now-check' answers nothing: saying it is still true just snoozes it.
		if (kind === 'now-check') await snooze(id, snoozeUntil(kind));

		session.done.push(id);
		await writeSession(session);
		return { ok: true };
	},

	skip: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const kind = String(f.get('kind') ?? '') as TaskKind;
		await snooze(id, snoozeUntil(kind));
		const session = await readSession();
		session.done.push(id);
		await writeSession(session);
		return { ok: true };
	},

	/** Leaves focus mode, writing everything answered as ONE commit. */
	finish: async () => {
		const session = await readSession();
		if (session.edits.length === 0) {
			await clearSession();
			redirect(303, '/');
		}
		const ops = await planSession(session.edits);
		if (ops.length === 0) {
			await clearSession();
			redirect(303, '/');
		}
		const kinds = [...new Set(session.edits.map((e) => e.kind))].join(', ');
		const { sha } = await repo.commit(
			`Tidy up: ${session.edits.length} small ${session.edits.length === 1 ? 'fix' : 'fixes'} (${kinds})`,
			ops
		);
		await recordPublish({ sha, at: new Date().toISOString(), slug: 'focus' });
		await audit('focus-finish', { sha, edits: session.edits.length, files: ops.length, kinds });
		await clearSession();
		invalidate('tasks:');
		redirect(303, `/?tidied=${session.edits.length}`);
	},

	/** Leaves without writing anything. */
	discard: async () => {
		const session = await readSession();
		if (session.edits.length) await audit('focus-discard', { edits: session.edits.length });
		await clearSession();
		redirect(303, '/');
	}
};
