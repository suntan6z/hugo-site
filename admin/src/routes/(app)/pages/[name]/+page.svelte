<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import FileChanges from '$lib/components/FileChanges.svelte';
	import HistoryPanel from '$lib/components/HistoryPanel.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import { checkPage, stampOf, restamp, LANGS, DESCRIPTION_MIN, DESCRIPTION_MAX, type Lang } from '$lib/pages';

	let { data, form } = $props();

	const LANG_NAMES: Record<Lang, string> = { en: 'English', fr: 'Français', it: 'Italiano' };
	type Version = typeof data.page;

	const snapshot = (p: Version) => JSON.stringify(LANGS.map((l) => [p[l].title, p[l].description, p[l].body]));

	// An editable copy, re-seeded when another page is opened or after a save —
	// never on a refused save, which would throw away what was typed.
	let page = $state(untrack(() => structuredClone(data.page)));
	let committed = $state(untrack(() => snapshot(data.page)));
	let loadedName = $state(untrack(() => data.name));
	$effect(() => {
		if (data.name === loadedName) return;
		loadedName = data.name;
		page = structuredClone(data.page);
		committed = snapshot(data.page);
	});
	const dirty = $derived(snapshot(page) !== committed);

	let tab = $state<Lang>('en');
	let saving = $state(false);
	let reviewing = $state(false);

	// Checked as you type, with the same rules the save applies.
	const findings = $derived(
		LANGS.flatMap((l) =>
			!page[l].exists && !page[l].title && !page[l].body.trim()
				? []
				: checkPage(data.name, page[l], data.page[l].exists ? data.page[l].body : null).map((f) => ({ ...f, lang: l }))
		)
	);
	const errors = $derived(findings.filter((f) => f.severity === 'error'));

	/* ------------------------------------------------------ layout and theme */

	type View = 'write' | 'split' | 'preview';
	let view = $state<View>('split');
	let theme = $state<'light' | 'dark'>('light');
	let narrow = $state(false);
	onMount(() => {
		try {
			const v = localStorage.getItem('pages:view');
			if (v === 'write' || v === 'split' || v === 'preview') view = v;
		} catch {}
		const readTheme = () => (theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
		readTheme();
		const mo = new MutationObserver(readTheme);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		const mq = matchMedia('(max-width: 1100px)');
		const readWidth = () => (narrow = mq.matches);
		readWidth();
		mq.addEventListener('change', readWidth);
		// Leaving with unsaved HTML edits loses them: there is no autosave here.
		const warn = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		addEventListener('beforeunload', warn);
		return () => {
			mo.disconnect();
			mq.removeEventListener('change', readWidth);
			removeEventListener('beforeunload', warn);
		};
	});
	const shown = $derived<View>(narrow && view === 'split' ? 'write' : view);
	function setView(v: View) {
		view = v;
		try { localStorage.setItem('pages:view', v); } catch {}
	}

	/* ------------------------------------------------------------ helpers */

	const stamp = (l: Lang) => stampOf(data.name, l, page[l].body);
	function restampToday(l: Lang) {
		const next = restamp(data.name, l, page[l].body, new Date());
		if (next !== null) page[l].body = next;
	}

	let translating = $state<Lang | null>(null);
	let mtNote = $state<Partial<Record<Lang, { ok: boolean; text: string }>>>({});
	async function draftTranslation(l: 'fr' | 'it') {
		const target = page[l];
		if ((target.title || target.body.trim()) && !confirm(`Replace the ${LANG_NAMES[l]} version with a machine translation of the English?`)) return;
		translating = l;
		mtNote[l] = undefined;
		try {
			const r = await fetch('/api/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ slug: data.name, to: l, format: 'html', fields: { title: page.en.title, description: page.en.description, body: page.en.body } })
			});
			if (!r.ok) {
				if (r.status === 401) throw new Error('Signed out — sign in again in another tab, then retry.');
				throw new Error((await r.json().catch(() => null))?.message ?? `Translation failed (HTTP ${r.status}).`);
			}
			const { fields, characters } = await r.json();
			Object.assign(target, { title: fields.title, description: fields.description, body: fields.body });
			mtNote[l] = { ok: true, text: `Drafted by DeepL (${characters.toLocaleString('en-GB')} characters). Nothing is saved yet — check the preview, then Save.` };
		} catch (e) {
			mtNote[l] = { ok: false, text: e instanceof Error ? e.message : String(e) };
		} finally {
			translating = null;
		}
	}

	function restoreVersion(v: Version) {
		for (const l of LANGS) {
			if (!v[l].exists) continue;
			Object.assign(page[l], { title: v[l].title, description: v[l].description, body: v[l].body });
		}
	}
</script>

<svelte:head><title>{data.label} · loconsole admin</title></svelte:head>

<div class="head">
	<a class="back" href="/pages">← Pages</a>
	<h1>{data.label}</h1>
	<a class="live" href="{data.siteUrl}/{tab}/{data.name}/" target="_blank" rel="noreferrer">Open the live page ↗</a>
</div>

{#if form?.review}
	<section class="review">
		<h2>{form.review.changes.length === 0 ? 'Nothing to commit' : `${form.review.changes.length} file${form.review.changes.length === 1 ? '' : 's'} would change`}</h2>
		{#if form.review.changes.length === 0}<p class="note">The page is already exactly as written here.</p>{/if}
		<FileChanges changes={form.review.changes} />
		<p class="note">Nothing has been written yet — this is what Save would commit.</p>
	</section>
{/if}

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.saved}<p class="msg ok">Saved ({form.langs.join(', ')}). The site shows it in a minute or two, once it has rebuilt.</p>{/if}

{#if findings.length > 0}
	<ul class="findings">
		{#each findings as f}
			<li class={f.severity}>
				<span class="sev">{f.severity === 'error' ? 'must fix' : 'check'}</span>
				<span class="lang">{f.lang}</span>
				<span>{f.message}</span>
			</li>
		{/each}
	</ul>
{/if}

{#if data.name === 'contact'}
	<p class="note contact">
		The form on this page is run by the site’s own script, which finds its fields by their <code>id</code>.
		Change the words freely; keep the ids. Saving refuses to remove one.
	</p>
{/if}

<form method="POST" action="?/save" use:enhance={({ action }) => {
		const isReview = action.search === '?/review';
		if (isReview) reviewing = true;
		else saving = true;
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			reviewing = false;
			if (result.type === 'success' && !isReview) {
				page = structuredClone(data.page);
				committed = snapshot(data.page);
			}
		};
	}}>
	<div class="tabs">
		<div class="view-switch" role="group" aria-label="Editor layout">
			{#each [['write', 'Source'], ['split', 'Split'], ['preview', 'Preview']] as [v, label]}
				<button type="button" class="pill" class:active={shown === v} class:split-only={v === 'split'} onclick={() => setView(v as View)}>{label}</button>
			{/each}
		</div>
		{#each LANGS as l}
			<button type="button" class="lang-tab" class:active={tab === l} onclick={() => (tab = l)}>
				{LANG_NAMES[l]}<i class:on={page[l].exists}></i>
			</button>
		{/each}
	</div>

	{#each LANGS as l}
		<div class="pane" hidden={tab !== l}>
			{#if l !== 'en'}
				<div class="mt">
					{#if data.canTranslate}
						<button type="button" class="btn-outline small" onclick={() => draftTranslation(l)} disabled={translating !== null || !page.en.body.trim()}>
							{translating === l ? 'Translating…' : `Draft ${LANG_NAMES[l]} from English`}
						</button>
						<span>DeepL keeps the HTML and translates the words</span>
					{:else}
						<span>Machine translation is off — add <code>DEEPL_API_KEY</code> to enable it.</span>
					{/if}
				</div>
				{#if mtNote[l]}<p class="mt-note" class:err={!mtNote[l]?.ok} role="status">{mtNote[l]?.text}</p>{/if}
			{/if}

			<div class="fields">
				<label>Title<input name="title_{l}" bind:value={page[l].title} autocomplete="off" /></label>
				<label>Description
					<textarea name="description_{l}" rows="2" bind:value={page[l].description}></textarea>
					<span class="count" class:warn={page[l].description.length > DESCRIPTION_MAX || page[l].description.length < DESCRIPTION_MIN}>
						{page[l].description.length} characters · {DESCRIPTION_MIN}–{DESCRIPTION_MAX} reads best
					</span>
				</label>
			</div>

			{#if stamp(l)}
				<p class="stamp">
					The page says it was updated <strong>{stamp(l)}</strong>.
					<button type="button" class="linkish" onclick={() => restampToday(l)}>Set it to today</button>
				</p>
			{/if}

			<div class="writing" data-view={shown}>
				<label class="source">
					<span class="sr">HTML of the {LANG_NAMES[l]} page</span>
					<textarea name="body_{l}" bind:value={page[l].body} spellcheck="false" autocapitalize="off" wrap="off"></textarea>
				</label>
				{#if l === tab && shown !== 'write'}
					<div class="preview">
						<span class="preview-label">Preview · styled like the site; forms and scripts do not run here</span>
						<PagePreview html={page[l].body} lang={l} siteUrl={data.siteUrl} {theme} />
					</div>
				{/if}
			</div>
		</div>
	{/each}

	<div class="actions">
		<button type="submit" class="btn-primary" disabled={saving || errors.length > 0 || !dirty}>
			{saving ? 'Saving…' : 'Save'}
		</button>
		<button type="submit" formaction="?/review" class="btn-outline" disabled={saving || reviewing}>
			{reviewing ? 'Checking…' : 'Review changes'}
		</button>
		<span class="state" class:dirty>{dirty ? 'Unsaved changes' : 'Saved'}</span>
	</div>
</form>

<HistoryPanel
	endpoint="/api/history/pages/{data.name}"
	onRestore={(v: Version) => restoreVersion(v)}
	note="Every save is kept, in all three languages. Loading an older version fills the editor; Save makes it current again."
/>

<style>
	.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 1rem; margin-bottom: 1rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted-foreground); width: 100%; }
	h1 { font-size: 1.4rem; margin: 0; letter-spacing: -0.015em; }
	.live { font-size: 0.82rem; text-decoration: none; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0.5rem 0; }
	.note.contact { border-left: 3px solid var(--primary); padding-left: 0.75rem; margin: 0 0 1rem; max-width: 48rem; }
	.review { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; margin: 0 0 1.25rem; }
	.review h2 { font-size: 0.95rem; margin: 0 0 0.75rem; }

	.findings { list-style: none; padding: 0.75rem 1rem; margin: 0 0 1rem; display: grid; gap: 0.35rem;
		border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
	.findings li { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; }
	.sev { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.05rem 0.4rem; border-radius: 4px; white-space: nowrap; }
	.error .sev { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
	.warning .sev { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
	.lang { font-size: 0.72rem; font-variant: small-caps; color: var(--muted-foreground); }

	.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-bottom: 0.9rem; border-bottom: 1px solid var(--border); padding-bottom: 0.6rem; }
	.view-switch { display: flex; gap: 0.3rem; margin-right: auto; }
	.lang-tab { display: inline-flex; align-items: center; gap: 0.35rem; background: none; border: 0; padding: 0.35rem 0.7rem; border-radius: 8px; cursor: pointer; font-size: 0.88rem; color: var(--muted-foreground); }
	.lang-tab.active { background: var(--accent); color: var(--accent-foreground); font-weight: 600; }
	.lang-tab i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); }
	.lang-tab i.on { background: var(--ok); }
	@media (max-width: 1100px) { .split-only { display: none; } }

	.pane { display: grid; gap: 0.8rem; }
	.mt { display: flex; gap: 0.7rem; align-items: center; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted-foreground); }
	.mt-note { font-size: 0.82rem; color: var(--ok); margin: 0; }
	.mt-note.err { color: var(--danger); }
	.small { padding: 0.35rem 0.8rem; font-size: 0.82rem; }
	.fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 0.8rem; }
	@media (max-width: 760px) { .fields { grid-template-columns: 1fr; } }
	.count { display: block; margin-top: 0.25rem; font-size: 0.72rem; font-weight: 400; color: var(--muted-foreground); }
	.count.warn { color: var(--warn); }
	.stamp { font-size: 0.85rem; margin: 0; color: var(--muted-foreground); }
	.linkish { background: none; border: 0; padding: 0; margin-left: 0.4rem; font-size: 0.82rem; color: var(--primary); text-decoration: underline; cursor: pointer; }

	.writing { display: grid; gap: 1rem; }
	.writing[data-view='split'] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
	.writing[data-view='preview'] .source { display: none; }
	.source textarea { width: 100%; min-height: 70vh; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.8rem; line-height: 1.55; tab-size: 2; white-space: pre; overflow: auto; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.preview { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
	.preview-label { font-size: 0.72rem; color: var(--muted-foreground); }

	.actions { position: sticky; bottom: 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
		margin-top: 1rem; padding: 0.75rem 0; background: var(--background); border-top: 1px solid var(--border); }
	.state { margin-left: auto; font-size: 0.8rem; color: var(--ok); }
	.state.dirty { color: var(--warn); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
