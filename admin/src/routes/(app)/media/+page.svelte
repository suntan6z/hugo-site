<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { prepareReplacement, ImageError, formatBytes } from '$lib/client/image';
	import { GROUP_LABEL, BITMAP_RE, type MediaEntry, type Group } from '$lib/media';
	let { data, form } = $props();

	let filter = $state<'all' | 'unused' | Group>('all');
	let q = $state('');
	let selected = $state<string | null>(null);
	let dialog = $state<HTMLDialogElement | null>(null);
	let busy = $state(false);
	let note = $state<{ ok: boolean; text: string } | null>(null);
	// Bumped for a replaced file, so its thumbnail is fetched again.
	let bust = $state<Record<string, number>>({});
	let fileInput = $state<HTMLInputElement | null>(null);

	const url = (e: MediaEntry) => `/api/media/${e.path}${bust[e.path] ? `?v=${bust[e.path]}` : ''}`;
	const unusedCount = $derived(data.entries.filter((e) => e.unused && e.group !== 'gallery').length);
	const counts = $derived({
		articles: data.entries.filter((e) => e.group === 'articles').length,
		gallery: data.entries.filter((e) => e.group === 'gallery').length,
		site: data.entries.filter((e) => e.group === 'site' || e.group === 'hero').length
	});

	const shown = $derived(
		data.entries.filter(
			(e) =>
				(filter === 'all' ||
					(filter === 'unused' ? e.unused && e.group !== 'gallery' : filter === 'site' ? e.group === 'site' || e.group === 'hero' : e.group === filter)) &&
				(q === '' || e.name.toLowerCase().includes(q.toLowerCase()) || e.owner.toLowerCase().includes(q.toLowerCase()) || e.usedBy.some((u) => u.label.toLowerCase().includes(q.toLowerCase())))
		)
	);

	type Section = { key: string; title: string; entries: MediaEntry[]; gallery?: { slug: string } };
	// The gallery is hundreds of photos managed per city, so in the overall view each city is one card.
	const sections = $derived.by(() => {
		const out: Section[] = [];
		for (const e of shown) {
			const key = `${e.group}:${e.owner}`;
			let s = out.find((x) => x.key === key);
			if (!s) {
				const label = e.usedBy[0]?.label.replace(/^(Article|Gallery) · /, '') ?? e.owner;
				s = { key, title: e.group === 'articles' ? `Article · ${label}` : e.group === 'gallery' ? `Gallery · ${label}` : GROUP_LABEL[e.group], entries: [] };
				if (e.group === 'gallery') s.gallery = { slug: e.owner };
				out.push(s);
			}
			s.entries.push(e);
		}
		return out;
	});

	const current = $derived(data.entries.find((e) => e.path === selected) ?? null);

	async function replace(files: FileList | null) {
		const file = files?.[0];
		if (!file || !current) return;
		busy = true;
		note = null;
		try {
			const blob = await prepareReplacement(file, current.name);
			const fd = new FormData();
			fd.set('path', current.path);
			// A converted bitmap takes the old name; a file kept as it is must already match it.
			fd.set('name', BITMAP_RE.test(current.name) ? current.name : file.name);
			fd.set('file', blob, current.name);
			const r = await fetch('/api/media', { method: 'POST', body: fd });
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `Replacing failed (HTTP ${r.status}).`);
			bust[current.path] = Date.now();
			note = { ok: true, text: `Replaced ${current.name} (${formatBytes(blob.size)}). The site shows it once it has rebuilt.` };
			await invalidateAll();
		} catch (e) {
			note = { ok: false, text: e instanceof ImageError || e instanceof Error ? e.message : String(e) };
		} finally {
			busy = false;
			if (fileInput) fileInput.value = '';
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Library</h1>
		<p>Every picture on the site, and what uses it. {data.entries.length} in all{#if unusedCount > 0}, <strong>{unusedCount} nothing uses</strong>{/if}.</p>
	</div>
</div>

{#if form?.deleted}<p class="chip ok block">Deleted {form.deleted}.</p>{/if}
{#if form?.message}<p class="chip danger block">{form.message}</p>{/if}
{#if note}<p class="chip block" class:ok={note.ok} class:danger={!note.ok} role="status">{note.text}</p>{/if}

<div class="filters">
	<input type="search" placeholder="Search by file, article or page…" bind:value={q} />
	<div class="pills" role="group" aria-label="Filter">
		<button type="button" class="pill" class:active={filter === 'all'} onclick={() => (filter = 'all')}>All <span class="c">{data.entries.length}</span></button>
		<button type="button" class="pill" class:active={filter === 'unused'} onclick={() => (filter = 'unused')}>Unused <span class="c">{unusedCount}</span></button>
		<button type="button" class="pill" class:active={filter === 'articles'} onclick={() => (filter = 'articles')}>Articles <span class="c">{counts.articles}</span></button>
		<button type="button" class="pill" class:active={filter === 'gallery'} onclick={() => (filter = 'gallery')}>Gallery <span class="c">{counts.gallery}</span></button>
		<button type="button" class="pill" class:active={filter === 'site'} onclick={() => (filter = 'site')}>Site <span class="c">{counts.site}</span></button>
	</div>
</div>

<div class="layout" class:open={!!current}>
	<div class="main">
		{#each sections as s (s.key)}
			<section class="sec">
				<h2>{s.title} <span class="n">{s.entries.length}</span></h2>
				{#if s.gallery && filter === 'all'}
					<a class="city card" href="/gallery/{s.gallery.slug}">
						<span class="strip">
							{#each s.entries.slice(0, 4) as e}<img src={url(e)} alt="" loading="lazy" />{/each}
						</span>
						<span><strong>{s.entries.length} photos</strong> · manage them in the gallery →</span>
					</a>
				{:else}
					<ul class="grid">
						{#each s.entries as e (e.path)}
							<li>
								<button type="button" class="tile" class:on={selected === e.path} onclick={() => (selected = e.path)}>
									<span class="thumb"><img src={url(e)} alt="" loading="lazy" /></span>
									<span class="name">{e.name}</span>
									{#if e.unused}<span class="chip warn">Unused</span>
									{:else}<span class="use">{e.usedBy[0]?.label}{e.usedBy.length > 1 ? ` +${e.usedBy.length - 1}` : ''}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{:else}
			<p class="note">{filter === 'unused' ? 'Every picture is used. Nothing to clear out.' : 'No picture matches.'}</p>
		{/each}
	</div>

	{#if current}
		<aside class="detail card" aria-label="Picture details">
			<button type="button" class="close" aria-label="Close details" onclick={() => (selected = null)}>×</button>
			<div class="big"><img src={url(current)} alt="" /></div>
			<h3>{current.name}</h3>
			<p class="path">{current.path}</p>

			<h4>Used by</h4>
			{#if current.usedBy.length === 0}
				<p class="chip warn block">Nothing refers to this picture.</p>
			{:else}
				<ul class="uses">
					{#each current.usedBy as u}
						<li>{#if u.href}<a href={u.href}>{u.label}</a>{:else}{u.label}{/if}</li>
					{/each}
				</ul>
			{/if}

			<div class="acts">
				{#if current.canReplace}
					<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={(e) => replace(e.currentTarget.files)} />
					<button type="button" class="btn-primary" disabled={busy} onclick={() => fileInput?.click()}>{busy ? 'Replacing…' : 'Replace with another…'}</button>
					<p class="hint">Keeps the same name, so everything that uses it keeps working.{BITMAP_RE.test(current.name) ? ' It is resized and cleaned of camera data first.' : ' It has to be the same kind of file.'}</p>
				{:else}
					<p class="hint">{current.group === 'gallery' ? 'Gallery photos are replaced, ordered and captioned with their city.' : 'The homepage photo is replaced from Settings, as a pair.'}</p>
				{/if}
				{#if current.canDelete}
					<button type="button" class="btn-danger-quiet" onclick={() => dialog?.showModal()}>Delete…</button>
				{:else if !current.unused}
					<p class="hint">It cannot be deleted while something uses it.</p>
				{/if}
			</div>

			<dialog bind:this={dialog} aria-labelledby="del-title">
				<h2 id="del-title">Delete {current.name}?</h2>
				<p>Nothing uses it. It stays in the site's history, but not on the site.</p>
				<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => { dialog?.close(); selected = null; await update(); }}>
					<input type="hidden" name="path" value={current.path} />
					<input type="hidden" name="confirm" value="delete" />
					<div class="dlg-actions">
						<button type="button" class="btn-outline" onclick={() => dialog?.close()}>Keep it</button>
						<button type="submit" class="btn-danger">Delete it</button>
					</div>
				</form>
			</dialog>
		</aside>
	{/if}
</div>

<style>
	.block { display: flex; margin: 0 0 0.9rem; border-radius: 0.6rem; padding: 0.55rem 0.8rem; font-size: 0.86rem; font-weight: 500; }
	.note { color: var(--muted-foreground); font-size: 0.9rem; }
	.filters { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.4rem; }
	.pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.pill .c { margin-left: 0.2rem; opacity: 0.7; font-weight: 700; }

	.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; align-items: start; }
	.layout.open { grid-template-columns: minmax(0, 1fr) 20rem; }
	.sec { margin-bottom: 1.8rem; }
	.sec h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.7rem; font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
	.n { font-size: 0.72rem; padding: 0.05rem 0.5rem; border-radius: 2rem; background: var(--accent); color: var(--primary-strong); letter-spacing: 0; }

	.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.8rem; }
	.tile { display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; width: 100%; padding: 0.5rem; border: 2px solid var(--border); border-radius: 0.8rem; background: var(--card); text-align: left; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
	.tile:hover { border-color: var(--primary); box-shadow: var(--card-shadow); }
	.tile.on { border-color: var(--primary); box-shadow: 0 0 0 3px var(--accent); }
	.thumb { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 0.5rem; overflow: hidden; background: repeating-conic-gradient(var(--muted) 0 25%, var(--card) 0 50%) 0 / 14px 14px; }
	.thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
	.name { font-size: 0.78rem; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.use { font-size: 0.72rem; color: var(--muted-foreground); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.city { display: flex; align-items: center; gap: 1rem; padding: 0.7rem 0.9rem; text-decoration: none; color: inherit; font-size: 0.88rem; }
	.city:hover { border-color: var(--primary); }
	.strip { display: flex; gap: 0.3rem; }
	.strip img { width: 3.6rem; height: 3.6rem; object-fit: cover; border-radius: 0.4rem; }

	.detail { position: sticky; top: 1.25rem; padding: 1rem 1.1rem 1.1rem; }
	.close { position: absolute; top: 0.4rem; right: 0.55rem; border: 0; background: none; font-size: 1.5rem; line-height: 1; color: var(--muted-foreground); cursor: pointer; }
	.big { border-radius: 0.6rem; overflow: hidden; background: repeating-conic-gradient(var(--muted) 0 25%, var(--card) 0 50%) 0 / 14px 14px; margin-bottom: 0.8rem; }
	.big img { display: block; width: 100%; max-height: 14rem; object-fit: contain; }
	.detail h3 { margin: 0; font-size: 1.05rem; overflow-wrap: anywhere; }
	.path { margin: 0.2rem 0 1rem; font-family: ui-monospace, monospace; font-size: 0.72rem; color: var(--muted-foreground); overflow-wrap: anywhere; }
	.detail h4 { margin: 0 0 0.4rem; font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
	.uses { margin: 0 0 1rem; padding-left: 1.1rem; font-size: 0.86rem; }
	.acts { display: grid; gap: 0.5rem; justify-items: start; }
	.hint { margin: 0; font-size: 0.78rem; color: var(--muted-foreground); }

	dialog { width: min(26rem, calc(100vw - 2rem)); padding: 1.5rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--foreground); box-shadow: 0 24px 60px -12px hsl(0 0% 0% / 0.45); }
	dialog::backdrop { background: hsl(0 0% 0% / 0.5); }
	dialog h2 { margin: 0 0 0.5rem; font-size: 1.2rem; overflow-wrap: anywhere; }
	dialog p { margin: 0 0 1rem; color: var(--muted-foreground); font-size: 0.92rem; }
	.dlg-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }

	@media (max-width: 1000px) { .layout.open { grid-template-columns: minmax(0, 1fr); } .detail { position: static; } }
</style>
