<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { prepareImage, formatBytes, ImageError, type PreparedImage } from '$lib/client/image';
	import { onMount } from 'svelte';
	import ArticlePreview from '$lib/components/ArticlePreview.svelte';
	import RichEditor from '$lib/components/RichEditor.svelte';
	import FileChanges from '$lib/components/FileChanges.svelte';
	import HistoryPanel from '$lib/components/HistoryPanel.svelte';
	import SiteChecks from '$lib/components/SiteChecks.svelte';
	import { thumbnailOf } from '$lib/thumbnail';
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
	let copied = $state(false);
	async function copyLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {}
	}
	let scheduleDay = $state('');
	let alsoNewsletter = $state(false);
	// Always shown in Paris time, which is when it actually goes live.
	const whenLocal = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', {
			timeZone: 'Europe/Paris',
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	// The day after today in Paris: the earliest allowed, and the most likely answer.
	const tomorrow = $derived.by(() => {
		const d = new Date(`${data.today}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + 1);
		return d.toISOString().slice(0, 10);
	});

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

	// What the site will show: the chosen image, else the first one in the English text.
	const thumbnail = $derived(thumbnailOf(post.featured_image, post.translations.en.body));

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

	/** One row of tiles: committed pictures, then the ones staged in this browser. */
	let activeImg = $state<string | null>(null);
	const strip = $derived([
		...post.images.map((name) => ({ name, pending: false, src: `/api/image/${post.slug}/${name}`, removing: removed.includes(name) })),
		...pending.map((p) => ({ name: p.name, pending: true, src: p.previewUrl, removing: false }))
	]);
	const activeItem = $derived(strip.find((s) => s.name === activeImg));

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		imgError = '';
		for (const file of Array.from(input.files ?? [])) {
			try {
				pending.push(await prepareImage(file, [...post.images, ...pending.map((p) => p.name)]));
				activeImg = pending[pending.length - 1].name;
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

	/**
	 * Fills the editor from an earlier committed version. Whether it is a draft
	 * stays as it is now: going back to old wording should not also unpublish
	 * or publish the article.
	 */
	type Version = {
		shared: { date: string; category: string; featured_image?: string; partner_name?: string; partner_url?: string; partner_logo_url?: string; project_url?: string };
		translations: Record<'en' | 'fr' | 'it', { title: string; description: string; body: string; untranslated: boolean }>;
	};
	function restoreVersion(v: Version) {
		Object.assign(post, {
			date: v.shared.date, category: v.shared.category,
			featured_image: v.shared.featured_image, partner_name: v.shared.partner_name, partner_url: v.shared.partner_url,
			partner_logo_url: v.shared.partner_logo_url, project_url: v.shared.project_url
		});
		for (const l of LANGS) {
			const t = v.translations[l];
			Object.assign(post.translations[l], { title: t.title, description: t.description, body: t.body, untranslated: t.untranslated });
		}
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

{#snippet statusMessages()}
	{#if form?.message}<p class="msg err">{form.message}</p>{/if}
	{#if data.renamedFrom}
		<p class="msg ok">
			Moved from <code>{data.renamedFrom}</code>. The old address
			{#if data.renamedRedirect}redirects here once the site rebuilds.{:else}is no longer served by this article.{/if}
		</p>
	{/if}
	{#if form?.success}<p class="msg ok">Saved{form.published ? ' and published' : ''}. The site updates in a minute or two.</p>{/if}
	{#if form?.scheduled}<p class="msg ok">Scheduled for {whenLocal(form.at)}{form.newsletter ? ', newsletter included' : ''}.</p>{/if}
	{#if form?.unscheduled}<p class="msg ok">No longer scheduled.</p>{/if}
{/snippet}

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
				activeImg = null;
				markCommitted();
			}
		};
	}}>
	<header class="bar">
		<div class="id">
			<a class="back" href="/posts">← Articles</a>
			<h1>{post.translations.en.title || post.slug}</h1>
			<div class="sub">
				<span class="chip" class:draft={post.draft}>{post.draft ? 'Draft' : 'Published'}</span>
				{#if data.scheduled?.state === 'pending'}
					<span class="chip sched">Publishing {whenLocal(data.scheduled.at)}</span>
				{/if}
			</div>
		</div>
		<div class="actions">
			<span class="autosave {autosave}" aria-live="polite">
				{#if autosave === 'dirty'}Unsaved changes
				{:else if autosave === 'local'}Saved on this device
				{:else if autosave === 'saving'}Syncing draft…
				{:else if autosave === 'synced'}Draft synced{#if syncedAt}{' · '}{when(syncedAt)}{/if}
				{:else if autosave === 'offline'}Offline — kept on this device
				{:else if autosave === 'signedout'}Signed out — kept on this device
				{/if}
			</span>
			<button type="submit" formaction="?/review" class="btn-ghost btn-sm" disabled={saving || reviewing}>
				{reviewing ? 'Checking…' : 'Review changes'}
			</button>
			<button type="submit" name="intent" value="save" class="btn-outline btn-sm" disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</button>
			<button
				type="submit"
				name="intent"
				value="publish"
				class="btn-primary btn-sm"
				disabled={saving || errors.length > 0}
				title={errors.length > 0 ? 'Fix the blocking problems first' : ''}
			>
				Publish
			</button>
		</div>
	</header>

	{#if form?.review}
		{@const r = form.review}
		<section class="review">
			<h2>
				{r.changes.length === 0 ? 'Nothing to save' : `${r.changes.length} file${r.changes.length === 1 ? '' : 's'} would change`}
				<span class="msgline">{r.message}{r.draft ? ' · stays a draft' : ''}</span>
			</h2>
			{#if r.changes.length === 0}
				<p class="hint">This article is already exactly as written here.</p>
			{/if}
			<FileChanges changes={r.changes} />
			<p class="hint">Nothing has been saved yet — this is what Save or Publish would change on the site.</p>
		</section>
	{/if}

	{@render statusMessages()}

	{#if findings.length > 0}
		<details class="findings" open={errors.length > 0}>
			<summary>
				{#if errors.length > 0}<span class="sev error">{errors.length} to fix before publishing</span>{/if}
				{#if warnings.length > 0}<span class="sev warning">{warnings.length} suggestion{warnings.length === 1 ? '' : 's'}</span>{/if}
			</summary>
			<ul>
				{#each findings as f}
					<li class={f.severity}>
						{#if f.lang}<span class="lang">{f.lang}</span>{/if}
						<span>{f.message}</span>
					</li>
				{/each}
			</ul>
			{#if errors.length === 0}<p class="note">Suggestions never block publishing.</p>{/if}
		</details>
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
				<button type="button" class="btn-primary btn-sm" onclick={restoreDraft}>Restore</button>
				<button type="button" class="btn-outline btn-sm" onclick={discardDraft}>Discard</button>
			</div>
		</section>
	{/if}

	<div class="meta">
		<label>Date<input name="date" bind:value={post.date} placeholder="YYYY-MM-DD" /></label>
		<label>Category
			<select name="category" bind:value={post.category}>
				{#each data.categories as c}<option>{c}</option>{/each}
			</select>
		</label>
		<label class="check"><input type="checkbox" name="draft" bind:checked={post.draft} /> Draft</label>
		<!-- Chosen from the picture strip below ("Use as thumbnail"). -->
		<input type="hidden" name="featured_image" value={post.featured_image ?? ''} />
		{#if post.featured_image && !allImages.includes(post.featured_image)}
			<p class="hint">Thumbnail <code>{post.featured_image}</code> is missing from the bundle.</p>
		{/if}
	</div>

	{#if isErasmus}
		<details class="partner" open={missingPartner}>
			<summary>
				Erasmus+ partner strip
				<em>{post.partner_name || 'not set'}</em>
				{#if missingPartner}<span class="need">name and URL needed</span>{/if}
			</summary>
			<div class="partner-fields">
				<label>Partner name<input name="partner_name" bind:value={post.partner_name} /></label>
				<label>Partner URL<input name="partner_url" bind:value={post.partner_url} /></label>
				<label>Partner logo
					<select name="partner_logo_url" bind:value={post.partner_logo_url}>
						<option value="">— none —</option>
						{#each optionsFor(post.partner_logo_url) as o}<option value={o.value}>{o.label}</option>{/each}
					</select>
				</label>
				<label>Project URL<input name="project_url" bind:value={post.project_url} /></label>
			</div>
			<p class="fixed-note"><span>EU funding line</span>{post.translations[tab].eu_funding_text || 'Added automatically when you save.'}</p>
		</details>
	{/if}

	<div class="strip" aria-label="Pictures in this article">
		<label class="add" title="Resized to 1600px and converted to WebP in your browser. EXIF data, including GPS location, is stripped.">
			<input type="file" accept="image/*" multiple onchange={onFiles} />
			<span class="plus">+</span>
			<small>Add</small>
		</label>
		{#each strip as s (s.name)}
			<button
				type="button"
				class="tile"
				class:on={activeImg === s.name}
				class:removing={s.removing}
				class:new={s.pending}
				title={s.name}
				onclick={() => (activeImg = activeImg === s.name ? null : s.name)}
			>
				<img src={s.src} alt="" loading="lazy" />
				{#if thumbnail === s.name}<b class="star" title="Thumbnail">★</b>{/if}
			</button>
		{/each}
		{#if strip.length === 0}<span class="empty">No pictures yet. They appear in the article as you insert them.</span>{/if}
	</div>
	{#if imgError}<p class="hint">{imgError}</p>{/if}

	{#if activeItem}
		{@const s = activeItem}
		{@const p = pending.find((x) => x.name === s.name)}
		<div class="picked">
			<img src={s.src} alt="" />
			<div class="picked-body">
				<div class="picked-top">
					<code>{s.name}</code>
					{#if p}<span class="meta-line">{p.width}×{p.height} · {formatBytes(p.originalBytes)} → {formatBytes(p.blob.size)}</span>{/if}
				</div>
				<input class="alt" placeholder="Describe the picture (alt text)" bind:value={altText[s.name]} />
				<div class="picked-actions">
					<button type="button" class="btn-primary btn-sm" onclick={() => insert(s.name)}>Insert in {LANG_NAMES[tab]} text</button>
					{#if thumbnail === s.name}
						<span class="is-thumb">★ Thumbnail{post.featured_image ? '' : ' (first picture)'}</span>
						{#if post.featured_image}
							<button type="button" class="btn-ghost btn-sm" onclick={() => (post.featured_image = '')}>Use the first picture</button>
						{/if}
					{:else if s.name !== post.partner_logo_url}
						<button type="button" class="btn-outline btn-sm" onclick={() => (post.featured_image = s.name)}>Use as thumbnail</button>
					{/if}
					{#if s.pending}
						<button type="button" class="btn-danger-quiet btn-sm" onclick={() => { dropPending(s.name); activeImg = null; }}>Discard</button>
					{:else}
						<button type="button" class="btn-danger-quiet btn-sm" onclick={() => toggleRemove(s.name)}>{removed.includes(s.name) ? 'Keep' : 'Delete'}</button>
					{/if}
				</div>
				{#if removed.includes(s.name) && usedBy(s.name)}
					<p class="hint">Still referenced — remove the reference or it won't save.</p>
				{/if}
			</div>
		</div>
	{/if}
	{#if pending.length}
		<p class="note">{pending.length} picture{pending.length > 1 ? 's' : ''} will be committed with your next save (pictures are not autosaved).</p>
	{/if}

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
						<button type="button" class="btn-outline btn-sm" onclick={() => draftTranslation(l)}
							disabled={translating !== null || !post.translations.en.body.trim()}>
							{translating === l ? 'Translating…' : `Draft ${LANG_NAMES[l]} from English`}
						</button>
						<span>DeepL · a starting point to review, never saved on its own</span>
					{:else}
						<span>Machine translation isn’t connected yet — <a href="/settings#connections">connect it in Settings</a> to draft from English.</span>
					{/if}
				</div>
				{#if mtNote[l]}<p class="mt-note" class:err={!mtNote[l]?.ok} role="status">{mtNote[l]?.text}</p>{/if}
			{/if}
			<div class="headline">
				<label>Title<input name="title_{l}" bind:value={post.translations[l].title} /></label>
				<label>
					<span class="lbl">Description
						<span class="count" class:warn={post.translations[l].description.length > 160 || (post.translations[l].description.length > 0 && post.translations[l].description.length < 120)}>
							{post.translations[l].description.length} / 120–160
						</span>
					</span>
					<textarea name="description_{l}" rows="2" bind:value={post.translations[l].description}></textarea>
				</label>
			</div>
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
			{#if l !== 'en'}
				{#if !post.translations[l].exists}
					<p class="hint">
						There is no {LANG_NAMES[l]} version yet. Leave the title empty and visitors see a notice
						that this article is not translated yet.
					</p>
				{/if}
				<div class="tr-options">
					<label class="check">
						<input type="checkbox" name="untranslated_{l}" bind:checked={post.translations[l].untranslated} />
						Show the “read it in another language” notice
					</label>
					{#if post.translations[l].exists}
						<label class="check danger-check">
							<input type="checkbox" name="delete_translation_{l}" bind:checked={removeTranslation[l]} />
							Delete this translation on save
						</label>
					{/if}
				</div>
				{#if removeTranslation[l]}
					<p class="hint">
						<strong>{LANG_NAMES[l]} will be deleted.</strong> Visitors will see a notice that this
						article is not translated yet. It can be brought back from History.
					</p>
				{/if}
			{/if}
		</div>
	{/each}
</form>

<section class="more" aria-label="More about this article">
	<details>
		<summary>Preview link{#if data.share}<em>active until {new Date(data.share.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</em>{/if}</summary>
		<div class="body">
			{#if data.share}
				<div class="share-row">
					<input readonly value={data.share.url} aria-label="Preview link" onfocus={(e) => e.currentTarget.select()} />
					<button type="button" class="btn-outline btn-sm" onclick={() => copyLink(data.share!.url)}>{copied ? 'Copied' : 'Copy'}</button>
					<a class="btn-outline btn-sm" href={data.share.url} target="_blank" rel="noopener">Open</a>
					<form method="POST" action="?/share" use:enhance><button type="submit" class="btn-ghost btn-sm" title="Replaces this link with a new one, so the old one stops working">New link</button></form>
					<form method="POST" action="?/unshare" use:enhance><button type="submit" class="btn-danger-quiet btn-sm">Stop sharing</button></form>
				</div>
				<p class="hint">
					Anyone with this link can read the article until {new Date(data.share.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}, with no account.
					It shows {data.share.autosave ? 'your latest autosaved text' : 'the saved article'}, and nothing is published.
				</p>
			{:else}
				<p class="hint">A private link to read this article as it looks now, including what you have not saved yet. Nothing is published, and it stops working after 7 days.</p>
				<form method="POST" action="?/share" use:enhance><button type="submit" class="btn-outline btn-sm">Create a preview link</button></form>
			{/if}
		</div>
	</details>

	{#if data.webUrls.length > 0}
		<details>
			<summary>On the web <em>Google index and speed</em></summary>
			<div class="body checks-body"><SiteChecks urls={data.webUrls} googleReady={data.googleReady} /></div>
		</details>
	{/if}

	<details open={data.scheduled?.state === 'pending' || !!data.scheduled?.error}
		ontoggle={(e) => { if (e.currentTarget.open && !scheduleDay) scheduleDay = tomorrow; }}>
		<summary>
			{#if data.scheduled?.state === 'pending'}Scheduled<em>{whenLocal(data.scheduled.at)}</em>{:else}Publish later{/if}
		</summary>
		<div class="body">
			{#if data.scheduled?.state === 'pending'}
				<p class="scheduled-now">
					<strong>Publishing {whenLocal(data.scheduled.at)}</strong>
					{#if data.scheduled.newsletter}· the newsletter goes out once it is live{/if}
				</p>
				<form method="POST" action="?/unschedule" use:enhance>
					<button type="submit" class="btn-outline btn-sm">Cancel that</button>
				</form>
			{:else if data.scheduled?.state === 'published' && data.scheduled.newsletter}
				<p class="scheduled-now">
					{#if data.scheduled.announceAt && !data.scheduled.announcedAt}
						Published. The newsletter is scheduled for <strong>{whenLocal(data.scheduled.announceAt)}</strong>. <a href="/newsletter?slug={post.slug}">Change it</a>
					{:else}
						Published. The newsletter goes out as soon as the site has rebuilt.
					{/if}
				</p>
			{:else}
				{#if data.scheduled?.error}
					<p class="msg err">Scheduled publishing failed: {data.scheduled.error}</p>
				{/if}
				<form method="POST" action="?/schedule" use:enhance class="stack">
					<label>Day
						<input type="date" name="day" min={tomorrow} bind:value={scheduleDay} />
					</label>
					<label class="check">
						<input type="checkbox" name="newsletter" bind:checked={alsoNewsletter} disabled={!data.canSendNewsletter} />
						Send the newsletter too
					</label>
					<p class="hint">
						Goes live at 9:00 (Paris time) on the day you pick.
						{#if !data.canSendNewsletter}
							Sending email isn’t connected yet.
						{:else if alsoNewsletter}
							The newsletter follows at 9:30, once the site has rebuilt, so the link in it works.
							<a href="/newsletter?slug={post.slug}" target="_blank" rel="noopener">See what the email looks like</a>.
						{:else}
							Nothing is emailed.
						{/if}
					</p>
					{#if !data.canRunOnSchedule}
						<p class="hint">Automatic publishing isn’t set up yet, so it happens the next time you open the portal on or after that day.</p>
					{/if}
					<button type="submit" class="btn-primary btn-sm">Schedule it</button>
				</form>
			{/if}
		</div>
	</details>

	<details ontoggle={(e) => { newSlug = e.currentTarget.open ? post.slug : ''; }}>
		<summary>Web address <em>/blog/{post.slug}/</em></summary>
		<div class="body">
			<form method="POST" action="?/rename" use:enhance={() => { renaming = true; return async ({ update }) => { await update(); renaming = false; }; }} class="stack">
				<p>
					Moves the article in every language, with its {post.images.length} picture{post.images.length === 1 ? '' : 's'},
					and updates any article that links to it.
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
						<strong>Old links break.</strong> For a while the old address may still show the old copy, then stop working.
					{/if}
				</p>
				<button type="submit" class="btn-primary btn-sm" disabled={!slugOk || renaming}>
					{renaming ? 'Moving…' : 'Change address'}
				</button>
			</form>
		</div>
	</details>

	<HistoryPanel
		endpoint="/api/history/posts/{post.slug}"
		onRestore={(v: Version) => restoreVersion(v)}
		note="Every save is kept. Loading an older version fills the editor with its text; images stay as they are now."
	/>

	<details class="danger-zone">
		<summary>Delete this article</summary>
		<div class="body">
			<form method="POST" action="?/delete" use:enhance class="stack">
				<p>
					Deletes the article in every language, with its {post.images.length} picture{post.images.length === 1 ? '' : 's'}.
					It can be brought back only by a developer, from the saved versions on GitHub. Type
					<strong>{post.slug}</strong> to confirm.
				</p>
				<input name="confirm" bind:value={confirmSlug} placeholder={post.slug} autocomplete="off" />
				<button type="submit" class="btn-danger btn-sm" disabled={confirmSlug !== post.slug}>
					Delete {post.slug}
				</button>
			</form>
		</div>
	</details>
</section>

<style>
	code { font-size: 0.78rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; }
	.msg { padding: 0.6rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 0.75rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.hint { font-size: 0.82rem; color: var(--warn); margin: 0.4rem 0 0; }
	.note { font-size: 0.78rem; color: var(--muted-foreground); margin: 0.4rem 0 0; }

	/* The title, the state and the buttons stay in view while writing. */
	.bar {
		position: sticky; top: 0; z-index: 6; display: flex; align-items: flex-end; justify-content: space-between;
		gap: 1rem; flex-wrap: wrap; padding: 0.4rem 0 0.7rem; margin-bottom: 0.9rem;
		background: var(--background); border-bottom: 1px solid var(--border);
	}
	.id { min-width: 0; }
	.back { font-size: 0.8rem; text-decoration: none; color: var(--muted-foreground); }
	h1 { font-size: 1.25rem; margin: 0.15rem 0 0.2rem; letter-spacing: -0.015em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38rem; }
	.sub { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.chip { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.45rem; border-radius: 999px; background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
	.chip.draft { background: var(--warn-bg); color: var(--warn); }
	.chip.sched { background: var(--accent); color: var(--accent-foreground); }
	.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.autosave { font-size: 0.78rem; color: var(--muted-foreground); margin-right: 0.25rem; }
	.autosave.dirty, .autosave.offline, .autosave.signedout { color: var(--warn); }
	.autosave.synced, .autosave.local { color: var(--ok); }

	.meta { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
	.meta label:not(.check) { width: 11rem; }
	.meta .check { padding-bottom: 0.6rem; }
	.meta .hint { flex-basis: 100%; margin: 0; }
	label.check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--foreground); }
	label.check input { width: auto; margin: 0; }

	.partner { margin-top: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.45rem 0.8rem; }
	.partner summary { cursor: pointer; font-size: 0.85rem; font-weight: 500; display: flex; gap: 0.6rem; align-items: baseline; }
	.partner summary em { font-style: normal; color: var(--muted-foreground); font-weight: 400; }
	.partner .need { color: var(--warn); font-size: 0.78rem; }
	.partner-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: 0.6rem; margin-top: 0.6rem; }
	.fixed-note { margin: 0.6rem 0 0; font-size: 0.8rem; color: var(--muted-foreground); }
	.fixed-note span { text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.68rem; margin-right: 0.5rem; }

	/* Pictures: a single row of small tiles; the one picked opens below it. */
	.strip { display: flex; gap: 0.45rem; align-items: center; margin-top: 0.9rem; overflow-x: auto; padding: 0.2rem 0.1rem 0.35rem; }
	.add { flex: none; width: 3.75rem; height: 3.75rem; border: 1px dashed var(--border); border-radius: 8px; display: grid; place-content: center; text-align: center; cursor: pointer; color: var(--muted-foreground); gap: 0; }
	.add input { display: none; }
	.add .plus { font-size: 1.3rem; line-height: 1; }
	.add small { font-size: 0.68rem; }
	.add:hover { color: var(--foreground); border-color: var(--primary); }
	.tile { flex: none; position: relative; width: 3.75rem; height: 3.75rem; padding: 0; border: 2px solid transparent; border-radius: 8px; background: var(--card); cursor: pointer; overflow: hidden; }
	.tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.tile.on { border-color: var(--primary); }
	.tile.new { border-color: var(--brand-yellow-deep); }
	.tile.removing { opacity: 0.4; border-color: var(--danger); }
	.star { position: absolute; top: 2px; right: 3px; font-size: 0.8rem; color: #fff; text-shadow: 0 0 3px rgba(0, 0, 0, 0.8); }
	.empty { font-size: 0.8rem; color: var(--muted-foreground); }

	.picked { display: flex; gap: 0.8rem; align-items: flex-start; margin-top: 0.4rem; padding: 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
	.picked > img { width: 7rem; aspect-ratio: 4/3; object-fit: cover; border-radius: 6px; flex: none; }
	.picked-body { flex: 1; min-width: 0; display: grid; gap: 0.45rem; }
	.picked-top { display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
	.picked-top code { word-break: break-all; }
	.meta-line { font-size: 0.72rem; color: var(--muted-foreground); }
	.alt { margin: 0; font-size: 0.85rem; padding: 0.4rem 0.55rem; width: 100%; }
	.picked-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.is-thumb { font-size: 0.78rem; font-weight: 600; color: var(--primary); }

	.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.9rem 0 0.7rem; border-bottom: 1px solid var(--border); }
	.tabs > button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.4rem 0.8rem; cursor: pointer; color: var(--muted-foreground); font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
	.tabs > button.active { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 600; }
	.tabs i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); display: inline-block; }
	.tabs i.on { background: var(--primary); }
	.view-switch { display: flex; gap: 0.3rem; margin-right: auto; padding-bottom: 0.35rem; }
	.view-switch .pill { font-size: 0.78rem; padding: 0.2rem 0.7rem; }

	.pane { display: grid; gap: 0.65rem; }
	.headline { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 0.75rem; align-items: start; }
	.headline textarea { resize: vertical; }
	.lbl { display: flex; justify-content: space-between; align-items: baseline; }
	.count { font-size: 0.72rem; color: var(--muted-foreground); font-weight: 400; }
	.count.warn { color: var(--warn); }
	.tr-options { display: flex; gap: 1.25rem; flex-wrap: wrap; }
	.danger-check { color: var(--danger); }

	.writing { display: grid; gap: 1rem; }
	.writing[data-view='split'] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
	/* Preview-only keeps the textarea in the form (it must still submit) but out of sight. */
	.writing[data-view='preview'] .body-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
	.preview { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; height: 75vh; }
	.preview-label { font-size: 0.72rem; color: var(--muted-foreground); }
	.writing[data-view='split'] :global(.editor .surface) { max-height: calc(75vh - 2.5rem); }
	.writing :global(.editor .surface) { min-height: 26rem; max-height: 78vh; }

	.mt { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.4rem 0.65rem; border: 1px dashed var(--border); border-radius: var(--radius); }
	.mt span { font-size: 0.8rem; color: var(--muted-foreground); }
	.mt-note { margin: 0; font-size: 0.84rem; color: var(--ok); }
	.mt-note.err { color: var(--danger); }

	.review { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.9rem 1.1rem; margin: 0 0 0.9rem; }
	.review h2 { font-size: 0.95rem; margin: 0 0 0.75rem; display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
	.review .msgline { font-weight: 400; font-size: 0.8rem; color: var(--muted-foreground); }

	.restore { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 0 0 0.9rem; padding: 0.7rem 1rem; border-radius: var(--radius); background: var(--brand-yellow-soft); border: 1px solid var(--brand-yellow-deep); }
	.restore.stale { background: var(--warn-bg); border-color: var(--warn); }
	.restore > div:first-child { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 14rem; }
	.restore span { font-size: 0.84rem; color: var(--muted-foreground); }
	.restore-actions { display: flex; gap: 0.5rem; }

	.findings { margin: 0 0 0.9rem; font-size: 0.85rem; }
	.findings summary { cursor: pointer; display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.findings ul { list-style: none; padding: 0; margin: 0.5rem 0 0; display: grid; gap: 0.3rem; }
	.findings li { display: flex; gap: 0.5rem; align-items: baseline; }
	.findings .sev { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; }
	.findings .sev.error { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
	.findings .sev.warning { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
	.findings .lang { font-variant: small-caps; font-weight: 700; color: var(--muted-foreground); font-size: 0.75rem; }

	/* Everything seldom needed, folded into one list. */
	.more { margin-top: 2rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
	.more :global(details) { border-top: 1px solid var(--border); }
	.more :global(details:first-child) { border-top: 0; }
	.more :global(summary) { cursor: pointer; padding: 0.65rem 1rem; font-size: 0.88rem; font-weight: 500; color: var(--foreground); display: flex; gap: 0.6rem; align-items: baseline; list-style: none; }
	.more :global(summary::-webkit-details-marker) { display: none; }
	.more :global(summary::before) { content: '›'; color: var(--muted-foreground); transition: transform 0.15s; display: inline-block; width: 0.7rem; }
	.more :global(details[open] > summary::before) { transform: rotate(90deg); }
	.more :global(summary em) { font-style: normal; font-weight: 400; color: var(--muted-foreground); font-size: 0.8rem; }
	.more :global(summary:hover) { color: var(--primary); }
	.more .body { padding: 0 1rem 1rem 2.3rem; display: grid; gap: 0.6rem; }
	.more .body p { margin: 0; font-size: 0.85rem; color: var(--muted-foreground); }
	.more .body .hint { color: var(--muted-foreground); }
	.more .stack { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; max-width: 34rem; }
	.more .stack label { width: 100%; }
	.more .checks-body :global(.checks h3) { display: none; }
	.more .checks-body :global(.checks) { margin: 0; padding: 0; border: 0; }
	.share-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.share-row input { flex: 1; min-width: 14rem; font-family: ui-monospace, monospace; font-size: 0.78rem; }
	.share-row form { margin: 0; }
	.scheduled-now { margin: 0; font-size: 0.9rem; color: var(--foreground) !important; }
	.urls { min-height: 1.2rem; }
	.urls code { color: var(--ok); }
	.bad { color: var(--danger); font-size: 0.82rem; }
	.danger-zone summary { color: var(--danger); }
	.more .danger-zone input { padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--background); width: 100%; }

	@media (max-width: 900px) {
		.headline { grid-template-columns: 1fr; }
		.picked { flex-direction: column; }
		.picked > img { width: 100%; max-width: 14rem; }
	}
	@media (max-width: 1100px) {
		.split-only { display: none; }
	}
	@media (max-width: 560px) {
		.view-switch { flex-basis: 100%; }
		.tabs > button { padding: 0.45rem 0.6rem; }
		h1 { white-space: normal; }
	}
</style>
