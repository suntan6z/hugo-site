<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	let { data, form } = $props();

	const status = $derived(data.status);
	const tasks = $derived(data.tasks);

	const LABEL = { live: 'Live', building: 'Publishing…', stale: 'Not rebuilt', unknown: 'Unknown' } as const;

	const KIND_LABEL: Record<string, string> = {
		'alt-text': 'images to describe',
		'gallery-alt': 'photos to describe',
		translation: 'translations to write',
		'featured-image': 'thumbnails to choose',
		description: 'descriptions to tighten',
		'now-check': 'page to check'
	};

	function ago(mins: number | null) {
		if (mins === null) return '';
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const h = Math.floor(mins / 60);
		return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
	}

	const hour = new Date().getHours();
	const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

	// Search numbers and form health are someone else's servers: after render.
	type Insights = {
		configured: boolean;
		summary: null | {
			days: number; clicks: number; impressions: number; trend: number | null; stale: boolean;
			queries: { query: string; clicks: number; impressions: number }[];
			pages: { url: string; clicks: number; impressions: number }[];
		};
	};
	let insights = $state<Insights | null>(null);
	type Health = { name: string; ok: boolean; ms: number; cold?: boolean; error?: string };
	let fns = $state<Health[] | null>(null);
	let ranDue = $state<{ published: string[]; announced: string[] } | null>(null);
	onMount(() => {
		fetch('/api/insights').then((r) => r.json()).then((d) => (insights = d)).catch(() => {});
		fetch('/api/health/functions').then((r) => r.json()).then((d) => (fns = d.functions)).catch(() => {});
		// Catches up anything the scheduled workflow missed while you were away.
		fetch('/api/schedule/run', { method: 'POST' })
			.then((r) => r.json())
			.then((d) => {
				if (d.published?.length || d.announced?.length) ranDue = d;
			})
			.catch(() => {});
	});

	const shortPath = (u: string) => u.replace(/^https?:\/\/[^/]+/, '') || '/';
</script>

<header class="hello">
	<h1>{greeting}</h1>
	<p class="status {status.state}">
		<i></i>
		{LABEL[status.state]}
		{#if status.ageMinutes !== null}<span>· built {ago(status.ageMinutes)}</span>{/if}
		<a href="/?refresh" title="Check again">refresh</a>
	</p>
</header>

{#if ranDue}
	<p class="msg ok">
		{#if ranDue.published.length}Published on schedule: {ranDue.published.join(', ')}.{/if}
		{#if ranDue.announced.length} Newsletter sent for {ranDue.announced.join(', ')}.{/if}
	</p>
{/if}

{#if data.tidied > 0}
	<p class="msg ok">{data.tidied} small {data.tidied === 1 ? 'fix' : 'fixes'} published in one go.</p>
{/if}
{#if form?.message}<p class="msg err">{form.message}</p>{/if}
{#if form?.indexNow}<p class="msg ok">{form.indexNow}</p>{/if}

<div class="actions">
	<a class="do primary" href="/posts/new">
		<strong>Write an article</strong>
		<span>Editor, translations, publishing</span>
	</a>
	<a class="do" href="/gallery">
		<strong>Add photos</strong>
		<span>Cities, captions, ordering</span>
	</a>
</div>

<section class="todo frame-ish" class:clear={tasks.total === 0}>
	<div class="todo-head">
		<h2>Worth doing</h2>
		{#if tasks.total > 0}<span class="pill">{tasks.total}</span>{/if}
	</div>

	{#if tasks.total === 0}
		<p class="note">Nothing to tidy: every image is described, every article is translated.</p>
		{#if tasks.pending > 0}
			<a class="btn-primary" href="/focus">Publish {tasks.pending} waiting change{tasks.pending === 1 ? '' : 's'}</a>
		{/if}
	{:else}
		<ul class="kinds">
			{#each tasks.byKind as [kind, n]}
				<li><b>{n}</b> {KIND_LABEL[kind] ?? kind}</li>
			{/each}
		</ul>
		<ol class="next">
			{#each tasks.next as t}
				<li><strong>{t.title}</strong> <span>{t.where}</span></li>
			{/each}
		</ol>
		<div class="todo-actions">
			<a class="btn-primary" href="/focus">Start · one at a time</a>
			{#if tasks.pending > 0}<span class="note">{tasks.pending} answered, waiting to publish</span>{/if}
		</div>
		<p class="note small">Answers are collected and published together, so the site rebuilds once.</p>
	{/if}
</section>

<section class="insights">
	<h2>Search</h2>
	{#if !insights}
		<p class="note">Checking…</p>
	{:else if !insights.configured}
		<p class="note">Not connected — set BING_API_KEY to see search numbers.</p>
	{:else if !insights.summary}
		<p class="note">Bing has nothing to report yet.</p>
	{:else}
		<p class="figures">
			<b>{insights.summary.impressions}</b> appearances in search and
			<b>{insights.summary.clicks}</b> click{insights.summary.clicks === 1 ? '' : 's'}
			over {insights.summary.days} days
			{#if insights.summary.trend !== null}
				<span class="trend" class:up={insights.summary.trend > 0} class:down={insights.summary.trend < 0}>
					{insights.summary.trend > 0 ? '↑' : insights.summary.trend < 0 ? '↓' : '→'}
					{Math.abs(insights.summary.trend)}%
				</span>
			{/if}
		</p>
		{#if insights.summary.queries.length}
			<ul class="rows">
				{#each insights.summary.queries as q}
					<li><span class="q">{q.query}</span><span class="n">{q.impressions} seen · {q.clicks} clicked</span></li>
				{/each}
			</ul>
		{/if}
		{#if insights.summary.pages.length}
			<ul class="rows pages">
				{#each insights.summary.pages as p}
					<li><span class="q">{shortPath(p.url)}</span><span class="n">{p.impressions} seen</span></li>
				{/each}
			</ul>
		{/if}
		<a class="more" href="/analytics">All search data →</a>
	{/if}
</section>

<section class="strip">
	<span>{data.stats.total} articles</span>
	<span>{data.stats.drafts} draft{data.stats.drafts === 1 ? '' : 's'}</span>
	{#if fns}
		{#each fns as f}
			<span class="fn" class:bad={!f.ok}>{f.name}: {f.ok ? 'ok' : (f.error ?? 'down')}</span>
		{/each}
	{/if}
	{#if data.indexNow.configured && data.indexNow.queued.length > 0}
		<form method="POST" action="?/indexnow" use:enhance>
			<button class="linkish" type="submit" disabled={status.state !== 'live'}>
				Tell search engines about {data.indexNow.queued.length} URL{data.indexNow.queued.length === 1 ? '' : 's'}
			</button>
		</form>
	{/if}
</section>

<style>
	.hello { margin-bottom: 1.25rem; }
	h1 { font-size: 1.6rem; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
	.status { margin: 0; font-size: 0.85rem; color: var(--muted-foreground); display: flex; align-items: center; gap: 0.4rem; }
	.status i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted-foreground); display: inline-block; }
	.status.live i { background: var(--ok); }
	.status.building i { background: var(--warn); }
	.status.stale i { background: var(--danger); }
	.status a { color: var(--muted-foreground); font-size: 0.78rem; }

	.actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: 0.8rem; margin-bottom: 1.25rem; }
	.do { display: flex; flex-direction: column; gap: 0.15rem; padding: 1.1rem 1.2rem; border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; color: inherit; background: var(--card); transition: transform 0.12s ease, border-color 0.12s ease; }
	.do:hover { transform: translateY(-1px); border-color: var(--primary); }
	.do strong { font-size: 1.05rem; }
	.do span { font-size: 0.82rem; color: var(--muted-foreground); }
	.do.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
	.do.primary span { color: color-mix(in srgb, var(--primary-foreground) 80%, transparent); }

	.todo { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.2rem; margin-bottom: 1.25rem; background: var(--card); }
	.todo.clear { background: transparent; }
	.todo-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.7rem; }
	.todo h2, .insights h2 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); margin: 0; font-family: 'DM Sans', system-ui, sans-serif; }
	.kinds { list-style: none; margin: 0 0 0.8rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; font-size: 0.88rem; color: var(--muted-foreground); }
	.kinds b { color: var(--foreground); }
	.next { margin: 0 0 1rem; padding-left: 1.1rem; font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.2rem; }
	.next span { color: var(--muted-foreground); font-size: 0.82rem; }
	.todo-actions { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
	.todo-actions a { text-decoration: none; }
	.note { font-size: 0.85rem; color: var(--muted-foreground); margin: 0; }
	.note.small { font-size: 0.78rem; margin-top: 0.6rem; }

	.insights { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.2rem; margin-bottom: 1.25rem; }
	.figures { margin: 0.5rem 0 0.8rem; font-size: 0.95rem; }
	.trend { font-size: 0.82rem; color: var(--muted-foreground); margin-left: 0.3rem; }
	.trend.up { color: var(--ok); }
	.trend.down { color: var(--danger); }
	.rows { list-style: none; margin: 0 0 0.6rem; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
	.rows li { display: flex; justify-content: space-between; gap: 1rem; }
	.rows .n { color: var(--muted-foreground); font-size: 0.8rem; white-space: nowrap; }
	.rows.pages .q { font-family: ui-monospace, monospace; font-size: 0.8rem; overflow-wrap: anywhere; }
	.more { font-size: 0.82rem; text-decoration: none; }

	.strip { display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; align-items: center; font-size: 0.8rem; color: var(--muted-foreground); padding-top: 0.5rem; border-top: 1px solid var(--border); }
	.strip .fn.bad { color: var(--danger); }
	.linkish { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; font-size: 0.8rem; text-decoration: underline; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
