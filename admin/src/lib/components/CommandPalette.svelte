<script lang="ts">
	/**
	 * Find anything and go there: ⌘K (or Ctrl+K, or "/") from any screen.
	 *
	 * The portal's own screens and a few actions are known up front. Articles,
	 * pages, cities and interface strings are fetched once, the first time it
	 * opens, and every keystroke after that is matched in the browser
	 * (lib/search.ts), so it answers as fast as you type.
	 */
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { search, highlight, KIND_LABEL, type Item } from '$lib/search';

	let {
		open = $bindable(false),
		fixed,
		onAction
	}: { open: boolean; fixed: Item[]; onAction: (name: string) => void } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let q = $state('');
	let active = $state(0);
	let fetched = $state<Item[] | null>(null);
	let failed = $state(false);
	let list = $state<HTMLUListElement | null>(null);

	async function load() {
		if (fetched || failed) return;
		try {
			const r = await fetch('/api/search');
			if (!r.ok) throw new Error(String(r.status));
			fetched = ((await r.json()) as { items: Item[] }).items;
		} catch {
			failed = true;
		}
	}

	const results = $derived(q.trim() ? search([...fixed, ...(fetched ?? [])], q, 12) : fixed.slice(0, 9));

	$effect(() => {
		if (open && dialog && !dialog.open) {
			q = '';
			active = 0;
			dialog.showModal();
			load();
			tick().then(() => input?.focus());
		} else if (!open && dialog?.open) {
			dialog.close();
		}
	});

	// A new query starts at the top of the list.
	$effect(() => {
		q;
		active = 0;
	});

	function run(item: Item) {
		open = false;
		if (item.action) onAction(item.action);
		else if (item.href?.startsWith('http')) window.open(item.href, '_blank', 'noopener');
		else if (item.href) goto(item.href);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (results.length === 0) return;
			active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
			tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (results[active]) run(results[active]);
		}
	}
</script>

<dialog bind:this={dialog} aria-label="Search the portal" onclose={() => (open = false)} onclick={(e) => { if (e.target === dialog) open = false; }}>
	<div class="box">
		<div class="field">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" /></svg>
			<input
				bind:this={input} bind:value={q} onkeydown={keydown}
				role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results[active] ? `pal-${active}` : undefined}
				placeholder="Search articles, pages, texts, or jump to a screen…" autocomplete="off" spellcheck="false"
			/>
			<kbd>esc</kbd>
		</div>

		<ul id="palette-results" role="listbox" bind:this={list}>
			{#each results as r, i (r.kind + (r.href ?? r.action) + r.title)}
				<li id="pal-{i}" role="option" aria-selected={i === active} class:on={i === active} onmousemove={() => (active = i)} onclick={() => run(r)} onkeydown={() => {}}>
					<span class="kind k-{r.kind}">{KIND_LABEL[r.kind]}</span>
					<span class="text">
						<span class="title">{#each highlight(r.title, q) as seg}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
						{#if r.hint}<span class="hint">{#each highlight(r.hint, q) as seg}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>{/if}
					</span>
					{#if i === active}<span class="go" aria-hidden="true">↵</span>{/if}
				</li>
			{:else}
				<li class="none" role="presentation">Nothing matches “{q}”.</li>
			{/each}
		</ul>

		<p class="foot">
			{#if !q.trim()}Type to search. <b>↑ ↓</b> to move, <b>↵</b> to open.{:else if failed}The list of articles and texts could not be loaded; screens still work.{:else if !fetched}Loading articles and texts…{:else}{results.length} result{results.length === 1 ? '' : 's'}{/if}
		</p>
	</div>
</dialog>

<style>
	dialog { width: min(40rem, calc(100vw - 1.5rem)); margin: 12vh auto auto; padding: 0; border: 1px solid var(--border); border-radius: 1rem; background: var(--card); color: var(--foreground); box-shadow: 0 30px 80px -16px hsl(0 0% 0% / 0.5); overflow: hidden; }
	dialog::backdrop { background: hsl(0 0% 0% / 0.45); backdrop-filter: blur(2px); }
	.field { display: flex; align-items: center; gap: 0.7rem; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border); color: var(--muted-foreground); }
	.field input { flex: 1; min-width: 0; margin: 0; padding: 0.2rem 0; border: 0; background: transparent; color: var(--foreground); font-size: 1.05rem; box-shadow: none; }
	.field input:focus { outline: none; box-shadow: none; border: 0; }
	kbd { font: inherit; font-size: 0.7rem; padding: 0.1rem 0.4rem; border: 1px solid var(--border); border-radius: 0.35rem; color: var(--muted-foreground); }
	ul { list-style: none; margin: 0; padding: 0.4rem; max-height: min(26rem, 55vh); overflow-y: auto; }
	li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.7rem; border-radius: 0.6rem; cursor: pointer; }
	li.on { background: var(--accent); }
	li.none { color: var(--muted-foreground); cursor: default; padding: 1rem 0.7rem; }
	.kind { flex: none; min-width: 4.2rem; padding: 0.1rem 0.5rem; border-radius: 2rem; background: var(--muted); color: var(--muted-foreground); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; }
	.k-article { background: var(--info-bg); color: var(--info); }
	.k-page { background: var(--ok-bg); color: var(--ok); }
	.k-gallery { background: var(--warn-bg); color: var(--warn); }
	.k-action, .k-screen { background: var(--accent); color: var(--primary-strong); }
	.text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.title { font-weight: 600; font-size: 0.93rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hint { font-size: 0.76rem; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	mark { background: color-mix(in srgb, var(--brand-yellow) 55%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
	.go { color: var(--primary); font-weight: 700; }
	.foot { margin: 0; padding: 0.55rem 1.1rem; border-top: 1px solid var(--border); font-size: 0.76rem; color: var(--muted-foreground); }
	.foot b { color: var(--foreground); }
</style>
