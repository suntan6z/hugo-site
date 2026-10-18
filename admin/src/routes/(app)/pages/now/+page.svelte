<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import FileChanges from '$lib/components/FileChanges.svelte';
	import HistoryPanel from '$lib/components/HistoryPanel.svelte';
	import { LANGS, DESCRIPTION_MIN, DESCRIPTION_MAX, type Lang } from '$lib/pages';
	import {
		checkNow, serializeNow, usedFiles, logoKind, textFields, untranslated, localizeLinks, monthYear, today,
		emptyItem, emptyYear, POSITIONS, type NowData, type Text
	} from '$lib/now';
	import { prepareImage, slugifyFilename, uniqueName, ImageError } from '$lib/client/image';

	let { data, form } = $props();

	const LANG_NAMES: Record<Lang, string> = { en: 'English', fr: 'Français', it: 'Italiano' };
	type Meta = typeof data.now.meta;
	type Version = { data: NowData; meta: Meta };

	const metaKey = (m: Meta) => JSON.stringify(LANGS.map((l) => [m[l].title.trim(), m[l].description.trim()]));

	// An editable copy, re-seeded after a save — never on a refused one, which would throw away what was typed.
	let now = $state(untrack(() => structuredClone(data.now.data)));
	let meta = $state(untrack(() => structuredClone(data.now.meta)));
	let committedData = $state(untrack(() => serializeNow(data.now.data)));
	let committedMeta = $state(untrack(() => metaKey(data.now.meta)));
	const dataDirty = $derived(serializeNow(now) !== committedData);
	const dirty = $derived(dataDirty || metaKey(meta) !== committedMeta);

	/** Pictures picked here and not saved yet, by the file name they will have. */
	let pending = $state<Record<string, { blob: Blob; url: string }>>({});
	const files = $derived([...data.now.files, ...Object.keys(pending)]);
	const iconNames = $derived(Object.keys(data.now.icons));
	/** Pictures a row could reuse as its logo: everything in the folder but the cover. */
	const logoFiles = $derived(files.filter((f) => f !== now.cover.image));

	let tab = $state<Lang>('en');
	let saving = $state(false);
	let reviewing = $state(false);
	/** Saving a change to what the page says also says it changed today. */
	let stampToday = $state(true);
	const todayIso = today();

	const findings = $derived([
		...checkNow(now, files, iconNames),
		...LANGS.filter((l) => !meta[l].title.trim()).map((l) => ({ severity: 'error' as const, message: 'The page title is empty.', lang: l }))
	]);
	const errors = $derived(findings.filter((f) => f.severity === 'error'));

	onMount(() => {
		// There is no autosave here: leaving with unsaved edits loses them.
		const warn = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		addEventListener('beforeunload', warn);
		return () => removeEventListener('beforeunload', warn);
	});

	function reseed() {
		for (const p of Object.values(pending)) URL.revokeObjectURL(p.url);
		pending = {};
		now = structuredClone(data.now.data);
		meta = structuredClone(data.now.meta);
		committedData = serializeNow(data.now.data);
		committedMeta = metaKey(data.now.meta);
	}

	/* --------------------------------------------------------- pictures */

	const fileUrl = (name: string) => pending[name]?.url ?? `/api/media/content/now/${encodeURIComponent(name)}`;
	function logoSrc(logo: string): string | null {
		const kind = logoKind(logo);
		if (kind === 'file') return fileUrl(logo);
		if (kind === 'site') return logo.startsWith('/img/') ? `/api/media/static${logo}` : `${data.siteUrl}${logo}`;
		return null;
	}

	let pictureError = $state('');
	let preparing = $state(false);

	/** Readies a picked file for the commit; returns the name it will have in the folder. */
	async function addPicture(file: File, kind: 'cover' | 'logo'): Promise<string | null> {
		pictureError = '';
		preparing = true;
		try {
			if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
				if (kind === 'cover') throw new ImageError('The cover has to be a photo: JPEG, PNG or WebP.');
				if (file.size > 512 * 1024) throw new ImageError(`${file.name} is over 512 KB — too heavy for a logo.`);
				const name = uniqueName(slugifyFilename(file.name), 'svg', files);
				pending[name] = { blob: file, url: URL.createObjectURL(file) };
				return name;
			}
			// Bitmaps go through a canvas: scaled down, re-encoded as WebP, metadata gone.
			const p = await prepareImage(file, files);
			const name = kind === 'cover' && !p.name.startsWith('cover') ? uniqueName(`cover-${p.name.replace(/\.webp$/, '')}`.slice(0, 70), 'webp', files) : p.name;
			pending[name] = { blob: p.blob, url: p.previewUrl };
			return name;
		} catch (e) {
			pictureError = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			preparing = false;
		}
	}

	async function pickCover(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const name = await addPicture(file, 'cover');
		if (name) now.cover.image = name;
	}

	/** Which row's logo chooser is open. */
	let picking = $state<number | null>(null);

	async function pickLogo(i: number, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const name = await addPicture(file, 'logo');
		if (name) {
			now.items[i].logo = name;
			picking = null;
		}
	}

	function setLogo(i: number, logo: string) {
		now.items[i].logo = logo;
		picking = null;
	}

	/* -------------------------------------------------------------- rows */

	function move<T>(list: T[], i: number, by: number) {
		const j = i + by;
		if (j < 0 || j >= list.length) return;
		const [x] = list.splice(i, 1);
		list.splice(j, 0, x);
	}

	function addItem() {
		now.items.push(emptyItem());
		tab = 'en';
	}

	function removeItem(i: number) {
		const label = now.items[i].label.en || now.items[i].text.en.slice(0, 40) || 'this row';
		if (confirm(`Remove “${label}”?`)) now.items.splice(i, 1);
	}

	function addYear() {
		const years = now.archive.map((y) => Number.parseInt(y.year, 10)).filter(Number.isFinite);
		const year = years.length ? String(Math.min(...years) - 1) : String(new Date().getFullYear() - 1);
		now.archive.push(emptyYear(year));
		tab = 'en';
	}

	/**
	 * Starts an archive entry from what the page says now, so the present can
	 * move down when it changes: the rows' lines, to be rewritten as a summary.
	 */
	function archiveCurrent() {
		const entry = emptyYear(String(new Date().getFullYear()));
		for (const l of LANGS) entry.text[l] = now.items.map((i) => i.text[l].trim()).filter(Boolean).join(' ');
		now.archive.unshift(entry);
		tab = 'en';
	}

	function removeYear(i: number) {
		if (confirm(`Remove ${now.archive[i].year || 'this entry'} from the archive?`)) now.archive.splice(i, 1);
	}

	/* ------------------------------------------------------- translation */

	let translating = $state(false);
	let mtNote = $state<{ ok: boolean; text: string } | null>(null);
	const missing = $derived(
		Object.fromEntries(
			LANGS.map((l) => [
				l,
				untranslated(now, l) +
					(meta.en.title.trim() && !meta[l].title.trim() ? 1 : 0) +
					(meta.en.description.trim() && !meta[l].description.trim() ? 1 : 0)
			])
		) as Record<Lang, number>
	);

	/** Fills every empty French and Italian field from the English. Never overwrites a word you wrote. */
	async function fillTranslations() {
		translating = true;
		mtNote = null;
		let chars = 0;
		try {
			for (const l of ['fr', 'it'] as const) {
				const metaTexts: Text[] = [
					{ en: meta.en.title, fr: meta.fr.title, it: meta.it.title },
					{ en: meta.en.description, fr: meta.fr.description, it: meta.it.description }
				];
				const targets = [...textFields(now), ...metaTexts].map((t, i) => ({ t, i })).filter(({ t }) => t.en.trim() && !t[l].trim());
				if (targets.length === 0) continue;
				const r = await fetch('/api/translate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({ slug: 'now', to: l, format: 'list', texts: targets.map(({ t }) => t.en) })
				});
				if (!r.ok) {
					if (r.status === 401) throw new Error('Signed out — sign in again in another tab, then retry.');
					throw new Error((await r.json().catch(() => null))?.message ?? `Translation failed (HTTP ${r.status}).`);
				}
				const out: { texts: string[]; characters: number } = await r.json();
				chars += out.characters;
				const fieldCount = textFields(now).length;
				targets.forEach(({ t, i }, n) => {
					const value = localizeLinks(out.texts[n] ?? '', l);
					if (i < fieldCount) t[l] = value;
					else if (i === fieldCount) meta[l].title = value;
					else meta[l].description = value;
				});
			}
			mtNote = { ok: true, text: chars ? `Drafted by DeepL (${chars.toLocaleString('en-GB')} characters). Nothing is saved yet — read them over, then Save.` : 'Everything already has a translation.' };
		} catch (e) {
			mtNote = { ok: false, text: e instanceof Error ? e.message : String(e) };
		} finally {
			translating = false;
		}
	}

	function restoreVersion(v: Version) {
		now = structuredClone(v.data);
		for (const l of LANGS) if (v.meta[l].exists) Object.assign(meta[l], { title: v.meta[l].title, description: v.meta[l].description });
	}
</script>

<svelte:head><title>Now · loconsole admin</title></svelte:head>

{#snippet icon(name: string)}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#each data.now.icons[name] ?? [] as d}<path {d} />{/each}
	</svg>
{/snippet}

{#snippet tile(logo: string, label: string)}
	{@const kind = logoKind(logo)}
	{#if kind === 'icon'}
		<span class="tile is-icon">{@render icon(logo.slice(5))}</span>
	{:else if kind === 'none'}
		<span class="tile is-icon letter">{(label || '•').slice(0, 1)}</span>
	{:else}
		<span class="tile"><img src={logoSrc(logo)} alt="" /></span>
	{/if}
{/snippet}

<!-- One text in the language being edited; the English stays in view while translating. -->
{#snippet field(t: Text, label: string, opts: { rows?: number; hint?: string; placeholder?: string } = {})}
	<label class="field">
		<span class="field-label">{label}{#if opts.hint}<small>{opts.hint}</small>{/if}</span>
		{#if opts.rows}
			<textarea rows={opts.rows} value={t[tab]} oninput={(e) => (t[tab] = e.currentTarget.value)} placeholder={tab === 'en' ? opts.placeholder ?? '' : t.en}></textarea>
		{:else}
			<input value={t[tab]} oninput={(e) => (t[tab] = e.currentTarget.value)} placeholder={tab === 'en' ? opts.placeholder ?? '' : t.en} autocomplete="off" />
		{/if}
		{#if tab !== 'en' && t.en.trim()}<span class="en-ref" class:todo={!t[tab].trim()}><b>EN</b> {t.en}</span>{/if}
	</label>
{/snippet}

<div class="page-head">
	<div>
		<a class="back" href="/pages">← Pages</a>
		<h1>Now</h1>
		<p>What is going on in your life right now, one row each, and the years before. Shared things — logos, links, years — are set once for all three languages.</p>
	</div>
	<a class="btn-outline btn-sm" href="{data.siteUrl}/{tab}/now/" target="_blank" rel="noreferrer">Open the live page ↗</a>
</div>

{#if form?.review}
	<section class="review">
		<h2>{form.review.changes.length === 0 ? 'Nothing to save' : `${form.review.changes.length} file${form.review.changes.length === 1 ? '' : 's'} would change`}</h2>
		{#if form.review.changes.length === 0}<p class="note">The page is already exactly as written here.</p>{/if}
		<FileChanges changes={form.review.changes} />
		<p class="note">Nothing has been written yet — this is what Save would change on the site. Pictures the page no longer uses are removed too.</p>
	</section>
{/if}

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.saved}<p class="msg ok">Saved. The site shows it in a minute or two, once it has rebuilt.</p>{/if}

{#if findings.length > 0}
	<ul class="findings">
		{#each findings as f}
			<li class={f.severity}>
				<span class="sev">{f.severity === 'error' ? 'must fix' : 'check'}</span>
				{#if f.lang}<span class="lang">{f.lang}</span>{/if}
				<span>{f.message}</span>
			</li>
		{/each}
	</ul>
{/if}

<form method="POST" action="?/save" use:enhance={({ formData, action }) => {
		const isReview = action.search === '?/review';
		if (isReview) reviewing = true;
		else saving = true;
		const out: NowData = $state.snapshot(now) as NowData;
		if (stampToday && dataDirty) out.updated = todayIso;
		formData.set('state', JSON.stringify({ data: out, meta: $state.snapshot(meta) }));
		const used = new Set(usedFiles(out));
		for (const [name, p] of Object.entries(pending)) if (used.has(name)) formData.append('upload', p.blob, name);
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			reviewing = false;
			if (result.type === 'success' && !isReview) reseed();
		};
	}}>

	<div class="tabs">
		{#each LANGS as l}
			<button type="button" class="lang-tab" class:active={tab === l} onclick={() => (tab = l)}>
				{LANG_NAMES[l]}{#if missing[l] > 0}<i title="{missing[l]} to translate">{missing[l]}</i>{/if}
			</button>
		{/each}
		<span class="tabs-gap"></span>
		{#if data.canTranslate}
			<button type="button" class="btn-outline btn-sm" onclick={fillTranslations} disabled={translating || (missing.fr === 0 && missing.it === 0)}>
				{translating ? 'Translating…' : 'Fill missing French & Italian'}
			</button>
		{:else}
			<span class="muted small">Machine translation isn’t connected yet — <a href="/settings#connections">connect it in Settings</a>.</span>
		{/if}
	</div>
	{#if mtNote}<p class="mt-note" class:err={!mtNote.ok} role="status">{mtNote.text}</p>{/if}
	{#if tab !== 'en'}<p class="note">Editing the {LANG_NAMES[tab]} words. An empty field shows the English on the site; the English is under each field for reference.</p>{/if}

	<!-- ------------------------------------------------------------ top -->
	<section class="card block">
		<h2>Top of the page</h2>

		<div class="cover">
			<div class="cover-frame" style="--pos: {now.cover.position}">
				{#if now.cover.image}
					<img src={fileUrl(now.cover.image)} alt="" />
				{:else}
					<span class="cover-empty">No cover — the page starts with its title</span>
				{/if}
			</div>
			<div class="cover-side">
				<label class="btn-outline btn-sm file-btn">
					{now.cover.image ? 'Replace the cover…' : 'Choose a cover…'}
					<input type="file" accept="image/jpeg,image/png,image/webp" onchange={pickCover} disabled={preparing} />
				</label>
				{#if now.cover.image}
					<button type="button" class="btn-ghost btn-sm" onclick={() => (now.cover.image = '')}>Remove</button>
					<div class="seg" role="group" aria-label="Which part of the photo to keep">
						{#each POSITIONS as p}
							<button type="button" class:on={now.cover.position === p} onclick={() => (now.cover.position = p)}>{p[0].toUpperCase() + p.slice(1)}</button>
						{/each}
					</div>
					<p class="hint">A wide crop of the photo (5 : 2). Choose which part to keep.</p>
				{/if}
			</div>
		</div>
		{#if now.cover.image}{@render field(now.cover.alt, 'Cover description', { hint: 'for people who cannot see it' })}{/if}
		{#if pictureError}<p class="msg err">{pictureError}</p>{/if}

		<div class="grid2">
			<label class="field">
				<span class="field-label">Page title <small>menu tab and search results</small></span>
				<input bind:value={meta[tab].title} autocomplete="off" />
			</label>
			<div class="field">
				<span class="field-label">Last updated <small>shown as “{monthYear(stampToday && dataDirty ? todayIso : now.updated, tab) ?? '…'}”</small></span>
				<div class="date-row">
					<input type="date" bind:value={now.updated} />
					<label class="check"><input type="checkbox" bind:checked={stampToday} /> today, when I save a change</label>
				</div>
			</div>
		</div>
		<label class="field">
			<span class="field-label">Description <small>{meta[tab].description.length} characters · {DESCRIPTION_MIN}–{DESCRIPTION_MAX} reads best in search results</small></span>
			<textarea rows="2" bind:value={meta[tab].description} placeholder={tab === 'en' ? '' : meta.en.description}></textarea>
		</label>
		{@render field(now.intro, 'Intro', { rows: 2, hint: 'the line under the heading' })}
	</section>

	<!-- ------------------------------------------------------------ now -->
	<section class="card block">
		<div class="block-head">
			<h2>Right now</h2>
			<button type="button" class="btn-outline btn-sm" onclick={addItem}>+ Add a row</button>
		</div>
		<p class="note">One row per thing going on. Text takes <code>[links](https://…)</code>, <code>**bold**</code> and <code>*italics*</code>; a link to a page of this site is written <code>/en/contact/</code>.</p>

		{#each now.items as item, i (item)}
			<div class="row">
				<div class="row-logo">
					<button type="button" class="tile-btn" onclick={() => (picking = picking === i ? null : i)} aria-expanded={picking === i} title="Change the logo">
						{@render tile(item.logo, item.label.en)}
						<span class="tile-edit">Change</span>
					</button>
				</div>
				<div class="row-fields">
					{@render field(item.label, 'Label', { placeholder: 'Studying, Building, Looking for…' })}
					{@render field(item.text, 'What is going on', { rows: 2 })}
					<label class="field">
						<span class="field-label">Logo links to <small>optional, same in every language</small></span>
						<input bind:value={item.url} placeholder="https://… or /contact/" autocomplete="off" />
					</label>
				</div>
				<div class="row-tools">
					<button type="button" class="icon-btn" onclick={() => move(now.items, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
					<button type="button" class="icon-btn" onclick={() => move(now.items, i, 1)} disabled={i === now.items.length - 1} aria-label="Move down">↓</button>
					<button type="button" class="icon-btn danger" onclick={() => removeItem(i)} aria-label="Remove">✕</button>
				</div>

				{#if picking === i}
					<div class="picker">
						<div class="picker-head">
							<strong>Logo</strong>
							<label class="btn-primary btn-sm file-btn">
								Upload a logo…
								<input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" onchange={(e) => pickLogo(i, e)} disabled={preparing} />
							</label>
							<button type="button" class="btn-outline btn-sm" onclick={() => setLogo(i, '/img/logo.svg')}>The site’s logo</button>
							<button type="button" class="btn-ghost btn-sm" onclick={() => setLogo(i, '')}>Just the initial</button>
						</div>
						<p class="hint">SVG or a PNG with a transparent background looks best; it sits on a white tile. Or pick an icon:</p>
						<div class="icons">
							{#each iconNames as name}
								<button type="button" class="icon-choice" class:on={item.logo === `icon:${name}`} onclick={() => setLogo(i, `icon:${name}`)} title={name}>
									{@render icon(name)}
								</button>
							{/each}
						</div>
						{#if logoFiles.length > 0}
							<p class="hint">Or one already in the folder:</p>
							<div class="icons">
								{#each logoFiles as f}
									<button type="button" class="icon-choice img" class:on={item.logo === f} onclick={() => setLogo(i, f)} title={f}><img src={fileUrl(f)} alt={f} /></button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<p class="empty">Nothing yet. <button type="button" class="linkish" onclick={addItem}>Add the first row</button></p>
		{/each}
	</section>

	<!-- -------------------------------------------------------- archive -->
	<section class="card block">
		<div class="block-head">
			<h2>The years before</h2>
			<div class="head-btns">
				<button type="button" class="btn-ghost btn-sm" onclick={archiveCurrent} disabled={now.items.length === 0} title="Starts an entry for this year from the rows above, for you to rewrite as a summary">Archive what’s here now</button>
				<button type="button" class="btn-outline btn-sm" onclick={addYear}>+ Add a year</button>
			</div>
		</div>
		<p class="note">Newest first. When something above stops being true, sum it up here.</p>

		{#each now.archive as y, i (y)}
			<div class="row year">
				<label class="field year-field">
					<span class="field-label">Year</span>
					<input bind:value={y.year} inputmode="numeric" autocomplete="off" />
				</label>
				<div class="row-fields">
					{@render field(y.text, 'What happened', { rows: 3 })}
					{@render field(y.note, 'What it taught me', { hint: 'optional, shown in italics' })}
				</div>
				<div class="row-tools">
					<button type="button" class="icon-btn" onclick={() => move(now.archive, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
					<button type="button" class="icon-btn" onclick={() => move(now.archive, i, 1)} disabled={i === now.archive.length - 1} aria-label="Move down">↓</button>
					<button type="button" class="icon-btn danger" onclick={() => removeYear(i)} aria-label="Remove">✕</button>
				</div>
			</div>
		{:else}
			<p class="empty">No years yet.</p>
		{/each}
	</section>

	<div class="actions">
		<button type="submit" class="btn-primary" disabled={saving || preparing || errors.length > 0 || !dirty}>
			{saving ? 'Saving…' : 'Save'}
		</button>
		<button type="submit" formaction="?/review" class="btn-outline" disabled={saving || reviewing || preparing}>
			{reviewing ? 'Checking…' : 'Review changes'}
		</button>
		<span class="state" class:dirty>{dirty ? 'Unsaved changes' : 'Saved'}</span>
	</div>
</form>

<HistoryPanel
	endpoint="/api/history/pages/now"
	onRestore={(v: Version) => restoreVersion(v)}
	note="Every save is kept. Loading an older version fills the editor; Save makes it current again. Pictures removed since then need uploading again."
/>

<style>
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted-foreground); display: inline-block; margin-bottom: 0.4rem; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0.25rem 0 0.9rem; }
	.hint { font-size: 0.78rem; color: var(--muted-foreground); margin: 0.4rem 0; }
	.muted { color: var(--muted-foreground); }
	.small { font-size: 0.8rem; }
	.review { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; margin: 0 0 1.25rem; }
	.review h2 { font-size: 0.95rem; margin: 0 0 0.75rem; }

	.findings { list-style: none; padding: 0.75rem 1rem; margin: 0 0 1rem; display: grid; gap: 0.35rem;
		border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
	.findings li { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; }
	.sev { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.05rem 0.4rem; border-radius: 4px; white-space: nowrap; }
	.error .sev { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
	.warning .sev { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
	.lang { font-size: 0.72rem; font-variant: small-caps; color: var(--muted-foreground); }

	.tabs { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem;
		padding: 0.6rem 0; background: var(--background); border-bottom: 1px solid var(--border); }
	.tabs-gap { flex: 1; }
	.lang-tab { display: inline-flex; align-items: center; gap: 0.4rem; background: none; border: 0; padding: 0.35rem 0.7rem; border-radius: 8px; cursor: pointer; font-size: 0.88rem; color: var(--muted-foreground); }
	.lang-tab.active { background: var(--accent); color: var(--accent-foreground); font-weight: 600; }
	.lang-tab i { font-style: normal; font-size: 0.68rem; min-width: 1.1rem; padding: 0 0.3rem; border-radius: 1rem; background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
	.mt-note { font-size: 0.82rem; color: var(--ok); margin: 0 0 0.6rem; }
	.mt-note.err { color: var(--danger); }

	.block { padding: 1.2rem 1.3rem; margin-bottom: 1.1rem; display: grid; gap: 0.9rem; }
	.block h2 { margin: 0; font-size: 1.1rem; }
	.block .note { margin: -0.4rem 0 0; }
	.block-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
	.head-btns { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.9rem; }
	@media (max-width: 760px) { .grid2 { grid-template-columns: 1fr; } }

	.field { display: grid; gap: 0.3rem; }
	.field-label { font-size: 0.82rem; font-weight: 600; }
	.field-label small { font-weight: 400; color: var(--muted-foreground); margin-left: 0.4rem; }
	.en-ref { font-size: 0.76rem; color: var(--muted-foreground); line-height: 1.45; }
	.en-ref b { font-size: 0.65rem; letter-spacing: 0.06em; margin-right: 0.3rem; }
	.en-ref.todo b { color: var(--warn); }
	.date-row { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; }
	.date-row input[type='date'] { width: auto; }
	.check { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 400; font-size: 0.82rem; color: var(--muted-foreground); }

	.cover { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
	@media (max-width: 760px) { .cover { grid-template-columns: 1fr; } }
	.cover-frame { aspect-ratio: 5 / 2; border-radius: calc(var(--radius) * 1.2); overflow: hidden; background: var(--muted); display: grid; place-items: center; }
	.cover-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center var(--pos); }
	.cover-empty { font-size: 0.82rem; color: var(--muted-foreground); padding: 1rem; text-align: center; }
	.cover-side { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	.cover-side .hint { flex-basis: 100%; margin: 0; }
	.file-btn { position: relative; cursor: pointer; }
	.file-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
	.seg { display: inline-flex; padding: 0.2rem; border-radius: 0.6rem; background: var(--muted); }
	.seg button { padding: 0.3rem 0.7rem; border: 0; border-radius: 0.45rem; background: none; font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); cursor: pointer; }
	.seg button.on { background: var(--card); color: var(--foreground); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.15); }

	.row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 1rem; padding: 1rem 0; border-top: 1px solid var(--border); }
	.row-fields { display: grid; gap: 0.7rem; }
	.row-tools { display: flex; flex-direction: column; gap: 0.3rem; }
	.icon-btn { width: 2rem; height: 2rem; border: 1px solid var(--border); border-radius: 8px; background: var(--card); cursor: pointer; color: var(--muted-foreground); }
	.icon-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
	.icon-btn.danger:hover { border-color: var(--danger); color: var(--danger); }
	.icon-btn:disabled { opacity: 0.35; cursor: default; }
	.year-field { width: 6rem; align-self: start; }
	.year-field input { font-size: 1.1rem; font-weight: 700; }

	/* The logo tile, drawn as the site draws it. */
	.tile-btn { position: relative; display: grid; gap: 0.3rem; justify-items: center; background: none; border: 0; padding: 0; cursor: pointer; }
	.tile-edit { font-size: 0.7rem; color: var(--primary); }
	.tile { display: grid; place-items: center; width: 3.75rem; height: 3.75rem; padding: 0.55rem; border-radius: 0.95rem; overflow: hidden; background: #fff; border: 1px solid var(--border); }
	.tile img { width: 100%; height: 100%; object-fit: contain; }
	.tile.is-icon { padding: 0; background: var(--accent); border-color: transparent; color: var(--primary); }
	.tile.is-icon :global(svg) { width: 1.7rem; height: 1.7rem; }
	.tile.letter { font-size: 1.5rem; font-weight: 700; }
	.tile-btn:hover .tile { outline: 2px solid var(--primary); outline-offset: 2px; }

	.picker { grid-column: 1 / -1; padding: 0.9rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.picker-head { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	.picker-head strong { margin-right: auto; }
	.icons { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.icon-choice { width: 2.6rem; height: 2.6rem; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 0.7rem; background: var(--card); color: var(--primary); cursor: pointer; }
	.icon-choice :global(svg) { width: 1.3rem; height: 1.3rem; }
	.icon-choice.img { background: #fff; padding: 0.3rem; }
	.icon-choice.img img { width: 100%; height: 100%; object-fit: contain; }
	.icon-choice.on, .icon-choice:hover { border-color: var(--primary); background: var(--accent); }

	.empty { font-size: 0.88rem; color: var(--muted-foreground); padding: 0.5rem 0; margin: 0; }
	.linkish { background: none; border: 0; padding: 0; font-size: inherit; color: var(--primary); text-decoration: underline; cursor: pointer; }

	.actions { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
		margin-top: 1rem; padding: 0.75rem 0; background: var(--background); border-top: 1px solid var(--border); }
	.state { margin-left: auto; font-size: 0.8rem; color: var(--ok); }
	.state.dirty { color: var(--warn); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
	@media (max-width: 640px) {
		.row { grid-template-columns: 1fr; }
		.row-tools { flex-direction: row; }
	}
</style>
