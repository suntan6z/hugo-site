<script lang="ts">
	let { data } = $props();

	const when = (iso: string) => {
		const d = new Date(iso);
		return d.toLocaleString('en-GB', {
			day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
		});
	};

	/** Everything except the two fields every entry has is worth showing verbatim. */
	function details(e: Record<string, unknown>): [string, string][] {
		return Object.entries(e)
			.filter(([k]) => k !== 'at' && k !== 'event')
			.map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : String(v)])
			.filter(([, v]) => v !== '' && v !== 'undefined' && v !== 'null');
	}

	const href = (p: number) => `/audit?p=${p}${data.event ? `&event=${encodeURIComponent(data.event)}` : ''}`;
</script>

<div class="head">
	<a class="back" href="/settings">← Settings</a>
	<h1>Activity</h1>
	<p class="note">{data.total} entries. Every sign-in, commit, broadcast and translation the portal has made.</p>
</div>

<div class="filters">
	<a class="pill" class:active={!data.event} href="/audit">All</a>
	{#each data.events as e}
		<a class="pill" class:active={data.event === e} href="/audit?event={encodeURIComponent(e)}">{e}</a>
	{/each}
</div>

{#if data.entries.length === 0}
	<p class="note">Nothing recorded{data.event ? ` for “${data.event}”` : ''} yet.</p>
{:else}
	<ul class="log">
		{#each data.entries as e}
			<li>
				<div class="line">
					<span class="ev">{e.event}</span>
					<time>{when(e.at)}</time>
				</div>
				{#if details(e).length}
					<dl>
						{#each details(e) as [k, v]}
							<dt>{k}</dt><dd>{v}</dd>
						{/each}
					</dl>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<nav class="pager">
	{#if data.page > 0}<a class="btn-outline" href={href(data.page - 1)}>← Newer</a>{/if}
	{#if data.hasMore}<a class="btn-outline" href={href(data.page + 1)}>Older →</a>{/if}
</nav>

<style>
	.head { margin-bottom: 1.25rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted-foreground); }
	h1 { font-size: 1.4rem; margin: 0.35rem 0 0.15rem; letter-spacing: -0.015em; }
	.note { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.2rem 0 0; }
	.filters { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 1rem 0 1.25rem; }
	.filters .pill { text-decoration: none; }
	.log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.log li { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.8rem; }
	.line { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
	.ev { font-weight: 600; font-size: 0.9rem; }
	time { font-size: 0.78rem; color: var(--muted-foreground); white-space: nowrap; }
	dl { margin: 0.35rem 0 0; display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.6rem; font-size: 0.8rem; }
	dt { color: var(--muted-foreground); }
	dd { margin: 0; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
	.pager { display: flex; gap: 0.6rem; margin: 1.25rem 0 0; }
	.pager a { text-decoration: none; }
</style>
