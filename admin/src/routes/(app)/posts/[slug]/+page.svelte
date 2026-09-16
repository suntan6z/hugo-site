<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { prepareImage, formatBytes, ImageError, type PreparedImage } from '$lib/client/image';
	import { onMount } from 'svelte';
	import ArticlePreview from '$lib/components/ArticlePreview.svelte';
	import RichEditor from '$lib/components/RichEditor.svelte';
	let { data, form } = $props();

	const LANGS = ['en', 'fr', 'it'] as const;
	const LANG_NAMES = { en: 'English', fr: 'Français', it: 'Italiano' };

	// An editable copy. Re-seeded only when the route moves to a different
	// article, so a re-render never discards in-progress edits.
	let post = $state(untrack(() => structuredClone(data.post)));
	let loaded = $state('');
	$effect(() => {
		if (data.post.slug !== loaded) {
			loaded = data.post.slug;
			post = structuredClone(data.post);
			untrack(resetAutosave);
		}
	});

	// Removing a translation is a deliberate, per-language act — never a
	// consequence of clearing the title field.
	let removeTranslation = $state<Record<string, boolean>>({ fr: false, it: false });
	let showDanger = $state(false);
	let showRename = $state(false);
	let newSlug = $state('');
	let keepRedirect = $state(true);
	let renaming = $state(false);
	// Same rule the server enforces, so the button is only live for an address
	// the server will actually accept.
	const slugOk = $derived(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug) && newSlug !== post.slug && newSlug.length <= 80);
	let confirmSlug = $state('');

	let tab = $state<'en' | 'fr' | 'it'>('en');
	let saving = $state(false);
	let reviewing = $state(false);
	// One editor per language pane, so switching tabs keeps each one's state.
	let editors = $state<Record<string, RichEditor | undefined>>({});

	/* ------------------------------------------------------------- scheduling */
	let showSchedule = $state(false);
	let scheduleAt = $state('');
	let alsoNewsletter = $state(false);
	// The browser sends what its own clock means, so the server can store UTC.
	const offset = -new Date().getTimezoneOffset();
	const whenLocal = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	// Default to tomorrow morning, the most likely answer.
	function openSchedule() {
		showSchedule = !showSchedule;
		if (!showSchedule || scheduleAt) return;
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(9, 0, 0, 0);
		scheduleAt = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	}

	// After a blocked publish the server returns the findings it rejected on;
	// otherwise show the checks computed when the page loaded.
	const findings = $derived(form?.findings ?? data.findings ?? []);
	const errors = $derived(findings.filter((f) => f.severity === 'error'));
	const warnings = $derived(findings.filter((f) => f.severity === 'warning'));

	// Images staged in the browser. They are resized and re-encoded to WebP here,
	// then appended to the form on submit so they land in the same commit as the
	// Markdown.
	let pending = $state<PreparedImage[]>([]);
	let removed = $state<string[]>([]);
	let imgError = $state('');
	let altText = $state<Record<string, string>>({});

	const allImages = $derived([...post.images.filter((i) => !removed.includes(i)), ...pending.map((p) => p.name)]);

	/**
	 * Options for the image pickers. A value that no longer resolves to a file in
	 * the bundle is kept and flagged: a <select> whose value matches no <option>
	 * submits nothing, which would silently drop the field on save.
	 */
	function optionsFor(current: string | undefined): { value: string; label: string }[] {
		const opts = allImages.map((i) => ({ value: i, label: i }));
		if (current && !allImages.includes(current)) {
			opts.unshift({ value: current, label: `${current} — missing from bundle` });
		}
		return opts;
	}

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		imgError = '';
		for (const file of Array.from(input.files ?? [])) {
			try {
				pending.push(await prepareImage(file, [...post.images, ...pending.map((p) => p.name)]));
			} catch (err) {
				imgError = err instanceof ImageError ? err.message : String(err);
			}
		}
		input.value = '';
	}

	/** Drops an image into the article at the cursor, in the language on screen. */
	function insert(name: string) {
		editors[tab]?.insert(name, altText[name] ?? '');
	}

	/** What the editor should display for a bundle image: staged blob, or committed file. */
	const imageSrc = (src: string) =>
		pendingUrls[src] ?? (/^(https?:)?\/\//.test(src) || src.startsWith('/') ? src : `/api/image/${post.slug}/${src}`);

	function toggleRemove(name: string) {
		removed = removed.includes(name) ? removed.filter((n) => n !== name) : [...removed, name];
	}

	function dropPending(name: string) {
		const p = pending.find((x) => x.name === name);
		if (p) URL.revokeObjectURL(p.previewUrl);
		pending = pending.filter((x) => x.name !== name);
	}

	/** Counts references so the UI can warn before a delete the server will reject. */
	function usedBy(name: string): boolean {
		return (
			(['en', 'fr', 'it'] as const).some((l) => post.translations[l].body.includes(name)) ||
			post.featured_image === name ||
			post.partner_logo_url === name
		);
	}

	/* ---------------------------------------------------------------- preview */

	type View = 'write' | 'split' | 'preview';
	let view = $state<View>('write');
	let theme = $state<'light' | 'dark'>('light');

	onMount(() => {
		try {
			const v = localStorage.getItem('editor:view');
			if (v === 'write' || v === 'split' || v === 'preview') view = v;
		} catch {}
		const read = () =>
			(theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
		read();
		// Follow the header's theme toggle without waiting for the next keystroke.
		const mo = new MutationObserver(read);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		return () => mo.disconnect();
	});

	// Split needs the width; below it, a remembered "split" shows as Write
	// rather than stacking a second copy of the article under the textarea.
	let narrow = $state(false);
	onMount(() => {
		const mq = matchMedia('(max-width: 1100px)');
		const read = () => (narrow = mq.matches);
		read();
		mq.addEventListener('change', read);
		return () => mq.removeEventListener('change', read);
	});
	const shown = $derived<View>(narrow && view === 'split' ? 'write' : view);

	function setView(v: View) {
		view = v;
		try { localStorage.setItem('editor:view', v); } catch {}
	}

	// Scroll position of the body textarea, shared with the preview in split view.
	let syncRatio = $state<number | null>(null);
	function onBodyScroll(e: Event) {
		if (shown !== 'split') return;
		const el = e.target as HTMLElement;
		if (!el?.classList?.contains('surface')) return;
		const max = el.scrollHeight - el.clientHeight;
		syncRatio = max > 0 ? el.scrollTop / max : 0;
	}

	const pendingUrls = $derived(Object.fromEntries(pending.map((p) => [p.name, p.previewUrl])));

	/* --------------------------------------------------------------- autosave */

	type Snapshot = ReturnType<typeof snapshotOf>;

	function snapshotOf(p: typeof post) {
		return {
			date: p.date,
			category: p.category,
			draft: p.draft,
			featured_image: p.featured_image ?? '',
			partner_name: p.partner_name ?? '',
			partner_url: p.partner_url ?? '',
			partner_logo_url: p.partner_logo_url ?? '',
			project_url: p.project_url ?? '',
			translations: Object.fromEntries(
				LANGS.map((l) => [l, {
					title: p.translations[l].title,
					description: p.translations[l].description,
					body: p.translations[l].body,
					untranslated: p.translations[l].untranslated,
					eu_funding_text: p.translations[l].eu_funding_text ?? ''
				}])
			) as Record<'en' | 'fr' | 'it', { title: string; description: string; body: string; untranslated: boolean; eu_funding_text: string }>
		};
	}

	/** djb2: fingerprints the committed article so a stale draft can be recognised. */
	function fingerprint(s: string): string {
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
		return (h >>> 0).toString(36);
	}

	type DraftRecord = { savedAt: string; baseHash: string; post: Snapshot; where: 'this device' | 'your account' };

	let committed = $state('');
	let baseHash = $state('');
	let autosave = $state<'clean' | 'dirty' | 'local' | 'saving' | 'synced' | 'offline' | 'signedout'>('clean');
	let syncedAt = $state<string | null>(null);
	let offer = $state<DraftRecord | null>(null);
	let ready = $state(false);

	const localKey = () => `draft:${post.slug}`;

	/** Sets the committed baseline for the article now loaded, then looks for drafts. */
	function resetAutosave() {
		committed = JSON.stringify(snapshotOf(post));
		baseHash = fingerprint(committed);
		autosave = 'clean';
		syncedAt = null;
		offer = null;
		ready = false;
		lookForDraft(post.slug);
	}

	async function lookForDraft(slug: string) {
		// Look for unsaved work: this browser's copy, and the server's (which may
		// come from another device). Offer the newest one that differs from what
		// is committed.
		const found: DraftRecord[] = [];
		try {
			const raw = localStorage.getItem(`draft:${slug}`);
			if (raw) found.push({ ...JSON.parse(raw), where: 'this device' });
		} catch {}
		try {
			const r = await fetch(`/api/drafts/${slug}`);
			if (r.ok) {
				const { draft } = await r.json();
				if (draft) found.push({ ...draft, where: 'your account' });
			}
		} catch {}
		if (slug !== post.slug) return; // navigated to another article meanwhile
		const usable = found
			.filter((d) => d?.post && JSON.stringify(d.post) !== committed)
			.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
		if (usable.length) {
			const newest = usable[0];
			// The same draft seen in both places is "this device", not another.
			const local = found.find((d) => d.where === 'this device');
			offer = local && JSON.stringify(local.post) === JSON.stringify(newest.post) ? { ...newest, where: 'this device' } : newest;
		}
		ready = true;
	}

	function restoreDraft() {
		if (!offer) return;
		const d = offer.post;
		Object.assign(post, {
			date: d.date, category: d.category, draft: d.draft,
			featured_image: d.featured_image || undefined,
			partner_name: d.partner_name || undefined, partner_url: d.partner_url || undefined,
			partner_logo_url: d.partner_logo_url || undefined, project_url: d.project_url || undefined
		});
		for (const l of LANGS) Object.assign(post.translations[l], d.translations[l]);
		offer = null;
	}

	// Server writes run one at a time, so a slow PUT can never land after the
	// DELETE that was meant to replace it.
	let serverQueue: Promise<unknown> = Promise.resolve();
	const serverOp = (fn: () => Promise<void>) => (serverQueue = serverQueue.then(fn, fn));

	function forgetDraft() {
		try { localStorage.removeItem(localKey()); } catch {}
		serverOp(async () => {
			await fetch(`/api/drafts/${post.slug}`, { method: 'DELETE' }).catch(() => {});
		});
	}

	function discardDraft() {
		offer = null;
		forgetDraft();
		autosave = 'clean';
	}

	// Two tiers: this browser immediately (survives Safari reloading the tab,
	// even offline), and the server a few seconds later (survives a lost
	// device and follows you between them). Neither commits, so neither costs
	// a StaticHost build.
	$effect(() => {
		const snap = JSON.stringify(snapshotOf(post));
		if (!ready || offer) return;
		if (snap === committed) {
			// Edited back to exactly what is committed: nothing left to keep.
			if (untrack(() => autosave) !== 'clean') {
				forgetDraft();
				autosave = 'clean';
			}
			return;
		}
		autosave = 'dirty';
		const local = setTimeout(() => {
			try {
				localStorage.setItem(localKey(), JSON.stringify({
					savedAt: new Date().toISOString(), baseHash, post: JSON.parse(snap)
				}));
				autosave = 'local';
			} catch {}
		}, 500);
		const remote = setTimeout(() => serverOp(async () => {
			// The article may have been saved, or edited back, while queued.
			if (autosave === 'clean') return;
			autosave = 'saving';
			try {
				const r = await fetch(`/api/drafts/${post.slug}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ baseHash, post: JSON.parse(snap) })
				});
				if (r.status === 401) {
					autosave = 'signedout';
					return;
				}
				if (!r.ok) throw new Error(String(r.status));
				syncedAt = (await r.json()).savedAt;
				if (autosave === 'saving') autosave = 'synced';
			} catch {
				if (autosave === 'saving') autosave = 'offline';
			}
		}), 4000);
		return () => { clearTimeout(local); clearTimeout(remote); };
	});

	/** After a real save, the committed version becomes the new baseline. */
	function markCommitted() {
		committed = JSON.stringify(snapshotOf(post));
		baseHash = fingerprint(committed);
		// The save already cleared the server copy; this also catches a PUT
		// that was in flight while saving.
		forgetDraft();
		autosave = 'clean';
	}

	const staleOffer = $derived(!!offer && offer.baseHash !== baseHash);
	const when = (iso: string) => {
		const d = new Date(iso);
		const today = new Date().toDateString() === d.toDateString();
		return today
			? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
			: d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	};

	/* ------------------------------------------------------------ translation */

	let translating = $state<'fr' | 'it' | null>(null);
	let mtNote = $state<Record<string, { ok: boolean; text: string } | undefined>>({});

	/** Fills a language pane with DeepL's translation of the English. Saves nothing. */
	async function draftTranslation(l: 'fr' | 'it') {
		const target = post.translations[l];
		const en = post.translations.en;
		if (
			(target.title.trim() || target.body.trim()) &&
			!confirm(`Replace the ${LANG_NAMES[l]} title, description and body with a machine translation of the English?`)
		) return;
		translating = l;
		mtNote[l] = undefined;
		try {
			const r = await fetch('/api/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					slug: post.slug,
					to: l,
					fields: {
						title: en.title,
						description: en.description,
						body: en.body
					}
				})
			});
			if (!r.ok) {
				if (r.status === 401) throw new Error('Signed out — sign in again in another tab, then retry.');
				throw new Error((await r.json().catch(() => null))?.message ?? `Translation failed (HTTP ${r.status}).`);
			}
			const { fields, characters, warnings } = await r.json();
			target.title = fields.title;
			target.description = fields.description;
			target.body = fields.body;
			// eu_funding_text is not translated: it is fixed wording the server sets.
			// It is a real translation now, not a placeholder, and not to be deleted.
			target.untranslated = false;
			removeTranslation[l] = false;
			mtNote[l] = {
				ok: true,
				text: `Drafted by DeepL (${characters.toLocaleString('en-GB')} characters). Nothing is saved yet — read it through, then Save.` +
					(warnings.length ? ` ${warnings.join(' ')}` : '')
			};
		} catch (e) {
			mtNote[l] = { ok: false, text: e instanceof Error ? e.message : String(e) };
		} finally {
			translating = null;
		}
	}

	const isErasmus = $derived(post.category === 'Erasmus+');
	const t = $derived(post.translations[tab]);

	// Mirrors layouts/blog/single.html: the partner strip needs these fields.
	const missingPartner = $derived(isErasmus && (!post.partner_name || !post.partner_url));
</script>

<div class="head">
	<div>
		<a class="back" href="/posts">← Articles</a>
		<h1>{post.translations.en.title || post.slug}</h1>
		<code>content/blog/{post.slug}/</code>
	</div>
</div>

{#if form?.review}
	{@const r = form.review}
	<section class="review">
		<h2>
			{r.changes.length === 0 ? 'Nothing to commit' : `${r.changes.length} file${r.changes.length === 1 ? '' : 's'} would change`}
			<span class="msgline">{r.message}{r.draft ? ' · stays a draft' : ''}</span>
		</h2>
		{#if r.changes.length === 0}
			<p class="hint">This article is already exactly as written here.</p>
		{/if}
		{#each r.changes as c}
			<article class="file">
				<header>
					<code>{c.path}</code>
					<span class="status {c.status}">{c.status}</span>
					{#if c.bytes}<span class="hint">{formatBytes(c.bytes)}</span>
					{:else if !c.tooBig}<span class="counts"><span class="plus">+{c.added}</span> <span class="minus">−{c.removed}</span></span>{/if}
				</header>
				{#if c.tooBig}
					<p class="hint">Too large to show line by line.</p>
				{:else if c.hunks.length}
					<!-- Each line is its own block element, so no newlines belong between them. -->
					<pre>{#each c.hunks as h, i}{#if i > 0}<span class="gap">⋯</span>{/if}{#each h.changes as ch}<span class={ch.kind}>{ch.kind === 'add' ? '+' : ch.kind === 'remove' ? '−' : ' '} {ch.line}</span>{/each}{/each}</pre>
				{/if}
			</article>
		{/each}
		<p class="hint">Nothing has been written yet — this is what Save or Publish would commit.</p>
	</section>
{/if}

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if data.renamedFrom}
	<p class="msg ok">
		Moved from <code>{data.renamedFrom}</code>. The old address
		{#if data.renamedRedirect}redirects here once the site rebuilds.{:else}is no longer served by this article.{/if}
	</p>
{/if}

{#if form?.success}<p class="msg ok">Saved{form.published ? ' and published' : ''}. Commit <code>{form.sha}</code>.</p>{/if}
{#if form?.scheduled}<p class="msg ok">Scheduled for {whenLocal(form.at)}{form.newsletter ? ', newsletter included' : ''}.</p>{/if}
{#if form?.unscheduled}<p class="msg ok">No longer scheduled.</p>{/if}

{#if findings.length > 0}
	<section class="findings">
		<h2>
			{errors.length > 0 ? `${errors.length} to fix before publishing` : `${warnings.length} suggestion${warnings.length === 1 ? '' : 's'}`}
		</h2>
		<ul>
			{#each findings as f}
				<li class={f.severity}>
					<span class="sev">{f.severity === 'error' ? 'must fix' : 'suggestion'}</span>
					{#if f.lang}<span class="lang">{f.lang}</span>{/if}
					<span>{f.message}</span>
				</li>
			{/each}
		</ul>
		{#if errors.length === 0}
			<p class="note">Suggestions never block publishing.</p>
		{/if}
	</section>
{/if}

{#if offer}
	<section class="restore" class:stale={staleOffer}>
		<div>
			<strong>Unsaved changes from {when(offer.savedAt)}</strong>
			<span>
				{offer.where === 'this device' ? 'Autosaved on this device.' : 'Autosaved to your account, possibly from another device.'}
				{#if staleOffer}
					The article has been saved since then — restoring would replace those newer changes.
				{/if}
			</span>
		</div>
		<div class="restore-actions">
			<button type="button" class="btn-primary" onclick={restoreDraft}>Restore</button>
			<button type="button" class="btn-outline" onclick={discardDraft}>Discard</button>
		</div>
	</section>
{/if}

<form method="POST" action="?/save" enctype="multipart/form-data" use:enhance={({ formData, action }) => {
		for (const p of pending) formData.append('newimage', p.blob, p.name);
		formData.set('deleteimages', JSON.stringify(removed));
		// Reviewing posts the same form to a different action. It writes nothing,
		// so it must not clear the staged images or the autosaved draft.
		const isReview = action.search === '?/review';
		if (isReview) reviewing = true;
		else saving = true;
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			reviewing = false;
			if (result.type === 'success' && !isReview) {
				pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
				pending = [];
				removed = [];
				markCommitted();
			}
		};
	}}>
	<section class="shared">
		<label>Date<input name="date" bind:value={post.date} placeholder="YYYY-MM-DD" /></label>
		<label>Category
			<select name="category" bind:value={post.category}>
				{#each data.categories as c}<option>{c}</option>{/each}
			</select>
		</label>
		<label>Featured image
			<select name="featured_image" bind:value={post.featured_image}>
				<option value="">— none —</option>
				{#each optionsFor(post.featured_image) as o}<option value={o.value}>{o.label}</option>{/each}
			</select>
		</label>
		<label class="check"><input type="checkbox" name="draft" bind:checked={post.draft} /> Draft</label>
	</section>

	{#if !post.featured_image}
		<p class="hint">No featured image: this article shows no thumbnail on the homepage grid.</p>
	{/if}

	{#if isErasmus}
		<fieldset>
			<legend>Erasmus+ partner strip</legend>
			<label>Partner name<input name="partner_name" bind:value={post.partner_name} /></label>
			<label>Partner URL<input name="partner_url" bind:value={post.partner_url} /></label>
			<label>Partner logo
				<select name="partner_logo_url" bind:value={post.partner_logo_url}>
					<option value="">— none —</option>
					{#each optionsFor(post.partner_logo_url) as o}<option value={o.value}>{o.label}</option>{/each}
				</select>
			</label>
			<label>Project URL<input name="project_url" bind:value={post.project_url} /></label>
			{#if missingPartner}<p class="hint">Partner name and URL are required for the strip to render.</p>{/if}
		</fieldset>
	{/if}

	<fieldset class="images">
		<legend>Images</legend>

		<label class="picker">
			<input type="file" accept="image/*" multiple onchange={onFiles} />
			<span>Add images</span>
		</label>
		<p class="note">
			Resized to 1600px and converted to WebP in your browser. EXIF data, including GPS
			location, is stripped in the process.
		</p>
		{#if imgError}<p class="hint">{imgError}</p>{/if}

		{#if allImages.length === 0 && pending.length === 0}
			<p class="empty">No images in this bundle yet.</p>
		{:else}
			<ul class="grid">
				{#each post.images as name}
					<li class:removing={removed.includes(name)}>
						<img src="/api/image/{post.slug}/{name}" alt="" loading="lazy" />
						<code>{name}</code>
						<input class="alt" placeholder="alt text" bind:value={altText[name]} />
						<div class="row">
							<button type="button" onclick={() => insert(name)}>Insert</button>
							<button type="button" class="danger" onclick={() => toggleRemove(name)}>
								{removed.includes(name) ? 'Keep' : 'Delete'}
							</button>
						</div>
						{#if removed.includes(name) && usedBy(name)}
							<p class="hint">Still referenced — remove the reference or it won't save.</p>
						{/if}
					</li>
				{/each}
				{#each pending as p}
					<li class="new">
						<img src={p.previewUrl} alt="" />
						<code>{p.name}</code>
						<span class="meta">{p.width}×{p.height} · {formatBytes(p.originalBytes)} → {formatBytes(p.blob.size)}</span>
						<input class="alt" placeholder="alt text" bind:value={altText[p.name]} />
						<div class="row">
							<button type="button" onclick={() => insert(p.name)}>Insert</button>
							<button type="button" class="danger" onclick={() => dropPending(p.name)}>Discard</button>
						</div>
					</li>
				{/each}
			</ul>
			{#if pending.length}
				<p class="note">{pending.length} image{pending.length > 1 ? 's' : ''} will be committed with your next save.</p>
			{/if}
		{/if}
	</fieldset>

	<div class="tabs">
		<div class="view-switch" role="group" aria-label="Editor layout">
			{#each [['write', 'Write'], ['split', 'Split'], ['preview', 'Preview']] as [v, label]}
				<button type="button" class="pill" class:active={shown === v} class:split-only={v === 'split'}
					onclick={() => setView(v as View)}>{label}</button>
			{/each}
		</div>
		{#each LANGS as l}
			<button type="button" class:active={tab === l} onclick={() => (tab = l)}>
				{LANG_NAMES[l]}
				<i class:on={post.translations[l].exists}></i>
			</button>
		{/each}
	</div>

	{#each LANGS as l}
		<div class="pane" hidden={tab !== l}>
			{#if l !== 'en'}
				<div class="mt">
					{#if data.canTranslate}
						<button type="button" class="btn-outline" onclick={() => draftTranslation(l)}
							disabled={translating !== null || !post.translations.en.body.trim()}>
							{translating === l ? 'Translating…' : `Draft ${LANG_NAMES[l]} from English`}
						</button>
						<span>DeepL · a starting point to review, never saved on its own</span>
					{:else}
						<span>Machine translation is off — add <code>DEEPL_API_KEY</code> to enable “Draft from English”.</span>
					{/if}
				</div>
				{#if mtNote[l]}<p class="mt-note" class:err={!mtNote[l]?.ok} role="status">{mtNote[l]?.text}</p>{/if}
			{/if}
			<label>Title<input name="title_{l}" bind:value={post.translations[l].title} /></label>
			<label>Description
				<textarea name="description_{l}" rows="2" bind:value={post.translations[l].description}></textarea>
				<span class="count" class:warn={post.translations[l].description.length > 160 || (post.translations[l].description.length > 0 && post.translations[l].description.length < 120)}>
					{post.translations[l].description.length} chars (120–160 ideal)
				</span>
			</label>
			{#if isErasmus}
				<p class="fixed-note">
					<span>EU funding line</span>
					{post.translations[l].eu_funding_text || 'Added automatically when you save.'}
				</p>
			{/if}
			{#if l !== 'en'}
				<label class="check">
					<input type="checkbox" name="untranslated_{l}" bind:checked={post.translations[l].untranslated} />
					Mark as not yet translated (shows the “read it in another language” notice)
				</label>
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="writing" data-view={shown} onscrollcapture={onBodyScroll}>
				<div class="body-field">
					<!-- The form still submits Markdown; the editor is how it gets written. -->
					<input type="hidden" name="body_{l}" value={post.translations[l].body} />
					<RichEditor
						bind:this={editors[l]}
						bind:value={post.translations[l].body}
						imageUrl={(src) => imageSrc(src)}
						placeholder="Write the article. ⌘B bold, ⌘I italic, ⌘K link, ## for a heading."
					/>
				</div>
				{#if l === tab && shown !== 'write'}
					<div class="preview">
						<span class="preview-label">Preview · approximate — the live site is the reference</span>
						<ArticlePreview
							body={post.translations[l].body}
							title={post.translations[l].title}
							date={post.date}
							category={post.category}
							lang={l}
							slug={post.slug}
							siteUrl={data.siteUrl}
							pending={pendingUrls}
							{theme}
							syncRatio={shown === 'split' ? syncRatio : null}
						/>
					</div>
				{/if}
			</div>
			{#if l !== 'en' && !post.translations[l].exists}
				<p class="hint">
					No {LANG_NAMES[l]} file yet. Leaving the title empty keeps it that way — Hugo generates
					the “not yet translated” page automatically.
				</p>
			{:else if l !== 'en'}
				<label class="check danger-check">
					<input type="checkbox" name="delete_translation_{l}" bind:checked={removeTranslation[l]} />
					Delete the {LANG_NAMES[l]} translation on save
				</label>
				{#if removeTranslation[l]}
					<p class="hint">
						<strong>{LANG_NAMES[l]} will be deleted.</strong> Hugo will fall back to the
						“not yet translated” page. Recoverable only from git history.
					</p>
				{/if}
			{/if}
		</div>
	{/each}

	<div class="actions">
		<button type="submit" name="intent" value="save" disabled={saving}>
			{saving ? 'Saving…' : 'Save'}
		</button>
		<button
			type="submit"
			name="intent"
			value="publish"
			class="primary"
			disabled={saving || errors.length > 0}
			title={errors.length > 0 ? 'Fix the blocking problems above first' : ''}
		>
			Publish
		</button>
		{#if errors.length > 0}
			<span class="blocked">{errors.length} problem{errors.length === 1 ? '' : 's'} blocking publish</span>
		{/if}
		<button type="submit" formaction="?/review" class="btn-outline" disabled={saving || reviewing}>
			{reviewing ? 'Checking…' : 'Review changes'}
		</button>
		<span class="autosave {autosave}" aria-live="polite">
			{#if autosave === 'dirty'}Unsaved changes
			{:else if autosave === 'local'}Saved on this device
			{:else if autosave === 'saving'}Syncing draft…
			{:else if autosave === 'synced'}Draft synced{#if syncedAt}{' · '}{when(syncedAt)}{/if}
			{:else if autosave === 'offline'}Offline — kept on this device
			{:else if autosave === 'signedout'}Signed out — kept on this device. Sign in again in another tab, then keep typing.
			{/if}
		</span>
	</div>
	{#if pending.length > 0}
		<p class="note pending-note">Images you have added are not autosaved — Save to keep them.</p>
	{/if}
</form>

<section class="schedule">
	{#if data.scheduled?.state === 'pending'}
		<p class="scheduled-now">
			<strong>Publishing {whenLocal(data.scheduled.at)}</strong>
			{#if data.scheduled.newsletter}· the newsletter goes out once it is live{/if}
		</p>
		<form method="POST" action="?/unschedule" use:enhance>
			<button type="submit" class="linkish">Cancel that</button>
		</form>
	{:else if data.scheduled?.state === 'published' && data.scheduled.newsletter}
		<p class="scheduled-now">Published. The newsletter goes out as soon as the site has rebuilt.</p>
	{:else if data.scheduled?.error}
		<p class="msg err">Scheduled publishing failed: {data.scheduled.error}</p>
	{:else}
		<button type="button" class="linkish" onclick={openSchedule}>
			{showSchedule ? 'Cancel' : 'Publish this later'}
		</button>
		{#if showSchedule}
			<form method="POST" action="?/schedule" use:enhance>
				<input type="hidden" name="offset" value={offset} />
				<label>When
					<input type="datetime-local" name="at" step="3600" bind:value={scheduleAt} />
				</label>
				<label class="check">
					<input type="checkbox" name="newsletter" bind:checked={alsoNewsletter} disabled={!data.canSendNewsletter} />
					Send the newsletter too
				</label>
				<p class="hint">
					Goes live at the start of the hour you pick.
					{#if !data.canSendNewsletter}
						Sending needs RESEND_API_KEY.
					{:else if alsoNewsletter}
						The newsletter follows about ten minutes later, once the site has rebuilt, so the link in it works.
						<a href="/newsletter?slug={post.slug}" target="_blank" rel="noopener">See what the email looks like</a>.
					{:else}
						Nothing is emailed.
					{/if}
				</p>
				{#if !data.canRunOnSchedule}
					<p class="hint">Automatic publishing needs CRON_TOKEN; until then it happens the next time you open the portal.</p>
				{/if}
				<button type="submit" class="btn-primary">Schedule it</button>
			</form>
		{/if}
	{/if}
</section>

<section class="rename">
	<button type="button" class="linkish" onclick={() => { showRename = !showRename; newSlug = showRename ? post.slug : ''; }}>
		{showRename ? 'Cancel' : 'Change the web address'}
	</button>
	{#if showRename}
		<form method="POST" action="?/rename" use:enhance={() => { renaming = true; return async ({ update }) => { await update(); renaming = false; }; }}>
			<p>
				Moves the whole bundle — every language file and all {post.images.length} image{post.images.length === 1 ? '' : 's'} —
				and updates any article that links here, in one commit.
			</p>
			<label>New address
				<input name="slug" bind:value={newSlug} autocomplete="off" spellcheck="false" placeholder={post.slug} />
			</label>
			<p class="urls">
				{#if slugOk}
					<code>{data.siteUrl}/en/blog/{newSlug}/</code>
				{:else if newSlug && newSlug !== post.slug}
					<span class="bad">Lowercase letters, digits and single hyphens only.</span>
				{/if}
			</p>
			<label class="check">
				<!-- The intent travels in a hidden field: an unticked checkbox submits
				     nothing at all, which would read as "no answer" and keep the redirect. -->
				<input type="hidden" name="redirect" value={keepRedirect ? 'on' : 'off'} />
				<input type="checkbox" bind:checked={keepRedirect} />
				Leave a redirect at the old address
			</label>
			<p class="hint">
				{#if keepRedirect}
					Anyone following an old link — a newsletter, a search result, someone else's page — lands on the new one.
				{:else}
					<strong>Old links break.</strong> The old address keeps serving the old copy until the host is cleaned out,
					because a build never removes files it no longer produces.
				{/if}
			</p>
			<button type="submit" class="btn-primary" disabled={!slugOk || renaming}>
				{renaming ? 'Moving…' : 'Change address'}
			</button>
		</form>
	{/if}
</section>

<section class="danger-zone">
	<button type="button" class="linkish" onclick={() => (showDanger = !showDanger)}>
		{showDanger ? 'Cancel' : 'Delete this article'}
	</button>
	{#if showDanger}
		<form method="POST" action="?/delete" use:enhance>
			<p>
				Deletes every language file and all {post.images.length} image{post.images.length === 1 ? '' : 's'}
				in <code>content/blog/{post.slug}/</code>. Recoverable only from git history. Type the slug
				to confirm.
			</p>
			<input name="confirm" bind:value={confirmSlug} placeholder={post.slug} autocomplete="off" />
			<button type="submit" class="danger" disabled={confirmSlug !== post.slug}>
				Delete {post.slug}
			</button>
		</form>
	{/if}
</section>

<style>
	.head { margin-bottom: 1.25rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted-foreground); }
	h1 { font-size: 1.4rem; margin: 0.35rem 0 0.15rem; letter-spacing: -0.015em; }
	code { font-size: 0.78rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.shared { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: 0.75rem; align-items: end; }
	fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.9rem 1rem 1rem; margin: 1.25rem 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: 0.75rem; }
	legend { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); padding: 0 0.35rem; }
	.danger-check { color: var(--danger); }
	.schedule { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	.schedule form { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; max-width: 34rem; margin-top: 0.6rem; }
	.schedule .hint { margin: 0; font-size: 0.84rem; color: var(--muted-foreground); }
	.scheduled-now { margin: 0 0 0.3rem; font-size: 0.9rem; }
	.rename { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	.rename form { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; max-width: 34rem; }
	.rename p { margin: 0; font-size: 0.86rem; color: var(--muted-foreground); }
	.rename .urls { min-height: 1.2rem; }
	.rename .urls code { color: var(--ok); }
	.rename .bad { color: var(--danger); font-size: 0.82rem; }
	.rename label { width: 100%; }
	label.check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--foreground); }
	label.check input { width: auto; margin: 0; }
	.count { font-size: 0.72rem; color: var(--muted-foreground); }
	.count.warn { color: var(--warn); }
	.hint { font-size: 0.82rem; color: var(--warn); margin: 0.5rem 0 0; }
	.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 1.75rem 0 0.9rem; border-bottom: 1px solid var(--border); }
	.tabs > button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.5rem 0.8rem; cursor: pointer; color: var(--muted-foreground); font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
	.tabs > button.active { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 600; }
	.tabs i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); display: inline-block; }
	.tabs i.on { background: var(--primary); }
	.pane { display: grid; gap: 0.85rem; }
	.restore {
		display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
		margin: 0 0 1.25rem; padding: 0.9rem 1.1rem; border-radius: var(--radius);
		background: var(--brand-yellow-soft); border: 1px solid var(--brand-yellow-deep);
	}
	.restore.stale { background: var(--warn-bg); border-color: var(--warn); }
	.restore > div:first-child { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 14rem; }
	.restore span { font-size: 0.84rem; color: var(--muted-foreground); }
	.restore-actions { display: flex; gap: 0.5rem; }

	.view-switch { display: flex; gap: 0.3rem; margin-right: auto; padding-bottom: 0.4rem; }
	.view-switch .pill { font-size: 0.78rem; padding: 0.22rem 0.7rem; }

	.writing { display: grid; gap: 1rem; }
	.writing[data-view='split'] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
	/* Preview-only keeps the textarea in the form (it must still submit) but out of sight. */
	.writing[data-view='preview'] .body-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
	.preview { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
	.preview-label { font-size: 0.72rem; color: var(--muted-foreground); }
	.preview { height: 75vh; }
	.writing[data-view='split'] :global(.editor .surface) { max-height: calc(75vh - 2.5rem); }
	@media (max-width: 1100px) {
		.split-only { display: none; }
	}
	@media (max-width: 560px) {
		/* The layout switch gets its own row so all three languages fit. */
		.view-switch { flex-basis: 100%; }
		.tabs > button { padding: 0.5rem 0.6rem; }
	}

	.mt { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.55rem 0.75rem; border: 1px dashed var(--border); border-radius: var(--radius); }
	.mt span { font-size: 0.8rem; color: var(--muted-foreground); }
	.mt .btn-outline { font-size: 0.85rem; padding: 0.35rem 0.85rem; }
	.mt-note { margin: 0; font-size: 0.84rem; color: var(--ok); }
	.mt-note.err { color: var(--danger); }
	.fixed-note { margin: 0; font-size: 0.86rem; color: var(--muted-foreground); }
	.fixed-note span { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.15rem; font-family: 'DM Sans', system-ui, sans-serif; }

	.review { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; margin: 0 0 1.25rem; }
	.review h2 { font-size: 0.95rem; margin: 0 0 0.75rem; display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
	.review .msgline { font-weight: 400; font-size: 0.8rem; color: var(--muted-foreground); }
	.file { border-top: 1px solid var(--border); padding: 0.7rem 0 0.2rem; }
	.file header { display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; margin-bottom: 0.4rem; }
	.status { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 4px; background: var(--muted); color: var(--muted-foreground); }
	.status.added { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
	.status.deleted { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
	.counts { font-size: 0.75rem; font-family: ui-monospace, monospace; }
	.plus { color: var(--ok); }
	.minus { color: var(--danger); }
	.review pre { margin: 0; padding: 0.5rem 0.6rem; background: var(--muted); border-radius: 6px; font-size: 0.76rem; line-height: 1.5; overflow-x: auto; font-family: ui-monospace, monospace; }
	.review pre span { display: block; white-space: pre; }
	.review pre .add { color: var(--ok); }
	.review pre .remove { color: var(--danger); }
	.review pre .gap { color: var(--muted-foreground); }

	.autosave { margin-left: auto; font-size: 0.8rem; color: var(--muted-foreground); align-self: center; }
	.autosave.dirty { color: var(--warn); }
	.autosave.synced, .autosave.local { color: var(--ok); }
	.autosave.offline, .autosave.signedout { color: var(--warn); }
	.pending-note { margin: 0.25rem 0 0; }

	.danger-zone { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.linkish { background: none; border: 0; color: var(--danger); font-size: 0.85rem; cursor: pointer; padding: 0; }
	.danger-zone form { margin-top: 0.75rem; display: grid; gap: 0.5rem; max-width: 30rem; }
	.danger-zone p { font-size: 0.85rem; color: var(--muted-foreground); margin: 0; }
	.danger-zone input { padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
	.danger-zone .danger { justify-self: start; padding: 0.5rem 1rem; border: 1px solid var(--danger);
		border-radius: 8px; background: none; color: var(--danger); font-weight: 600; cursor: pointer; }
	.danger-zone .danger:disabled { opacity: 0.4; cursor: default; }

	.findings { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
		padding: 0.85rem 1rem; margin-bottom: 1.25rem; }
	.findings h2 { font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em;
		color: var(--muted-foreground); margin: 0 0 0.55rem; }
	.findings ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
	.findings li { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; }
	.findings .sev { flex: none; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
		font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px; }
	.findings li.error .sev { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
	.findings li.warning .sev { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
	.findings .lang { flex: none; font-variant: small-caps; font-weight: 700; color: var(--muted-foreground); font-size: 0.75rem; }
	.blocked { align-self: center; font-size: 0.8rem; color: var(--danger); }

	fieldset.images { display: block; }
	.picker { display: inline-block; cursor: pointer; }
	.picker input { display: none; }
	.picker span {
		display: inline-block; padding: 0.45rem 0.85rem; border: 1px dashed var(--border);
		border-radius: 8px; font-size: 0.85rem; color: var(--muted-foreground);
	}
	.picker:hover span { color: var(--foreground); border-color: var(--primary); }
	.note { font-size: 0.78rem; color: var(--muted-foreground); margin: 0.5rem 0 0; }
	.empty { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.75rem 0 0; }
	.grid { list-style: none; padding: 0; margin: 0.9rem 0 0; display: grid; gap: 0.75rem;
		grid-template-columns: repeat(auto-fill, minmax(min(11rem, 100%), 1fr)); }
	.grid li { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; display: grid; gap: 0.35rem; }
	.grid li.new { border-color: var(--brand-yellow-deep); background: var(--brand-yellow-soft); }
	.grid li.removing { opacity: 0.45; border-color: var(--danger); }
	.grid img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 5px; background: var(--background); }
	.grid code { font-size: 0.7rem; word-break: break-all; color: var(--muted-foreground); }
	.grid .meta { font-size: 0.68rem; color: var(--muted-foreground); }
	.grid .alt { font-size: 0.75rem; padding: 0.3rem 0.4rem; margin: 0; }
	.grid .row { display: flex; gap: 0.3rem; }
	.grid .row button { flex: 1; font-size: 0.75rem; padding: 0.28rem; border: 1px solid var(--border);
		border-radius: 5px; background: var(--card); cursor: pointer; }
	.grid .row button.danger { color: var(--danger); }
	.actions { display: flex; gap: 0.6rem; margin-top: 1.5rem; position: sticky; bottom: 0; padding: 1rem 0; background: linear-gradient(transparent, var(--background) 35%); }
	.actions button { padding: 0.6rem 1.1rem; border-radius: 8px; border: 1px solid var(--border); background: var(--card); cursor: pointer; font-weight: 600; font-size: 0.9rem; }
	.actions button.primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
	.actions button:disabled { opacity: 0.6; cursor: default; }
</style>
