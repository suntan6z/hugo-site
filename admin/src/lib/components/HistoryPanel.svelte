<script lang="ts" generics="V">
	/**
	 * Earlier versions of an article or page, from git history.
	 *
	 * Restoring only fills the editor: the old text is then reviewed and saved
	 * like any other edit, which makes going back a new commit that can itself
	 * be undone. Nothing is fetched until the panel is opened.
	 */
	import type { ComponentProps } from 'svelte';
	import FileChanges from './FileChanges.svelte';

	type Revision = { sha: string; date: string; author: string; message: string };
	type Detail = { version: V; changes: ComponentProps<typeof FileChanges>['changes'] };

	let {
		endpoint,
		onRestore,
		note = ''
	}: {
		/** e.g. /api/history/posts/my-slug — the list; `${endpoint}/${sha}` is one version. */
		endpoint: string;
		onRestore: (version: V) => void;
		note?: string;
	} = $props();

	let open = $state(false);
	let revisions = $state<Revision[] | null>(null);
	let error = $state('');
	let comparing = $state<string | null>(null);
	let detail = $state<Record<string, Detail>>({});
	let loading = $state<string | null>(null);
	let restored = $state<string | null>(null);

	async function get<T>(url: string): Promise<T> {
		const r = await fetch(url, { headers: { Accept: 'application/json' } });
		if (r.status === 401) throw new Error('Signed out — sign in again in another tab.');
		if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`);
		return r.json();
	}

	async function toggle(e: Event) {
		open = (e.currentTarget as HTMLDetailsElement).open;
		if (!open || revisions) return;
		try {
			revisions = (await get<{ revisions: Revision[] }>(endpoint)).revisions;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function compare(sha: string) {
		if (comparing === sha) {
			comparing = null;
			return;
		}
		comparing = sha;
		if (detail[sha]) return;
		loading = sha;
		error = '';
		try {
			detail[sha] = await get<Detail>(`${endpoint}/${sha}`);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			comparing = null;
		} finally {
			loading = null;
		}
	}

	function restore(r: Revision) {
		const d = detail[r.sha];
		if (!d) return;
		if (!confirm(`Replace what is in the editor with the version from ${when(r.date)}? Nothing is saved until you Save.`)) return;
		onRestore(d.version);
		restored = r.sha;
	}

	const when = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<details class="history" ontoggle={toggle}>
	<summary>History</summary>
	{#if note}<p class="note">{note}</p>{/if}
	{#if error}<p class="err">{error}</p>{/if}
	{#if open && !revisions && !error}
		<p class="note">Loading…</p>
	{:else if revisions && revisions.length === 0}
		<p class="note">No earlier versions recorded.</p>
	{:else if revisions}
		<ol>
			{#each revisions as r (r.sha)}
				<li>
					<div class="row">
						<span class="when">{when(r.date)}</span>
						<span class="msg">{r.message}</span>
						{#if r.author}<span class="who">{r.author}</span>{/if}
						<button type="button" class="linkish" onclick={() => compare(r.sha)} disabled={loading === r.sha}>
							{loading === r.sha ? 'Loading…' : comparing === r.sha ? 'Hide' : 'Compare'}
						</button>
					</div>
					{#if comparing === r.sha && detail[r.sha]}
						<div class="detail">
							{#if detail[r.sha].changes.length === 0}
								<p class="note">Identical to what is saved now.</p>
							{:else}
								<p class="note">Going back to this version would change:</p>
								<FileChanges changes={detail[r.sha].changes} />
								<button type="button" class="btn-outline small" onclick={() => restore(r)}>Load this version into the editor</button>
								{#if restored === r.sha}<p class="ok">Loaded. Review it, then Save to make it the current version.</p>{/if}
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</details>

<style>
	.history { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	summary { cursor: pointer; font-size: 0.85rem; color: var(--muted-foreground); width: max-content; }
	summary:hover { color: var(--primary); }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0.6rem 0; }
	.err { font-size: 0.85rem; color: var(--danger); }
	.ok { font-size: 0.82rem; color: var(--ok); margin: 0.5rem 0 0; }
	ol { list-style: none; padding: 0; margin: 0.6rem 0 0; }
	li { border-bottom: 1px solid var(--border); padding: 0.5rem 0; }
	.row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.8rem; font-size: 0.85rem; }
	.when { color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }
	.msg { flex: 1; min-width: 12rem; }
	.who { font-size: 0.75rem; color: var(--muted-foreground); }
	.linkish { background: none; border: 0; padding: 0; font-size: 0.8rem; color: var(--primary); text-decoration: underline; cursor: pointer; }
	.detail { margin: 0.5rem 0 0.25rem; }
	.small { margin-top: 0.7rem; padding: 0.35rem 0.8rem; font-size: 0.82rem; }
</style>
