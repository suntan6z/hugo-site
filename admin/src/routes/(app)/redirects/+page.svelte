<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	const title = (slug: string | null) => data.articles.find((a) => a.slug === slug)?.title ?? slug ?? '';

	let adding = $state(false);
	let confirmRemove = $state<string | null>(null);
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			confirmRemove = null;
		};
	};
	const keyOf = (g: (typeof data.groups)[number]) => g.oldSlug ?? g.files[0].from;
</script>

<div class="head">
	<div>
		<a class="back" href="/settings">← Settings</a>
		<h1>Old addresses</h1>
	</div>
	<button type="button" class="btn-outline" onclick={() => (adding = !adding)}>{adding ? 'Cancel' : 'Add a redirect'}</button>
</div>

<p class="lede">
	When an article changes address, its old one keeps working by sending visitors on. Renaming an article
	adds these automatically; this is where to check them, point them elsewhere, or add one by hand.
</p>

{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.saved}
	<p class="msg ok">
		{form.saved}
		{#if form.removedNote}
			The live site keeps serving the old redirect regardless: the host never deletes files a build stops
			producing. It stops only if the host is cleared.
		{/if}
	</p>
{/if}

{#if adding}
	<form class="add card" method="POST" action="?/add" use:enhance={submit}>
		<label>Old address
			<span class="prefix"><span>/blog/</span><input name="from" placeholder="old-article-name" autocomplete="off" spellcheck="false" required /></span>
		</label>
		<label>Leads to
			<select name="to" required>
				<option value="">Choose an article…</option>
				{#each data.articles as a}<option value={a.slug}>{a.title}</option>{/each}
			</select>
		</label>
		<p class="note">Covers English, French and Italian at once.</p>
		<button type="submit" class="btn-primary" disabled={busy}>Add redirect</button>
	</form>
{/if}

{#if data.groups.length === 0}
	<p class="empty">No redirects. Every address the site has published still belongs to its article.</p>
{:else}
	<ul class="list">
		{#each data.groups as g (keyOf(g))}
			<li class:bad={g.problems.length > 0}>
				<div class="route">
					{#if g.oldSlug}
						<code>/blog/{g.oldSlug}/</code>
						<span class="arrow">→</span>
						{#if g.targetSlug && data.articles.some((a) => a.slug === g.targetSlug)}
							<a href="/posts/{g.targetSlug}">{title(g.targetSlug)}</a>
						{:else}
							<code>/blog/{g.targetSlug}/</code>
						{/if}
						<span class="langs">{g.langs.join(' · ')}</span>
					{:else}
						<code>{g.files[0].from}</code>
						<span class="arrow">→</span>
						<code>{g.files[0].to}</code>
					{/if}
				</div>
				{#each g.messages as m}<p class="problem">{m}</p>{/each}
				<div class="controls">
					{#if g.oldSlug && !g.problems.includes('shadowed')}
						<form method="POST" action="?/retarget" use:enhance={submit}>
							<input type="hidden" name="from" value={g.oldSlug} />
							<select name="to" aria-label="Lead to">
								{#each data.articles as a}<option value={a.slug} selected={a.slug === g.targetSlug}>{a.title}</option>{/each}
							</select>
							<button type="submit" class="btn-outline small" disabled={busy}>Point here</button>
						</form>
					{/if}
					{#if confirmRemove === keyOf(g)}
						<form method="POST" action="?/remove" use:enhance={submit}>
							<input type="hidden" name="paths" value={g.files.map((f) => f.path).join('\n')} />
							<button type="submit" class="linkish danger" disabled={busy}>Remove for good</button>
							<button type="button" class="linkish" onclick={() => (confirmRemove = null)}>Keep</button>
						</form>
					{:else}
						<button type="button" class="linkish" onclick={() => (confirmRemove = keyOf(g))}>Remove</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<p class="note">
		Removing a redirect takes it out of the site's source, but the host keeps serving the copy it already has.
		Pointing it somewhere useful is almost always the better fix.
	</p>
{/if}

<style>
	.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.back { font-size: 0.85rem; text-decoration: none; color: var(--muted-foreground); }
	h1 { font-size: 1.5rem; margin: 0.35rem 0 0; letter-spacing: -0.015em; }
	.lede { font-size: 0.9rem; color: var(--muted-foreground); max-width: 44rem; margin: 0 0 1.25rem; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.add { display: grid; gap: 0.8rem; max-width: 34rem; padding: 1rem 1.1rem; margin-bottom: 1.5rem; }
	.add button { justify-self: start; }
	.prefix { display: flex; align-items: center; gap: 0.3rem; margin-top: 0.4rem; }
	.prefix span { font-family: ui-monospace, monospace; font-size: 0.85rem; color: var(--muted-foreground); }
	.prefix input { flex: 1; margin: 0 !important; }
	.list { list-style: none; padding: 0; margin: 0 0 1rem; }
	.list li { border-bottom: 1px solid var(--border); padding: 0.75rem 0; display: grid; gap: 0.4rem; }
	.list li.bad { border-left: 3px solid var(--warn); padding-left: 0.75rem; }
	.route { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.6rem; font-size: 0.9rem; }
	.route a { text-decoration: none; font-weight: 500; }
	.arrow { color: var(--muted-foreground); }
	.langs { font-size: 0.72rem; color: var(--muted-foreground); font-variant: small-caps; }
	.problem { margin: 0; font-size: 0.83rem; color: var(--warn); }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
	.controls form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
	.controls select { font-size: 0.82rem; padding: 0.35rem 0.5rem; max-width: 22rem; }
	.small { padding: 0.3rem 0.8rem; font-size: 0.82rem; }
	.linkish { background: none; border: 0; padding: 0; font-size: 0.82rem; color: var(--muted-foreground); text-decoration: underline; cursor: pointer; }
	.linkish.danger, .linkish:hover { color: var(--danger); }
	.empty, .note { font-size: 0.85rem; color: var(--muted-foreground); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
