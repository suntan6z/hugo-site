<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { prepareImage, formatBytes, ImageError, type PreparedImage } from '$lib/client/image';
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
		}
	});

	// Removing a translation is a deliberate, per-language act — never a
	// consequence of clearing the title field.
	let removeTranslation = $state<Record<string, boolean>>({ fr: false, it: false });
	let showDanger = $state(false);
	let confirmSlug = $state('');

	let tab = $state<'en' | 'fr' | 'it'>('en');
	let saving = $state(false);

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

	/** Inserts a Markdown image at the cursor in the language pane being edited. */
	function insert(name: string) {
		const ta = document.querySelector<HTMLTextAreaElement>(`textarea[name="body_${tab}"]`);
		if (!ta) return;
		const snippet = `![${altText[name] ?? ''}](${name})`;
		const at = ta.selectionStart ?? ta.value.length;
		post.translations[tab].body = ta.value.slice(0, at) + snippet + ta.value.slice(ta.selectionEnd ?? at);
		queueMicrotask(() => {
			ta.focus();
			ta.selectionStart = ta.selectionEnd = at + snippet.length;
		});
	}

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

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.success}<p class="msg ok">Saved{form.published ? ' and published' : ''}. Commit <code>{form.sha}</code>.</p>{/if}

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

<form method="POST" action="?/save" enctype="multipart/form-data" use:enhance={({ formData }) => {
		for (const p of pending) formData.append('newimage', p.blob, p.name);
		formData.set('deleteimages', JSON.stringify(removed));
		saving = true;
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') {
				pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
				pending = [];
				removed = [];
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
		{#each LANGS as l}
			<button type="button" class:active={tab === l} onclick={() => (tab = l)}>
				{LANG_NAMES[l]}
				<i class:on={post.translations[l].exists}></i>
			</button>
		{/each}
	</div>

	{#each LANGS as l}
		<div class="pane" hidden={tab !== l}>
			<label>Title<input name="title_{l}" bind:value={post.translations[l].title} /></label>
			<label>Description
				<textarea name="description_{l}" rows="2" bind:value={post.translations[l].description}></textarea>
				<span class="count" class:warn={post.translations[l].description.length > 160 || (post.translations[l].description.length > 0 && post.translations[l].description.length < 120)}>
					{post.translations[l].description.length} chars (120–160 ideal)
				</span>
			</label>
			{#if isErasmus}
				<label>EU funding text<input name="eu_funding_text_{l}" bind:value={post.translations[l].eu_funding_text} /></label>
			{/if}
			{#if l !== 'en'}
				<label class="check">
					<input type="checkbox" name="untranslated_{l}" bind:checked={post.translations[l].untranslated} />
					Mark as not yet translated (shows the “read it in another language” notice)
				</label>
			{/if}
			<label>Body
				<textarea class="body" name="body_{l}" rows="24" bind:value={post.translations[l].body}></textarea>
			</label>
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
	</div>
</form>

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
	label.check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--foreground); }
	label.check input { width: auto; margin: 0; }
	textarea.body { font-family: ui-monospace, "SF Mono", monospace; font-size: 0.84rem; line-height: 1.6; }
	.count { font-size: 0.72rem; color: var(--muted-foreground); }
	.count.warn { color: var(--warn); }
	.hint { font-size: 0.82rem; color: var(--warn); margin: 0.5rem 0 0; }
	.tabs { display: flex; gap: 0.3rem; margin: 1.75rem 0 0.9rem; border-bottom: 1px solid var(--border); }
	.tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.5rem 0.8rem; cursor: pointer; color: var(--muted-foreground); font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
	.tabs button.active { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 600; }
	.tabs i { width: 6px; height: 6px; border-radius: 50%; background: var(--border); display: inline-block; }
	.tabs i.on { background: var(--primary); }
	.pane { display: grid; gap: 0.85rem; }
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
