<script lang="ts">
	let { data } = $props();
	const when = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown';
</script>

<div class="page-head">
	<div>
		<h1>Pages</h1>
		<p>The pages in the site’s menu besides the blog. Open one, click the text, and type. Each exists in three languages.</p>
	</div>
</div>

<ul class="pages">
	{#each data.pages as p (p.name)}
		<li>
			<a href="/pages/{p.name}">
				<strong>{p.label}</strong>
				<span class="blurb">{p.blurb}</span>
			</a>
			<span class="meta">
				{#if p.stamp}<span title="What the page says about itself">says “{p.stamp}”</span> ·{/if}
				changed {when(p.changed)}
				<span class="langs">{#each ['en', 'fr', 'it'] as l}<i class:on={(p.langs as string[]).includes(l)}>{l}</i>{/each}</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.pages { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; max-width: 50rem; }
	.pages li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.4rem 1rem;
		padding: 0.9rem 1.1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
	.pages li:hover { border-color: var(--primary); }
	.pages a { display: flex; flex-direction: column; text-decoration: none; color: inherit; flex: 1; min-width: 14rem; }
	.pages strong { font-size: 1rem; }
	.blurb { font-size: 0.82rem; color: var(--muted-foreground); }
	.meta { font-size: 0.78rem; color: var(--muted-foreground); display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.langs { display: inline-flex; gap: 0.2rem; margin-left: 0.3rem; }
	.langs i { font-style: normal; font-variant: small-caps; padding: 0 0.3rem; border-radius: 4px; background: var(--muted); opacity: 0.5; }
	.langs i.on { opacity: 1; background: var(--accent); color: var(--accent-foreground); }
</style>
