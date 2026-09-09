<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { prepareImage, formatBytes, ImageError, type PreparedImage } from '$lib/client/image';

	let { data, form } = $props();

	type Row = {
		filename: string;
		url: string;
		caption: string;
		altText: string;
		pending?: PreparedImage;
	};

	let rows = $state<Row[]>(untrack(() => data.city.photos.map((p) => ({ ...p }))));
	let loaded = $state('');
	$effect(() => {
		if (data.city.slug !== loaded) {
			loaded = data.city.slug;
			rows = data.city.photos.map((p) => ({ ...p }));
			deletes = [];
		}
	});

	let deletes = $state<string[]>([]);
	let imgError = $state('');
	let saving = $state(false);
	let dragFrom = $state<number | null>(null);
	let confirmSlug = $state('');
	let showDanger = $state(false);

	const live = $derived(rows.filter((r) => !deletes.includes(r.filename)));
	const pendingCount = $derived(rows.filter((r) => r.pending).length);
	const captionCount = $derived(live.filter((r) => r.caption.trim()).length);
	const missingAlt = $derived(live.filter((r) => !r.altText.trim()).length);

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		imgError = '';
		for (const file of Array.from(input.files ?? [])) {
			try {
				const prepared = await prepareImage(file, rows.map((r) => r.filename));
				rows.push({
					filename: prepared.name,
					url: prepared.previewUrl,
					caption: '',
					altText: '',
					pending: prepared
				});
			} catch (err) {
				imgError = err instanceof ImageError ? err.message : String(err);
			}
		}
		input.value = '';
	}

	function move(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= rows.length) return;
		const next = [...rows];
		[next[i], next[j]] = [next[j], next[i]];
		rows = next;
	}

	function drop(to: number) {
		if (dragFrom === null || dragFrom === to) return;
		const next = [...rows];
		next.splice(to, 0, ...next.splice(dragFrom, 1));
		rows = next;
		dragFrom = null;
	}

	function toggleDelete(filename: string) {
		deletes = deletes.includes(filename)
			? deletes.filter((f) => f !== filename)
			: [...deletes, filename];
	}

	function discardPending(filename: string) {
		const r = rows.find((x) => x.filename === filename);
		if (r?.pending) URL.revokeObjectURL(r.pending.previewUrl);
		rows = rows.filter((x) => x.filename !== filename);
	}
</script>

<div class="head">
	<div>
		<a class="back" href="/gallery">← Gallery</a>
		<h1><span class="flag">{data.city.flag}</span> {data.city.name}</h1>
		<code>content/gallery/{data.city.slug}/</code>
	</div>
</div>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.success}<p class="msg ok">Saved. Commit <code>{form.sha}</code>.</p>{/if}

<form
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	use:enhance={({ formData }) => {
		// Order and captions ride as JSON: the photo list is reorderable, and
		// positional form fields would not survive a drag.
		const keep = rows.filter((r) => !deletes.includes(r.filename));
		formData.set('order', JSON.stringify(keep.filter((r) => !r.pending).map((r) => r.filename)));
		formData.set(
			'captions',
			JSON.stringify(keep.map((r) => ({ filename: r.filename, caption: r.caption, altText: r.altText })))
		);
		formData.set('deletes', JSON.stringify(deletes.filter((f) => !rows.find((r) => r.filename === f)?.pending)));
		for (const r of keep) if (r.pending) formData.append('newphoto', r.pending.blob, r.pending.name);
		saving = true;
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') {
				rows.forEach((r) => r.pending && URL.revokeObjectURL(r.pending.previewUrl));
				deletes = [];
			}
		};
	}}
>
	<div class="bar">
		<label class="picker">
			<input type="file" accept="image/*" multiple onchange={onFiles} />
			<span>Add photos</span>
		</label>
		<span class="stats">
			{live.length} photo{live.length === 1 ? '' : 's'}
			· {captionCount} captioned
			{#if missingAlt > 0}<em>· {missingAlt} without alt text</em>{/if}
			{#if pendingCount > 0}<strong>· {pendingCount} to upload</strong>{/if}
		</span>
		<button type="submit" class="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
	</div>
	{#if imgError}<p class="hint">{imgError}</p>{/if}
	<p class="note">
		Drag to reorder — display order comes from the numeric filename prefix, so saving renames the
		files to match. Captions follow their photo across a rename.
	</p>

	<ul class="photos">
		{#each rows as r, i (r.filename)}
			<li
				class:removing={deletes.includes(r.filename)}
				class:new={!!r.pending}
				draggable="true"
				ondragstart={() => (dragFrom = i)}
				ondragover={(e) => e.preventDefault()}
				ondrop={() => drop(i)}
			>
				<span class="pos">{i + 1}</span>
				<img src={r.url} alt="" loading="lazy" />
				<div class="fields">
					<code>{r.filename}{#if r.pending}<em> · {r.pending.width}×{r.pending.height} · {formatBytes(r.pending.blob.size)}</em>{/if}</code>
					<input placeholder="Caption (shown under the photo)" bind:value={r.caption} />
					<input
						class:missing={!r.altText.trim()}
						placeholder="Alt text (screen readers, SEO)"
						bind:value={r.altText}
					/>
				</div>
				<div class="tools">
					<button type="button" onclick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
					<button type="button" onclick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down">↓</button>
					{#if r.pending}
						<button type="button" class="danger" onclick={() => discardPending(r.filename)}>Discard</button>
					{:else}
						<button type="button" class="danger" onclick={() => toggleDelete(r.filename)}>
							{deletes.includes(r.filename) ? 'Keep' : 'Delete'}
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	{#if rows.length === 0}<p class="empty">No photos yet.</p>{/if}
</form>

<section class="danger-zone">
	<button class="linkish" onclick={() => (showDanger = !showDanger)}>
		{showDanger ? 'Cancel' : 'Remove this city'}
	</button>
	{#if showDanger}
		<form method="POST" action="?/remove" use:enhance>
			<p>
				Deletes the bundle, all {live.length} photos, the filter pill and every caption for
				<strong>{data.city.slug}</strong>. Type the slug to confirm.
			</p>
			<input name="confirm" bind:value={confirmSlug} placeholder={data.city.slug} />
			<button type="submit" class="danger" disabled={confirmSlug !== data.city.slug}>
				Remove {data.city.slug}
			</button>
		</form>
	{/if}
</section>

<style>
	.head { margin-bottom: 1.25rem; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted); }
	h1 { font-size: 1.4rem; margin: 0.35rem 0 0.15rem; letter-spacing: -0.015em; }
	.flag { margin-right: 0.25rem; }
	code { font-size: 0.78rem; color: var(--muted); font-family: ui-monospace, monospace; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.msg.ok { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }

	.bar { display: flex; align-items: center; gap: 0.9rem; position: sticky; top: 3rem; z-index: 4;
		background: var(--bg); padding: 0.6rem 0; border-bottom: 1px solid var(--line); }
	.picker input { display: none; }
	.picker span { display: inline-block; padding: 0.45rem 0.85rem; border: 1px dashed var(--line);
		border-radius: 8px; font-size: 0.85rem; color: var(--muted); cursor: pointer; }
	.picker:hover span { color: var(--ink); border-color: var(--accent); }
	.stats { font-size: 0.82rem; color: var(--muted); }
	.stats em { color: var(--warn); font-style: normal; }
	.stats strong { color: var(--accent); }
	.bar .primary { margin-left: auto; padding: 0.5rem 1.1rem; border: 0; border-radius: 8px;
		background: var(--accent); color: var(--accent-ink); font-weight: 600; cursor: pointer; }
	.bar .primary:disabled { opacity: 0.6; cursor: default; }
	.note { font-size: 0.8rem; color: var(--muted); margin: 0.7rem 0 0.9rem; }
	.hint { font-size: 0.82rem; color: var(--warn); margin: 0.5rem 0 0; }
	.empty { color: var(--muted); font-size: 0.9rem; }

	.photos { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
	.photos li { display: grid; grid-template-columns: 1.6rem 96px 1fr auto; gap: 0.7rem; align-items: center;
		border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem; background: var(--panel); cursor: grab; }
	.photos li.new { border-color: var(--accent); }
	.photos li.removing { opacity: 0.45; border-color: var(--danger); }
	.pos { font-size: 0.75rem; color: var(--muted); text-align: center; font-variant-numeric: tabular-nums; }
	.photos img { width: 96px; height: 72px; object-fit: cover; border-radius: 5px; background: var(--bg); }
	.fields { display: grid; gap: 0.3rem; min-width: 0; }
	.fields code em { font-style: normal; opacity: 0.8; }
	.fields input { width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--line);
		border-radius: 6px; background: var(--bg); font-size: 0.82rem; }
	.fields input.missing { border-color: color-mix(in srgb, var(--warn) 50%, var(--line)); }
	.tools { display: flex; flex-direction: column; gap: 0.25rem; }
	.tools button { font-size: 0.72rem; padding: 0.22rem 0.5rem; border: 1px solid var(--line);
		border-radius: 5px; background: var(--panel); cursor: pointer; }
	.tools button:disabled { opacity: 0.35; cursor: default; }
	.tools .danger { color: var(--danger); }

	.danger-zone { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
	.linkish { background: none; border: 0; color: var(--danger); font-size: 0.85rem; cursor: pointer; padding: 0; }
	.danger-zone form { margin-top: 0.75rem; display: grid; gap: 0.5rem; max-width: 30rem; }
	.danger-zone p { font-size: 0.85rem; color: var(--muted); margin: 0; }
	.danger-zone input { padding: 0.5rem 0.6rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
	.danger-zone .danger { padding: 0.5rem 1rem; border: 1px solid var(--danger); border-radius: 8px;
		background: none; color: var(--danger); font-weight: 600; cursor: pointer; }
	.danger-zone .danger:disabled { opacity: 0.4; cursor: default; }
</style>
