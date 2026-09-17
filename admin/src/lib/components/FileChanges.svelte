<script lang="ts">
	/**
	 * A commit's worth of changes, file by file and line by line: the review
	 * before a save, and the comparison in a history panel.
	 */
	type Hunk = { changes: { kind: 'add' | 'remove' | 'same'; line: string }[] };
	type Change = {
		path: string;
		status: string;
		added: number;
		removed: number;
		hunks: Hunk[];
		tooBig?: boolean;
		bytes?: number;
		movedFrom?: string;
	};
	let { changes }: { changes: Change[] } = $props();

	const size = (n: number) =>
		n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
</script>

{#each changes as c}
	<article class="file">
		<header>
			<code>{c.path}</code>
			<span class="status {c.status}">{c.status}</span>
			{#if c.bytes}<span class="hint">{size(c.bytes)}</span>
			{:else if !c.tooBig}<span class="counts"><span class="plus">+{c.added}</span> <span class="minus">−{c.removed}</span></span>{/if}
		</header>
		{#if c.tooBig}
			<p class="hint">Too large to show line by line.</p>
		{:else if c.hunks.length}
			<!-- Each line is its own block element, so no newlines belong between them. -->
			<pre>{#each c.hunks as h, i}{#if i > 0}<span class="gap">⋯</span>{/if}{#each h.changes as ch}<span class={ch.kind}>{ch.kind === 'add' ? '+' : ch.kind === 'remove' ? '−' : ' '} {ch.line}</span>{/each}{/each}</pre>
		{/if}
	</article>
{/each}

<style>
	.file { border-top: 1px solid var(--border); padding: 0.7rem 0 0.2rem; }
	.file header { display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; margin-bottom: 0.4rem; }
	.file code { font-size: 0.8rem; }
	.status { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 4px; background: var(--muted); color: var(--muted-foreground); }
	.status.added { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
	.status.deleted { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
	.counts { font-size: 0.75rem; font-family: ui-monospace, monospace; }
	.plus { color: var(--ok); }
	.minus { color: var(--danger); }
	.hint { font-size: 0.8rem; color: var(--muted-foreground); margin: 0; }
	pre { margin: 0; padding: 0.5rem 0.6rem; background: var(--muted); border-radius: 6px; font-size: 0.76rem; line-height: 1.5; overflow-x: auto; font-family: ui-monospace, monospace; }
	pre span { display: block; white-space: pre; }
	pre .add { color: var(--ok); }
	pre .remove { color: var(--danger); }
	pre .gap { color: var(--muted-foreground); }
</style>
