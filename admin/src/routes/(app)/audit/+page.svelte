<script lang="ts">
	import { describe, GROUPS } from '$lib/activity';
	let { data } = $props();

	const when = (iso: string) => {
		const d = new Date(iso);
		return d.toLocaleString('en-GB', {
			day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
		});
	};

	/** The facts behind a sentence, for the day something needs tracing. */
	function details(e: Record<string, unknown>): [string, string][] {
		return Object.entries(e)
			.filter(([k]) => k !== 'at' && k !== 'event' && k !== 'slug')
			.map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : String(v)])
			.filter(([, v]) => v !== '' && v !== 'undefined' && v !== 'null');
	}

	const href = (p: number) => `/audit?p=${p}${data.group ? `&group=${data.group}` : ''}`;
	const groupName = $derived(GROUPS.find((g) => g.id === data.group)?.label ?? '');
</script>

<div class="head">
	<a class="back" href="/settings">← Settings</a>
	<h1>Activity</h1>
	<p class="note">Everything done in this portal, newest first: who signed in, what was saved or sent.</p>
</div>

<div class="filters" role="group" aria-label="Show">
	<a class="pill" class:active={!data.group} href="/audit">Everything</a>
	{#each GROUPS as g}
		<a class="pill" class:active={data.group === g.id} href="/audit?group={g.id}">{g.label}</a>
	{/each}
</div>

{#if data.entries.length === 0}
	<p class="note">Nothing recorded{data.group ? ` under “${groupName}”` : ''} yet.</p>
{:else}
	<ul class="log">
		{#each data.entries as e}
			<li>
				<div class="line">
					<span class="ev">{describe(e, data.titles)}</span>
					<time datetime={e.at}>{when(e.at)}</time>
				</div>
				{#if details(e).length}
					<details>
						<summary>Details</summary>
						<dl>
							{#each details(e) as [k, v]}
								<dt>{k}</dt><dd>{v}</dd>
							{/each}
						</dl>
					</details>
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
	.ev { font-weight: 500; font-size: 0.92rem; }
	details { margin-top: 0.3rem; }
	summary { cursor: pointer; font-size: 0.75rem; color: var(--muted-foreground); width: max-content; }
	time { font-size: 0.78rem; color: var(--muted-foreground); white-space: nowrap; }
	dl { margin: 0.35rem 0 0; display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.6rem; font-size: 0.8rem; }
	dt { color: var(--muted-foreground); }
	dd { margin: 0; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
	.pager { display: flex; gap: 0.6rem; margin: 1.25rem 0 0; }
	.pager a { text-decoration: none; }
</style>
