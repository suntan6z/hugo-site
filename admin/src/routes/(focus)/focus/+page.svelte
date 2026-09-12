<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	const task = $derived(data.task);
	const ctx = $derived(data.context as {
		images?: string[];
		english?: { title: string; description: string; body: string };
		current?: { title: string; description: string; body: string };
	});

	let value = $state('');
	let title = $state('');
	let description = $state('');
	let body = $state('');
	let busy = $state(false);
	let translating = $state(false);
	let mtError = $state('');

	// A new card: empty the fields, or seed them with what is already there.
	let loadedId = $state('');
	$effect(() => {
		if (!task || task.id === loadedId) return;
		loadedId = task.id;
		value = task.kind === 'description' ? (task.current ?? '') : '';
		title = '';
		description = '';
		body = '';
		mtError = '';
	});

	const LANG_NAME: Record<string, string> = { en: 'English', fr: 'Français', it: 'Italiano' };

	/** DeepL fills the translation card, exactly as it does in the editor. */
	async function draft() {
		if (!task?.slug || !task.lang || !ctx.english) return;
		translating = true;
		mtError = '';
		try {
			const r = await fetch('/api/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ slug: task.slug, to: task.lang, fields: ctx.english })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`);
			const { fields } = await r.json();
			title = fields.title;
			description = fields.description;
			body = fields.body;
		} catch (e) {
			mtError = e instanceof Error ? e.message : String(e);
		} finally {
			translating = false;
		}
	}

	// Swipe: right answers, left skips — the same two buttons, for a thumb.
	let startX = 0;
	let dx = $state(0);
	let card = $state<HTMLElement | null>(null);
	const onStart = (e: TouchEvent) => (startX = e.touches[0].clientX);
	const onMove = (e: TouchEvent) => (dx = e.touches[0].clientX - startX);
	function onEnd() {
		const moved = dx;
		dx = 0;
		if (Math.abs(moved) < 90) return;
		const which = moved > 0 ? 'answer' : 'skip';
		// Only swipe-to-answer a card that has an answer in it.
		if (which === 'answer' && !canAnswer) return;
		card?.querySelector<HTMLButtonElement>(`button[data-act="${which}"]`)?.click();
	}

	const canAnswer = $derived(
		task?.kind === 'translation'
			? title.trim() !== '' && body.trim() !== ''
			: task?.kind === 'now-check'
				? true
				: value.trim() !== ''
	);

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head><title>Focus · loconsole admin</title></svelte:head>

<div class="bar">
	<span class="count">
		{#if data.remaining > 0}{data.remaining} to go{:else}All clear{/if}
		{#if data.pending > 0}<em>· {data.pending} waiting to publish</em>{/if}
	</span>
	<form method="POST" action="?/finish" use:enhance>
		<button class="btn-primary" type="submit">
			{data.pending > 0 ? `Publish ${data.pending} and leave` : 'Leave'}
		</button>
	</form>
</div>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}

{#if !task}
	<section class="done card">
		<h1>Nothing left</h1>
		<p>
			{#if data.pending > 0}
				{data.pending} change{data.pending === 1 ? '' : 's'} {data.pending === 1 ? 'is' : 'are'} waiting. Publishing them
				rebuilds the site once, not once per change.
			{:else}
				No missing alt text, no missing translations, nothing out of date.
			{/if}
		</p>
		<div class="row">
			<form method="POST" action="?/finish" use:enhance>
				<button class="btn-primary" type="submit">{data.pending > 0 ? 'Publish and leave' : 'Back home'}</button>
			</form>
			{#if data.pending > 0}
				<form method="POST" action="?/discard" use:enhance>
					<button class="btn-outline" type="submit">Discard them</button>
				</form>
			{/if}
		</div>
	</section>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<section
		class="card task"
		bind:this={card}
		style:transform={dx ? `translateX(${dx / 2}px) rotate(${dx / 60}deg)` : ''}
		ontouchstart={onStart}
		ontouchmove={onMove}
		ontouchend={onEnd}
	>
		<p class="where">{task.where}</p>
		<h1>{task.title}</h1>

		<form method="POST" action="?/answer" use:enhance={submit}>
			<input type="hidden" name="id" value={task.id} />
			<input type="hidden" name="kind" value={task.kind} />
			{#if task.slug}<input type="hidden" name="slug" value={task.slug} />{/if}
			{#if task.lang}<input type="hidden" name="lang" value={task.lang} />{/if}

			{#if task.kind === 'alt-text'}
				<input type="hidden" name="image" value={task.image} />
				<img class="shot" src="/api/image/{task.slug}/{task.image}" alt="" />
				<label>
					What is in this picture?
					<input name="value" bind:value placeholder="A group of people in a circle, mid-workshop" autocomplete="off" />
				</label>
				<p class="hint">Read aloud by screen readers and read by search engines. Never shown on the page.</p>

			{:else if task.kind === 'gallery-alt'}
				<input type="hidden" name="city" value={task.city} />
				<input type="hidden" name="file" value={task.file} />
				<img class="shot" src="/api/gallery-image/{task.city}/{task.file}" alt="" />
				<label>
					What is in this photo?
					<input name="value" bind:value placeholder="A narrow street of pastel houses at dusk" autocomplete="off" />
				</label>

			{:else if task.kind === 'description'}
				<label>
					One sentence for search results and social cards
					<textarea name="value" rows="3" bind:value></textarea>
					<span class="count-hint" class:warn={value.length > 0 && (value.length < 120 || value.length > 160)}>
						{value.length} characters · 120–160 reads best
					</span>
				</label>

			{:else if task.kind === 'featured-image'}
				<p class="hint">Without one, this article shows no thumbnail on the homepage.</p>
				<div class="pick">
					{#each ctx.images ?? [] as img}
						<label class="thumb" class:picked={value === img}>
							<input type="radio" name="value" value={img} bind:group={value} />
							<img src="/api/image/{task.slug}/{img}" alt="" />
							<span>{img}</span>
						</label>
					{/each}
				</div>

			{:else if task.kind === 'translation'}
				<div class="mt">
					{#if data.canTranslate}
						<button type="button" class="btn-outline" onclick={draft} disabled={translating}>
							{translating ? 'Translating…' : `Draft ${LANG_NAME[task.lang ?? 'fr']} from English`}
						</button>
						<span>Then correct it — nothing is published until you leave.</span>
					{:else}
						<span>Add DEEPL_API_KEY to draft this automatically.</span>
					{/if}
				</div>
				{#if mtError}<p class="msg err">{mtError}</p>{/if}
				<label>Title<input name="title" bind:value={title} autocomplete="off" /></label>
				<label>Description<textarea name="description" rows="2" bind:value={description}></textarea></label>
				<label>Body<textarea name="body" rows="12" bind:value={body}></textarea></label>
				<details>
					<summary>The English version</summary>
					<pre>{ctx.english?.body ?? ''}</pre>
				</details>

			{:else if task.kind === 'now-check'}
				<p class="hint">
					Your Now page has not changed in a while. If it is still accurate, say so and it will stop asking for three
					months.
				</p>
			{/if}

			<div class="row">
				<button class="btn-primary" type="submit" data-act="answer" disabled={busy || !canAnswer}>
					{task.kind === 'now-check' ? 'Still true' : 'Done'}
				</button>
			</div>
		</form>

		<form method="POST" action="?/skip" use:enhance={submit}>
			<input type="hidden" name="id" value={task.id} />
			<input type="hidden" name="kind" value={task.kind} />
			<button class="linkish" type="submit" data-act="skip" disabled={busy}>Skip for now</button>
		</form>
		<p class="swipe-hint">Swipe right when done, left to skip.</p>
	</section>
{/if}

<style>
	.bar { width: 100%; max-width: 44rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
	.count { font-size: 0.9rem; color: var(--muted-foreground); }
	.count em { font-style: normal; color: var(--warn); }
	.card { width: 100%; max-width: 44rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }
	.task { transition: transform 0.12s ease-out; touch-action: pan-y; }
	.where { margin: 0; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); font-family: 'DM Sans', system-ui, sans-serif; }
	h1 { font-size: 1.35rem; margin: 0.3rem 0 1.1rem; letter-spacing: -0.015em; }
	.shot { display: block; width: 100%; max-height: 46vh; object-fit: contain; border-radius: 10px; background: var(--muted); margin-bottom: 1rem; }
	label { display: block; margin-bottom: 0.9rem; }
	.hint { font-size: 0.84rem; color: var(--muted-foreground); margin: 0 0 0.9rem; }
	.count-hint { font-size: 0.78rem; color: var(--muted-foreground); }
	.count-hint.warn { color: var(--warn); }
	.row { display: flex; gap: 0.6rem; align-items: center; margin-top: 0.4rem; }
	.pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr)); gap: 0.6rem; margin-bottom: 1rem; }
	.thumb { margin: 0; border: 2px solid var(--border); border-radius: 10px; overflow: hidden; cursor: pointer; display: block; }
	.thumb.picked { border-color: var(--primary); }
	.thumb input { position: absolute; opacity: 0; pointer-events: none; }
	.thumb img { display: block; width: 100%; height: 6.5rem; object-fit: cover; }
	.thumb span { display: block; font-size: 0.7rem; padding: 0.3rem 0.4rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
	.mt { display: flex; gap: 0.7rem; align-items: center; flex-wrap: wrap; padding: 0.55rem 0.75rem; border: 1px dashed var(--border); border-radius: var(--radius); margin-bottom: 0.9rem; }
	.mt span { font-size: 0.8rem; color: var(--muted-foreground); }
	details { margin: 0 0 0.9rem; font-size: 0.85rem; color: var(--muted-foreground); }
	details pre { white-space: pre-wrap; max-height: 14rem; overflow-y: auto; background: var(--muted); padding: 0.6rem; border-radius: 8px; font-size: 0.78rem; }
	.linkish { background: none; border: 0; color: var(--muted-foreground); cursor: pointer; font-size: 0.86rem; padding: 0.4rem 0; text-decoration: underline; }
	.swipe-hint { font-size: 0.76rem; color: var(--muted-foreground); margin: 0.2rem 0 0; }
	.msg { padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.86rem; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.done h1 { margin-top: 0; }
	@media (min-width: 700px) { .swipe-hint { display: none; } }
</style>
