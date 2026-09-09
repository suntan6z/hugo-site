<script lang="ts">
	let { data } = $props();
	let q = $state('');
	let cat = $state('All');

	const categories = ['All', 'Technology', 'Cybersecurity', 'Personal', 'Erasmus+'];
	const shown = $derived(
		data.posts.filter(
			(p) =>
				(cat === 'All' || p.category === cat) &&
				(q === '' || p.title.toLowerCase().includes(q.toLowerCase()) || p.slug.includes(q.toLowerCase()))
		)
	);
</script>

<div class="head">
	<h1>Articles</h1>
	<a class="new" href="/posts/new">New article</a>
</div>

<div class="filters">
	<input placeholder="Search title or slug…" bind:value={q} />
	<select bind:value={cat}>
		{#each categories as c}<option>{c}</option>{/each}
	</select>
</div>

<ul class="posts">
	{#each shown as p}
		<li>
			<div class="main">
				<a href="/posts/{p.slug}">{p.title}</a>
				<span class="slug">{p.slug}</span>
			</div>
			<div class="meta">
				<span class="cat">{p.category}</span>
				<span>{p.date}</span>
				{#if p.draft}<span class="draft">draft</span>{/if}
				{#if !p.featured_image}<span class="gap" title="No featured_image: no thumbnail on the homepage grid">no thumb</span>{/if}
				<span class="langs">
					{#each ['en', 'fr', 'it'] as l}
						<i class:on={p.langs.includes(l)}>{l}</i>
					{/each}
				</span>
			</div>
		</li>
	{/each}
	{#if shown.length === 0}<li class="empty">No articles match.</li>{/if}
</ul>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.new { background: var(--accent); color: var(--accent-ink); padding: 0.45rem 0.85rem; border-radius: 8px; text-decoration: none; font-size: 0.88rem; font-weight: 600; }
	.filters { display: flex; gap: 0.6rem; margin-bottom: 1rem; }
	input, select { padding: 0.5rem 0.65rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
	input { flex: 1; }
	.posts { list-style: none; padding: 0; margin: 0; }
	.posts li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--line); }
	.main { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.main a { text-decoration: none; font-weight: 550; }
	.main a:hover { text-decoration: underline; }
	.slug { font-size: 0.75rem; color: var(--muted); font-family: ui-monospace, monospace; }
	.meta { display: flex; align-items: center; gap: 0.55rem; font-size: 0.78rem; color: var(--muted); white-space: nowrap; }
	.cat { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; }
	.draft { color: var(--warn); font-weight: 600; }
	.gap { color: var(--warn); }
	.langs i { font-style: normal; opacity: 0.28; font-variant: small-caps; letter-spacing: 0.04em; }
	.langs i.on { opacity: 1; font-weight: 700; }
	.empty { color: var(--muted); }
</style>
