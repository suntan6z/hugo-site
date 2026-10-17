<script lang="ts">
	let { data } = $props();
	let q = $state('');
	let cat = $state('All');
	let status = $state<'all' | 'published' | 'draft' | 'scheduled'>('all');

	const categories = ['All', 'Technology', 'Cybersecurity', 'Personal', 'Erasmus+'];
	const stateOf = (p: (typeof data.posts)[number]) => (data.scheduled[p.slug] ? 'scheduled' : p.draft ? 'draft' : 'published');
	const count = (k: 'published' | 'draft' | 'scheduled') => data.posts.filter((p) => stateOf(p) === k).length;
	const STATES = [
		['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['scheduled', 'Scheduled']
	] as const;
	const shown = $derived(
		data.posts.filter(
			(p) =>
				(status === 'all' || stateOf(p) === status) &&
				(cat === 'All' || p.category === cat) &&
				(q === '' || p.title.toLowerCase().includes(q.toLowerCase()) || p.slug.includes(q.toLowerCase()))
		)
	);
</script>

<div class="page-head">
	<div>
		<h1>Articles</h1>
		<p>{data.posts.length} in all: {count('published')} published, {count('draft')} draft{count('draft') === 1 ? '' : 's'}{count('scheduled') ? `, ${count('scheduled')} scheduled` : ''}.</p>
	</div>
	<a class="btn-primary btn-lg" href="/posts/new">New article</a>
</div>

<div class="filters">
	<input type="search" placeholder="Search title or slug…" bind:value={q} />
	<div class="pills" role="group" aria-label="Filter by status">
		{#each STATES as [k, label]}
			<button type="button" class="pill" class:active={status === k} onclick={() => (status = k)}>
				{label}{#if k !== 'all'} <span class="c">{count(k)}</span>{/if}
			</button>
		{/each}
	</div>
	<div class="pills" role="group" aria-label="Filter by category">
		{#each categories as c}
			<button type="button" class="pill" class:active={cat === c} onclick={() => (cat = c)}>{c}</button>
		{/each}
	</div>
</div>

<ul class="posts card">
	{#each shown as p (p.slug)}
		<li>
			<div class="main">
				<a href="/posts/{p.slug}">{p.title}</a>
				<span class="slug">{p.slug} · {p.date}</span>
			</div>
			<div class="meta">
				<span class="badge">{p.category}</span>
				{#if data.scheduled[p.slug]}
					<span class="chip info" title={new Date(data.scheduled[p.slug]).toLocaleString('en-GB')}>
						Goes live {new Date(data.scheduled[p.slug]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
					</span>
				{:else if p.draft}<span class="chip warn">Draft</span>
				{:else}<span class="chip ok">Published</span>{/if}
				{#await data.views then views}
					{#if views && !p.draft}
						<span class="views" title="Times read in the last {views.days} days, all languages">{views.bySlug[p.slug] ?? 0} read</span>
					{/if}
				{/await}
				<span class="langs" aria-label="Languages written">
					{#each ['en', 'fr', 'it'] as const as l}
						<i class:on={p.langs.includes(l)} title={p.langs.includes(l) ? `Written in ${l.toUpperCase()}` : `Missing in ${l.toUpperCase()}`}>{l}</i>
					{/each}
				</span>
			</div>
		</li>
	{/each}
	{#if shown.length === 0}<li class="empty">No articles match.</li>{/if}
</ul>

<style>
	.filters { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.25rem; }
	.filters > input { width: 100%; }
	.pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.pill .c { margin-left: 0.2rem; opacity: 0.7; font-weight: 700; }
	.posts { list-style: none; padding: 0.2rem 1.2rem; margin: 0; }
	.posts li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.85rem 0; border-bottom: 1px solid var(--border); }
	.posts li:last-child { border-bottom: 0; }
	.main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
	.main a { text-decoration: none; font-weight: 600; color: var(--foreground); transition: color 0.2s; }
	.main a:hover { color: var(--primary); }
	.slug { font-size: 0.75rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.meta { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; color: var(--muted-foreground); white-space: nowrap; flex: none; }
	.views { font-variant-numeric: tabular-nums; }
	/* Three languages, each present or visibly missing. */
	.langs { display: inline-flex; gap: 0.2rem; }
	.langs i { font-style: normal; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 0.08rem 0.4rem; border-radius: 0.35rem; border: 1px dashed var(--border); color: var(--muted-foreground); opacity: 0.7; }
	.langs i.on { border: 1px solid var(--ok-line); background: var(--ok-bg); color: var(--ok); opacity: 1; }
	.empty { color: var(--muted-foreground); }
	@media (max-width: 760px) {
		.posts li { flex-direction: column; align-items: flex-start; }
		.meta { flex-wrap: wrap; white-space: normal; }
	}
</style>
