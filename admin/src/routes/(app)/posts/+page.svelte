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
	<a class="btn-primary" href="/posts/new">New article</a>
</div>

<div class="filters">
	<input placeholder="Search title or slug…" bind:value={q} />
	<div class="pills" role="group" aria-label="Filter by category">
		{#each categories as c}
			<button type="button" class="pill" class:active={cat === c} onclick={() => (cat = c)}>{c}</button>
		{/each}
	</div>
</div>

<ul class="posts">
	{#each shown as p}
		<li>
			<div class="main">
				<a href="/posts/{p.slug}">{p.title}</a>
				<span class="slug">{p.slug}</span>
			</div>
			<div class="meta">
				<span class="badge">{p.category}</span>
				<span>{p.date}</span>
				{#if p.draft}<span class="draft">draft</span>{/if}
				{#if !p.featured_image}<span class="gap" title="No featured_image: no thumbnail on the homepage grid">no thumb</span>{/if}
				<span class="langs">
					{#each ['en', 'fr', 'it'] as const as l}
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
	h1 { font-size: 2rem; margin: 0; }
	.filters { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
	.pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.filters > input { width: 100%; }
	.posts { list-style: none; padding: 0; margin: 0; }
	.posts li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--border); }
	.main { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.main a { text-decoration: none; font-weight: 500; color: var(--foreground); transition: color 0.2s; }
	.main a:hover { color: var(--primary); }
	.slug { font-size: 0.75rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; }
	.meta { display: flex; align-items: center; gap: 0.55rem; font-size: 0.78rem; color: var(--muted-foreground); white-space: nowrap; }
	.draft { color: var(--warn); font-weight: 600; }
	.gap { color: var(--warn); }
	.langs i { font-style: normal; opacity: 0.28; font-variant: small-caps; letter-spacing: 0.04em; }
	.langs i.on { opacity: 1; font-weight: 700; }
	.empty { color: var(--muted-foreground); }
</style>
