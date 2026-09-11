<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	let showAdd = $state(false);
	let name = $state('');
	let flag = $state('');
	let slug = $state('');
	const autoSlug = $derived(
		name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
			.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	);
</script>

<div class="head">
	<h1>Gallery</h1>
	<button class="new" onclick={() => (showAdd = !showAdd)}>{showAdd ? 'Cancel' : 'Add city'}</button>
</div>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.success}<p class="msg ok">Added “{form.slug}”. Upload its photos below.</p>{/if}

{#if showAdd}
	<form class="add" method="POST" action="?/add" use:enhance>
		<label>City name<input name="name" bind:value={name} placeholder="Câmara de Lobos" required /></label>
		<label>Flag<input name="flag" bind:value={flag} placeholder="🇵🇹" maxlength="8" required /></label>
		<label>Slug<input name="slug" bind:value={slug} placeholder={autoSlug || 'auto'} /></label>
		<button type="submit">Create</button>
		<p class="note">
			Creates <code>content/gallery/{slug || autoSlug || '<slug>'}/</code> with the three language
			stubs and adds the filter pill — one commit.
		</p>
	</form>
{/if}

<ul class="cities">
	{#each data.cities as c}
		<li>
			<a href="/gallery/{c.slug}">
				<span class="flag">{c.flag}</span>
				<span class="name">{c.name}</span>
			</a>
			<span class="count" class:empty={c.photos === 0}>
				{c.photos} photo{c.photos === 1 ? '' : 's'}
			</span>
		</li>
	{/each}
</ul>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.new { background: var(--primary); color: var(--primary-foreground); padding: 0.45rem 0.85rem; border: 0; border-radius: 8px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.add { display: grid; grid-template-columns: 2fr 0.6fr 1.2fr auto; gap: 0.6rem; align-items: end;
		background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1.25rem; }
	.add label { font-size: 0.8rem; color: var(--muted-foreground); }
	.add input { display: block; width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--background); }
	.add button { padding: 0.55rem 1rem; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); font-weight: 600; cursor: pointer; }
	.add .note { grid-column: 1 / -1; font-size: 0.78rem; color: var(--muted-foreground); margin: 0; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
	.cities { list-style: none; padding: 0; margin: 0; }
	.cities li { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--border); }
	.cities a { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: inherit; font-weight: 550; }
	.cities a:hover .name { text-decoration: underline; }
	.flag { font-size: 1.15rem; }
	.count { font-size: 0.8rem; color: var(--muted-foreground); }
	.count.empty { color: var(--warn); }
</style>
