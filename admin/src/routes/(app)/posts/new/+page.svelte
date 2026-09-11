<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	let { data, form } = $props();

	// Seeded from the server's echoed values so a failed submit without JS still
	// comes back filled in; thereafter these are the source of truth.

	let title = $state(untrack(() => form?.values?.title ?? ''));
	let slug = $state(untrack(() => form?.values?.slug ?? ''));
	let category = $state(untrack(() => form?.values?.category ?? 'Technology'));
	let description = $state(untrack(() => form?.values?.description ?? ''));
	let date = $state(untrack(() => form?.values?.date ?? data.today));
	let busy = $state(false);

	const auto = $derived(
		title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
			.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
	);
	const effective = $derived(slug.trim() || auto);
	const taken = $derived(data.existingSlugs.includes(effective));
	const descLen = $derived(description.trim().length);
</script>

<div class="head">
	<a class="back" href="/posts">← Articles</a>
	<h1>New article</h1>
</div>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}

<form
	method="POST"
	action="?/create"
	use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}
>
	<label>
		Title
		<input name="title" bind:value={title} placeholder="What the article is called" required />
	</label>

	<label>
		Slug
		<input name="slug" bind:value={slug} placeholder={auto || 'from-the-title'} />
		<span class="path" class:bad={taken}>
			content/blog/{effective || '…'}/
			{#if taken}· already exists{/if}
		</span>
	</label>

	<div class="row">
		<label>Date<input name="date" bind:value={date} placeholder="YYYY-MM-DD" /></label>
		<label>
			Category
			<select name="category" bind:value={category}>
				{#each data.categories as c}<option>{c}</option>{/each}
			</select>
		</label>
	</div>

	<label>
		Description
		<textarea name="description" rows="3" bind:value={description}
			placeholder="One sentence. This is the meta description, the card text and the social preview."></textarea>
		<span class="count" class:warn={descLen > 0 && (descLen < 120 || descLen > 160)}>
			{descLen} characters · 120–160 reads best in search results
		</span>
	</label>

	<button type="submit" disabled={busy || !title.trim() || taken}>
		{busy ? 'Creating…' : 'Create and start writing'}
	</button>

	<p class="note">
		Created as a <strong>draft</strong>, so it stays off the live site until you publish. Only
		the English file is written — Hugo generates the “not yet translated” pages for French and
		Italian on its own, so there is nothing to create for them.
	</p>
</form>

<style>
	.head { margin-bottom: 1.25rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted); }
	h1 { font-size: 1.4rem; margin: 0.35rem 0 0; letter-spacing: -0.015em; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger);
		padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	form { display: grid; gap: 1rem; max-width: 38rem; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	label { display: block; font-size: 0.8rem; color: var(--muted); }
	input, select, textarea { display: block; width: 100%; margin-top: 0.25rem; padding: 0.55rem 0.65rem;
		border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
	textarea { resize: vertical; }
	.path { display: block; margin-top: 0.3rem; font-size: 0.75rem; color: var(--muted); font-family: ui-monospace, monospace; }
	.path.bad { color: var(--danger); }
	.count { display: block; margin-top: 0.3rem; font-size: 0.72rem; color: var(--muted); }
	.count.warn { color: var(--warn); }
	button { justify-self: start; padding: 0.6rem 1.2rem; border: 0; border-radius: 8px;
		background: var(--accent); color: var(--accent-ink); font-weight: 600; cursor: pointer; }
	button:disabled { opacity: 0.5; cursor: default; }
	.note { font-size: 0.82rem; color: var(--muted); margin: 0; }
</style>
