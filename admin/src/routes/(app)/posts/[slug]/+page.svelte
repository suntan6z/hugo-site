<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
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

	let tab = $state<'en' | 'fr' | 'it'>('en');
	let saving = $state(false);

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

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); saving = false; }; }}>
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
				{#each post.images as img}<option value={img}>{img}</option>{/each}
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
					{#each post.images as img}<option value={img}>{img}</option>{/each}
				</select>
			</label>
			<label>Project URL<input name="project_url" bind:value={post.project_url} /></label>
			{#if missingPartner}<p class="hint">Partner name and URL are required for the strip to render.</p>{/if}
		</fieldset>
	{/if}

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
					the placeholder page automatically.
				</p>
			{/if}
		</div>
	{/each}

	<div class="actions">
		<button type="submit" name="intent" value="save" disabled={saving}>
			{saving ? 'Saving…' : 'Save'}
		</button>
		<button type="submit" name="intent" value="publish" class="primary" disabled={saving}>
			Publish
		</button>
	</div>
</form>

<style>
	.head { margin-bottom: 1.25rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted); }
	h1 { font-size: 1.4rem; margin: 0.35rem 0 0.15rem; letter-spacing: -0.015em; }
	code { font-size: 0.78rem; color: var(--muted); font-family: ui-monospace, monospace; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.ok { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
	.shared { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; align-items: end; }
	fieldset { border: 1px solid var(--line); border-radius: var(--radius); padding: 0.9rem 1rem 1rem; margin: 1.25rem 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.75rem; }
	legend { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); padding: 0 0.35rem; }
	label { display: block; font-size: 0.8rem; color: var(--muted); }
	label.check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--ink); }
	label.check input { width: auto; margin: 0; }
	input, select, textarea { display: block; width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.6rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
	textarea { resize: vertical; }
	textarea.body { font-family: ui-monospace, "SF Mono", monospace; font-size: 0.84rem; line-height: 1.6; }
	.count { font-size: 0.72rem; color: var(--muted); }
	.count.warn { color: var(--warn); }
	.hint { font-size: 0.82rem; color: var(--warn); margin: 0.5rem 0 0; }
	.tabs { display: flex; gap: 0.3rem; margin: 1.75rem 0 0.9rem; border-bottom: 1px solid var(--line); }
	.tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.5rem 0.8rem; cursor: pointer; color: var(--muted); font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
	.tabs button.active { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
	.tabs i { width: 6px; height: 6px; border-radius: 50%; background: var(--line); display: inline-block; }
	.tabs i.on { background: var(--accent); }
	.pane { display: grid; gap: 0.85rem; }
	.actions { display: flex; gap: 0.6rem; margin-top: 1.5rem; position: sticky; bottom: 0; padding: 1rem 0; background: linear-gradient(transparent, var(--bg) 35%); }
	.actions button { padding: 0.6rem 1.1rem; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); cursor: pointer; font-weight: 600; font-size: 0.9rem; }
	.actions button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
	.actions button:disabled { opacity: 0.6; cursor: default; }
</style>
