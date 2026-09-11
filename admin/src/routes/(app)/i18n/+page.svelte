<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	let filter = $state('');
	let onlyProblems = $state(false);
	let showAdd = $state(false);
	let newKey = $state('');
	let busy = $state(false);

	const LABEL = { en: 'English', fr: 'Français', it: 'Italiano' } as const;

	// Keys the drift report has something to say about.
	const flagged = $derived(
		new Set([
			...data.drift.empty.map((e) => e.key),
			...data.drift.placeholderMismatch.map((e) => e.key),
			...data.drift.missing.map((e) => e.key)
		])
	);

	const shown = $derived(
		data.rows.filter((r) => {
			if (onlyProblems && !flagged.has(r.key)) return false;
			if (!filter.trim()) return true;
			const q = filter.toLowerCase();
			return (
				r.key.toLowerCase().includes(q) ||
				Object.values(r.values).some((v) => v.toLowerCase().includes(q))
			);
		})
	);

	const problemsFor = (key: string) => [
		...data.drift.empty.filter((e) => e.key === key).map((e) => `${e.lang} is empty`),
		...data.drift.missing.filter((e) => e.key === key).map((e) => `${e.lang} is missing`),
		...data.drift.placeholderMismatch
			.filter((e) => e.key === key)
			.map((e) => `${e.lang} expects ${e.expected.join(' ')} but has ${e.found.join(' ') || 'none'}`)
	];
</script>

<div class="head">
	<h1>Interface strings</h1>
	<button class="add" onclick={() => (showAdd = !showAdd)}>{showAdd ? 'Cancel' : 'Add a key'}</button>
</div>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.success}
	<p class="msg ok">Saved {form.changes} change{form.changes === 1 ? '' : 's'}. Commit <code>{form.sha}</code>.</p>
{/if}

{#if flagged.size > 0}
	<p class="msg warn">
		{flagged.size} key{flagged.size === 1 ? ' needs' : 's need'} attention — a key that is empty or
		missing in one language renders as nothing there, with no build error.
	</p>
{/if}

<div class="tools">
	<input placeholder="Filter by key or text…" bind:value={filter} />
	<label class="check"><input type="checkbox" bind:checked={onlyProblems} /> Only problems</label>
	<span class="counts">{shown.length} of {data.rows.length}</span>
</div>

<form method="POST" action="?/save" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
	{#if showAdd}
		<fieldset class="new">
			<legend>New key</legend>
			<label>Key<input name="new_key" bind:value={newKey} placeholder="nav_something" /></label>
			{#each data.langs as l}
				<label>{LABEL[l]}<input name="new_{l}" /></label>
			{/each}
			<p class="note">Written to all three files at once — a key in only one renders empty in the others.</p>
		</fieldset>
	{/if}

	<div class="grid head-row">
		<span>Key</span>
		{#each data.langs as l}<span>{LABEL[l]}</span>{/each}
	</div>

	{#each shown as row (row.key)}
		<div class="grid row" class:flagged={flagged.has(row.key)}>
			<div class="k">
				<code>{row.key}</code>
				{#if row.placeholders.length > 0}
					<span class="ph">{row.placeholders.join(' ')}</span>
				{/if}
				{#each problemsFor(row.key) as p}<span class="problem">{p}</span>{/each}
			</div>
			{#each data.langs as l}
				<input
					name="v_{l}_{row.key}"
					value={row.values[l]}
					class:empty={row.values[l].trim() === '' && flagged.has(row.key)}
				/>
			{/each}
		</div>
	{/each}

	<div class="actions">
		<button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
		<span class="note">Writes all three files in one commit, and refuses to save if their key sets would diverge.</span>
	</div>
</form>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.add { background: var(--accent); color: var(--accent-ink); padding: 0.45rem 0.85rem; border: 0;
		border-radius: 8px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.warn { background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); }

	.tools { display: flex; align-items: center; gap: 0.9rem; margin-bottom: 0.9rem; flex-wrap: wrap; }
	.tools > input { flex: 1; min-width: 12rem; padding: 0.5rem 0.65rem;
		border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
	.check { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
	.check input { width: auto; }
	.counts { font-size: 0.8rem; color: var(--muted); margin-left: auto; }

	.new { border: 1px solid var(--accent); border-radius: var(--radius); padding: 0.9rem 1rem;
		display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: 0.7rem; margin-bottom: 1.25rem; }
	.new legend { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); padding: 0 0.35rem; }
	.new .note { grid-column: 1 / -1; margin: 0; }

	.grid { display: grid; grid-template-columns: minmax(min(11rem, 100%), 0.8fr) repeat(3, minmax(min(9rem, 100%), 1fr));
		gap: 0.5rem; align-items: start; }
	.head-row { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);
		padding-bottom: 0.4rem; border-bottom: 1px solid var(--line); margin-bottom: 0.5rem; }
	.row { padding: 0.35rem 0; border-bottom: 1px solid var(--line); }
	.row.flagged { background: color-mix(in srgb, var(--warn) 7%, transparent); }
	.k { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; padding-top: 0.4rem; }
	.k code { font-size: 0.76rem; word-break: break-all; }
	.ph { font-size: 0.68rem; color: var(--accent); font-family: ui-monospace, monospace; }
	.problem { font-size: 0.68rem; color: var(--warn); }
	.row input { width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--line);
		border-radius: 6px; background: var(--panel); font-size: 0.82rem; }
	.row input.empty { border-color: color-mix(in srgb, var(--warn) 55%, var(--line)); }
	label { display: block; font-size: 0.8rem; color: var(--muted); }
	label input { display: block; width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.6rem;
		border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }

	.actions { display: flex; align-items: center; gap: 0.9rem; margin-top: 1.25rem; position: sticky; bottom: 0;
		padding: 1rem 0; background: linear-gradient(transparent, var(--bg) 35%); flex-wrap: wrap; }
	.actions button { padding: 0.6rem 1.2rem; border: 0; border-radius: 8px; background: var(--accent);
		color: var(--accent-ink); font-weight: 600; cursor: pointer; }
	.actions button:disabled { opacity: 0.6; cursor: default; }
	.note { font-size: 0.8rem; color: var(--muted); margin: 0; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
