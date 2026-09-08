<script lang="ts">
	let { data } = $props();
	const stats = $derived(data.stats);
	const posts = $derived(data.posts);
</script>

<h1>Dashboard</h1>

<section class="tiles">
	<a class="tile" href="/posts">
		<span class="n">{stats.total}</span>
		<span class="l">articles</span>
	</a>
	<a class="tile" href="/posts">
		<span class="n">{stats.drafts}</span>
		<span class="l">drafts</span>
	</a>
	<div class="tile" class:flag={stats.missingFeatured > 0}>
		<span class="n">{stats.missingFeatured}</span>
		<span class="l">no featured image</span>
	</div>
	<div class="tile" class:flag={stats.translationDebt.length > 0}>
		<span class="n">{stats.translationDebt.length}</span>
		<span class="l">missing translations</span>
	</div>
</section>

{#if stats.missingFeatured > 0}
	<p class="note">
		The homepage “Latest Articles” grid only shows a thumbnail when
		<code>featured_image</code> is set — it has no fallback to the first image in the body.
		{stats.missingFeatured} of {stats.total} articles currently show no thumbnail there.
	</p>
{/if}

<h2>Recent</h2>
<ul class="posts">
	{#each posts.slice(0, 8) as p}
		<li>
			<a href="/posts/{p.slug}">{p.title}</a>
			<span class="meta">
				{p.date} · {p.category}
				{#if p.draft}<em>draft</em>{/if}
				<span class="langs">{p.langs.join(' ')}</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	h1 { font-size: 1.5rem; margin: 0 0 1.25rem; letter-spacing: -0.015em; }
	h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 2rem 0 0.6rem; }
	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; }
	.tile {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1rem;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.tile.flag { border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
	.n { font-size: 1.7rem; font-weight: 650; letter-spacing: -0.02em; }
	.l { font-size: 0.82rem; color: var(--muted); }
	.note {
		margin: 1.25rem 0 0;
		font-size: 0.88rem;
		color: var(--muted);
		background: var(--panel);
		border: 1px solid var(--line);
		border-left: 3px solid var(--warn);
		padding: 0.8rem 1rem;
		border-radius: 0 var(--radius) var(--radius) 0;
	}
	code { font-size: 0.85em; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
	.posts { list-style: none; padding: 0; margin: 0; }
	.posts li { padding: 0.6rem 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
	.posts a { text-decoration: none; font-weight: 550; }
	.posts a:hover { text-decoration: underline; }
	.meta { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
	.meta em { color: var(--warn); font-style: normal; font-weight: 600; }
	.langs { font-variant: small-caps; letter-spacing: 0.05em; margin-left: 0.4rem; }
</style>
