<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	let { data, form } = $props();

	const status = $derived(data.status);
	const tasks = $derived(data.tasks);

	const LABEL = { live: 'Live', building: 'Publishing…', stale: 'Not rebuilt', unknown: 'Unknown' } as const;

	const KIND_LABEL: Record<string, string> = {
		'alt-text': 'images to describe',
		'gallery-alt': 'photos to describe',
		translation: 'translations to write',
		description: 'descriptions to tighten',
		'dead-link': 'links to fix',
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
			series: number[];
		};
		visitors?: {
			configured: boolean;
			error: string | null;
			summary: null | { days: number; visits: number; views: number; trend: number | null; pages: { key: string; count: number }[]; series: number[] };
		};
		subscribers?: null | { total: number; newThisMonth: number; series: number[] };
	};
	let insights = $state<Insights | null>(null);
	type Health = { name: string; ok: boolean; ms: number; cold?: boolean; error?: string };
	let fns = $state<Health[] | null>(null);
	let ranDue = $state<{ published: string[]; announced: string[] } | null>(null);
	onMount(() => {
		fetch('/api/insights').then((r) => r.json()).then((d) => (insights = d)).catch(() => {});
		fetch('/api/health/functions').then((r) => r.json()).then((d) => (fns = d.functions)).catch(() => {});
		// Catches up anything the scheduled trigger missed while you were away.
		fetch('/api/schedule/run', { method: 'POST' })
			.then((r) => r.json())
			.then((d) => {
				if (d.published?.length || d.announced?.length) ranDue = d;
			})
			.catch(() => {});
	});

	// Where the site is in its publish: saved, being built, live.
	const STEPS = ['Saved', 'Building', 'Live'] as const;
	const stepOf = $derived(
		status.state === 'live' ? 3 : status.state === 'building' ? 2 : status.state === 'stale' ? 2 : 0
	);

	// Everything that needs a person, worst first. Empty is the good outcome.
	type Item = { level: 'bad' | 'warn' | 'info'; text: string; href?: string; cta?: string };
	const attention = $derived.by(() => {
		const out: Item[] = [];
		if (status.state === 'stale') out.push({ level: 'bad', text: 'The site has not rebuilt since your last change. Check StaticHost.', href: '/?refresh', cta: 'Check again' });
		for (const f of fns ?? []) if (!f.ok) out.push({ level: 'bad', text: `The ${f.name} form is not answering${f.error ? `: ${f.error}` : '.'}` });
		for (const f of data.schedule.failed) out.push({ level: 'bad', text: `Scheduled publishing failed for “${f.slug}”${f.error ? `: ${f.error}` : '.'}`, href: `/posts/${f.slug}`, cta: 'Open it' });
		const dead = tasks.byKind.find(([k]) => k === 'dead-link')?.[1] ?? 0;
		if (dead > 0) out.push({ level: 'warn', text: `${dead} outside link${dead === 1 ? '' : 's'} no longer work.`, href: '/focus', cta: 'Fix them' });
		if (tasks.pending > 0) out.push({ level: 'info', text: `${tasks.pending} answered fix${tasks.pending === 1 ? '' : 'es'} waiting to be published together.`, href: '/focus', cta: 'Publish' });
		if (data.schedule.waiting > 0) out.push({ level: 'info', text: `${data.schedule.waiting} article${data.schedule.waiting === 1 ? ' is' : 's are'} scheduled to go live.`, href: '/posts', cta: 'See which' });
		return out;
	});

	// The three kinds of tidying with the most to do, as numbers.
	const topKinds = $derived(tasks.byKind.slice(0, 3));
	const LANG_NAME: Record<string, string> = { en: 'English', fr: 'Français', it: 'Italiano' };
	const pct = (n: number) => (data.coverage.total ? Math.round((n / data.coverage.total) * 100) : 0);

	let checkingLinks = $state(false);
	const daysAgo = (iso: string) => {
		const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
		return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
	};

	const shortPath = (u: string) => u.replace(/^https?:\/\/[^/]+/, '') || '/';
</script>

<header class="page-head">
	<div>
		<h1>{greeting}</h1>
		<p>Here is how the site is doing.</p>
	</div>
	<div class="top-actions">
		<a class="btn-outline" href="/gallery">Add photos</a>
		<a class="btn-primary" href="/posts/new">Write an article</a>
	</div>
</header>

{#if ranDue}
	<p class="chip ok note-chip">
		{#if ranDue.published.length}Published on schedule: {ranDue.published.join(', ')}.{/if}
		{#if ranDue.announced.length} Newsletter sent for {ranDue.announced.join(', ')}.{/if}
	</p>
{/if}
{#if data.tidied > 0}<p class="chip ok note-chip">{data.tidied} small {data.tidied === 1 ? 'fix' : 'fixes'} published in one go.</p>{/if}
{#if form?.message}<p class="chip danger note-chip">{form.message}</p>{/if}
{#if form?.indexNow}<p class="chip ok note-chip">{form.indexNow}</p>{/if}
{#if form?.linksChecked}<p class="chip ok note-chip">{form.linksChecked} A link has to fail twice, a day apart, before it is called dead.</p>{/if}

<!-- Is the site up to date? Three steps, and where it is on them. -->
<section class="card pipeline" aria-label="Publishing status">
	<ol class="steps">
		{#each STEPS as label, i}
			{@const n = i + 1}
			<li class:done={n < stepOf || (n === stepOf && status.state === 'live')} class:current={n === stepOf && status.state !== 'live'} class:bad={n === stepOf && status.state === 'stale'} class:building={n === stepOf && status.state === 'building'}>
				<span class="dot">
					{#if n < stepOf || (n === stepOf && status.state === 'live')}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
					{:else}{n}{/if}
				</span>
				<span class="name">{label}</span>
			</li>
		{/each}
	</ol>
	<p class="pipe-line">
		<span class="chip" class:ok={status.state === 'live'} class:warn={status.state === 'building'} class:danger={status.state === 'stale'}>{LABEL[status.state]}</span>
		{#if status.ageMinutes !== null}<span>Last built {ago(status.ageMinutes)}</span>{/if}
		{#if status.hugo}<span class="muted">Hugo {status.hugo}</span>{/if}
		<a href="/?refresh">Check again</a>
		<a href={data.siteUrl} target="_blank" rel="noreferrer">Open the site ↗</a>
	</p>
</section>

<!-- The numbers that matter, each with its direction. -->
<section class="stats" aria-label="Numbers">
	<div class="card stat visitors">
		<span class="lbl">Visitors · {insights?.visitors?.summary?.days ?? 28} days</span>
		{#if !insights}<span class="num dim">…</span>
		{:else if insights.visitors?.summary}
			{@const s = insights.visitors.summary}
			<span class="num">{s.visits}</span>
			<span class="sub">{s.views} pages read
				{#if s.trend !== null}<b class="trend" class:up={s.trend > 0} class:down={s.trend < 0}>{s.trend > 0 ? '↑' : s.trend < 0 ? '↓' : '→'} {Math.abs(s.trend)}%</b>{/if}
			</span>
			<div class="spark"><Sparkline values={s.series} /></div>
		{:else}
			<span class="num dim">–</span>
			<span class="sub">{insights.visitors?.error ?? 'Not connected'} · <a href="/visitors">How</a></span>
		{/if}
	</div>

	<div class="card stat search">
		<span class="lbl">Search · {insights?.summary?.days ?? 28} days</span>
		{#if !insights}<span class="num dim">…</span>
		{:else if insights.summary}
			{@const s = insights.summary}
			<span class="num">{s.impressions}</span>
			<span class="sub">appearances · {s.clicks} click{s.clicks === 1 ? '' : 's'}
				{#if s.trend !== null}<b class="trend" class:up={s.trend > 0} class:down={s.trend < 0}>{s.trend > 0 ? '↑' : s.trend < 0 ? '↓' : '→'} {Math.abs(s.trend)}%</b>{/if}
			</span>
			<div class="spark"><Sparkline values={s.series} /></div>
		{:else}
			<span class="num dim">–</span>
			<span class="sub">{insights.configured ? 'Nothing reported yet' : 'Not connected'}</span>
		{/if}
	</div>

	<div class="card stat subs">
		<span class="lbl">Subscribers</span>
		{#if !insights}<span class="num dim">…</span>
		{:else if insights.subscribers}
			{@const s = insights.subscribers}
			<span class="num">{s.total}</span>
			<span class="sub">{s.newThisMonth > 0 ? `+${s.newThisMonth} in 30 days` : 'none new in 30 days'} · <a href="/newsletter">Write to them</a></span>
			<div class="spark"><Sparkline values={s.series} /></div>
		{:else}
			<span class="num dim">–</span>
			<span class="sub">Resend not connected</span>
		{/if}
	</div>

	<div class="card stat articles">
		<span class="lbl">Articles</span>
		<span class="num">{data.stats.total - data.stats.drafts}</span>
		<span class="sub">published · {data.stats.drafts} draft{data.stats.drafts === 1 ? '' : 's'}{data.schedule.waiting ? ` · ${data.schedule.waiting} scheduled` : ''}</span>
		<a class="more" href="/posts">All articles →</a>
	</div>
</section>

<div class="cols">
	<!-- What needs a person. -->
	<section class="card block" aria-label="Needs attention">
		<h2>Needs you {#if attention.length}<span class="n">{attention.length}</span>{/if}</h2>
		{#if attention.length === 0}
			<p class="allgood"><span class="tick" aria-hidden="true">✓</span> Everything is running. Nothing needs you.</p>
		{:else}
			<ul class="attention">
				{#each attention as a}
					<li class={a.level}>
						<span class="mark" aria-hidden="true">{a.level === 'bad' ? '×' : a.level === 'warn' ? '!' : 'i'}</span>
						<span class="what">{a.text}</span>
						{#if a.href}<a class="btn-outline btn-sm" href={a.href}>{a.cta}</a>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<div class="foot">
			<form method="POST" action="?/checklinks" use:enhance={() => { checkingLinks = true; return async ({ update }) => { await update(); checkingLinks = false; }; }}>
				<span>{data.links.lastRun ? `${data.links.count} outside links checked ${daysAgo(data.links.lastRun)}` : 'Outside links not checked yet'}</span>
				<button class="btn-ghost btn-sm" type="submit" disabled={checkingLinks}>{checkingLinks ? 'Checking…' : 'Check now'}</button>
			</form>
			{#if data.indexNow.configured && data.indexNow.queued.length > 0}
				<form method="POST" action="?/indexnow" use:enhance>
					<span>{data.indexNow.queued.length} new URL{data.indexNow.queued.length === 1 ? '' : 's'} for search engines</span>
					<button class="btn-ghost btn-sm" type="submit" disabled={status.state !== 'live'}>Send them</button>
				</form>
			{/if}
			{#if fns}
				<span class="fns">
					{#each fns as f}<span class="chip" class:ok={f.ok} class:danger={!f.ok}>{f.name}</span>{/each}
				</span>
			{/if}
		</div>
	</section>

	<!-- How much of the site exists in each language. -->
	<section class="card block" aria-label="Translations">
		<h2>Translations</h2>
		<ul class="bars">
			{#each ['en', 'fr', 'it'] as l}
				{@const n = data.coverage.langs[l] ?? 0}
				<li>
					<span class="lg">{LANG_NAME[l]}</span>
					<span class="track" role="img" aria-label="{n} of {data.coverage.total} articles"><span class="fill" class:full={n === data.coverage.total} style="width:{pct(n)}%"></span></span>
					<span class="ct">{n}/{data.coverage.total}</span>
				</li>
			{/each}
		</ul>
		<table class="grid">
			<thead><tr><th>Latest</th><th>EN</th><th>FR</th><th>IT</th></tr></thead>
			<tbody>
				{#each data.grid as r}
					<tr>
						<td><a href="/posts/{r.slug}">{r.title}</a></td>
						{#each ['en', 'fr', 'it'] as l}
							<td>{#if r.langs.includes(l)}<span class="yes" title="Translated">✓</span>{:else}<a class="no" href="/posts/{r.slug}" title="Missing: open to write it">+</a>{/if}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<!-- Small jobs, as numbers, with one way in. -->
<section class="card block tidy" class:clear={tasks.total === 0} aria-label="Worth doing">
	<h2>Worth doing {#if tasks.total}<span class="n">{tasks.total}</span>{/if}</h2>
	{#if tasks.total === 0}
		<p class="allgood"><span class="tick" aria-hidden="true">✓</span> Every image is described and every article is translated.</p>
	{:else}
		<div class="kinds">
			{#each topKinds as [kind, n]}
				<div class="kind"><span class="k-num">{n}</span><span class="k-lbl">{KIND_LABEL[kind] ?? kind}</span></div>
			{/each}
			<div class="kind go">
				<a class="btn-primary btn-lg" href="/focus">Start, one at a time</a>
				<span class="k-lbl">Answers are published together, so the site rebuilds once.</span>
			</div>
		</div>
	{/if}
</section>

<div class="cols">
	<section class="card block">
		<h2>Most read</h2>
		{#if insights?.visitors?.summary?.pages.length}
			<ul class="rows">
				{#each insights.visitors.summary.pages as p}
					<li><span class="q">{p.key}</span><span class="cnt">{p.count} read</span></li>
				{/each}
			</ul>
			<a class="more" href="/visitors">All visitor numbers →</a>
		{:else}
			<p class="muted">{insights ? 'Nothing to show yet.' : 'Loading…'}</p>
		{/if}
	</section>
	<section class="card block">
		<h2>Searched for</h2>
		{#if insights?.summary?.queries.length}
			<ul class="rows">
				{#each insights.summary.queries as q}
					<li><span class="q">{q.query}</span><span class="cnt">{q.impressions} seen · {q.clicks} clicked</span></li>
				{/each}
			</ul>
			<a class="more" href="/analytics">All search data →</a>
		{:else}
			<p class="muted">{insights ? 'Nothing to show yet.' : 'Loading…'}</p>
		{/if}
	</section>
</div>

<style>
	.top-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
	.note-chip { display: flex; margin: 0 0 0.8rem; border-radius: 0.6rem; padding: 0.55rem 0.8rem; font-size: 0.86rem; font-weight: 500; }
	.muted { color: var(--muted-foreground); }
	.more { font-size: 0.82rem; text-decoration: none; font-weight: 600; }

	/* publishing steps */
	.pipeline { padding: 1.15rem 1.4rem 1rem; margin-bottom: 1.1rem; }
	.steps { list-style: none; display: flex; margin: 0 0 0.9rem; padding: 0; max-width: 34rem; }
	.steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
	.steps li:not(:last-child)::after { content: ''; position: absolute; top: 0.95rem; left: calc(50% + 1.3rem); right: calc(-50% + 1.3rem); height: 3px; border-radius: 3px; background: var(--border); }
	.steps li.done:not(:last-child)::after { background: var(--ok); }
	.dot { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; border: 2px solid var(--border); background: var(--card); font-weight: 700; font-size: 0.82rem; color: var(--muted-foreground); }
	.name { font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); }
	.done .dot { background: var(--ok); border-color: var(--ok); color: #fff; }
	.done .name { color: var(--ok); }
	.current .dot { background: var(--warn-bg); border-color: var(--warn); color: var(--warn); }
	.current .name { color: var(--warn); }
	.building .dot { animation: pulse 1.4s ease-in-out infinite; }
	.bad .dot { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }
	.bad .name { color: var(--danger); }
	@keyframes pulse { 50% { box-shadow: 0 0 0 6px var(--warn-bg); } }
	@media (prefers-reduced-motion: reduce) { .building .dot { animation: none; } }
	.pipe-line { display: flex; align-items: center; gap: 0.5rem 1rem; flex-wrap: wrap; margin: 0; font-size: 0.86rem; }
	.pipe-line a { font-size: 0.82rem; font-weight: 600; text-decoration: none; }

	/* number cards */
	.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.9rem; margin-bottom: 1.1rem; }
	.stat { display: flex; flex-direction: column; gap: 0.2rem; padding: 1rem 1.15rem 0.9rem; min-width: 0; }
	.stat .lbl { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted-foreground); }
	.stat .num { font-family: 'Fraunces', Georgia, serif; font-size: 2.3rem; font-weight: 600; line-height: 1.1; color: var(--primary-strong); }
	.stat .num.dim { color: var(--muted-foreground); }
	.stat .sub { font-size: 0.82rem; color: var(--muted-foreground); }
	.stat .sub a { font-weight: 600; text-decoration: none; }
	.trend { margin-left: 0.3rem; font-weight: 700; color: var(--muted-foreground); }
	.trend.up { color: var(--ok); }
	.trend.down { color: var(--danger); }
	.spark { margin-top: auto; padding-top: 0.5rem; }
	.visitors .spark { color: var(--primary); }
	.search .spark { color: var(--info); }
	.subs .spark { color: var(--ok); }
	.articles .more { margin-top: auto; padding-top: 0.5rem; }

	.cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin-bottom: 1.1rem; align-items: start; }
	.block { padding: 1.1rem 1.3rem 1.15rem; min-width: 0; }
	.block h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.8rem; font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
	.n { font-size: 0.72rem; padding: 0.05rem 0.5rem; border-radius: 2rem; background: var(--accent); color: var(--primary-strong); letter-spacing: 0; }
	.allgood { display: flex; align-items: center; gap: 0.6rem; margin: 0; font-size: 0.92rem; color: var(--ok); font-weight: 500; }
	.tick { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--ok-bg); border: 1px solid var(--ok-line); font-size: 0.85rem; font-weight: 800; flex: none; }

	/* attention */
	.attention { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
	.attention li { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.7rem; border-radius: 0.65rem; border: 1px solid transparent; font-size: 0.88rem; }
	.attention .what { flex: 1; min-width: 0; overflow-wrap: anywhere; }
	.attention .mark { flex: none; display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; color: #fff; font-size: 0.78rem; font-weight: 800; }
	.attention .bad { background: var(--danger-bg); border-color: var(--danger-line); }
	.attention .bad .mark { background: var(--danger); }
	.attention .warn { background: var(--warn-bg); border-color: var(--warn-line); }
	.attention .warn .mark { background: var(--warn); }
	.attention .info { background: var(--info-bg); border-color: var(--info-line); }
	.attention .info .mark { background: var(--info); }
	.foot { margin-top: 0.9rem; padding-top: 0.7rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--muted-foreground); }
	.foot form { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
	.fns { display: flex; gap: 0.4rem; flex-wrap: wrap; padding-top: 0.3rem; }

	/* translations */
	.bars { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: 0.5rem; }
	.bars li { display: grid; grid-template-columns: 5.2rem 1fr 3rem; align-items: center; gap: 0.7rem; font-size: 0.85rem; }
	.track { height: 0.7rem; border-radius: 1rem; background: var(--muted); overflow: hidden; }
	.fill { display: block; height: 100%; border-radius: 1rem; background: var(--warn); transition: width 0.4s; }
	.fill.full { background: var(--ok); }
	.ct { text-align: right; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
	.grid { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
	.grid th { text-align: left; font-size: 0.7rem; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted-foreground); padding: 0 0 0.35rem; }
	.grid th:not(:first-child), .grid td:not(:first-child) { text-align: center; width: 2.6rem; }
	.grid td { padding: 0.4rem 0; border-top: 1px solid var(--border); }
	.grid td:first-child a { color: var(--foreground); text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 17rem; }
	.grid td:first-child a:hover { color: var(--primary); }
	.yes { color: var(--ok); font-weight: 800; }
	.no { display: inline-grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn); font-weight: 800; text-decoration: none; }

	/* worth doing */
	.tidy { margin-bottom: 1.1rem; }
	.kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.9rem; align-items: stretch; }
	.kind { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.8rem 1rem; border-radius: 0.75rem; background: var(--muted); }
	.k-num { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; font-weight: 600; line-height: 1.1; color: var(--primary-strong); }
	.k-lbl { font-size: 0.82rem; color: var(--muted-foreground); }
	.kind.go { background: transparent; padding-inline: 0; justify-content: center; align-items: flex-start; gap: 0.4rem; }

	.rows { list-style: none; margin: 0 0 0.7rem; padding: 0; display: flex; flex-direction: column; font-size: 0.86rem; }
	.rows li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
	.rows .q { overflow-wrap: anywhere; min-width: 0; }
	.rows .cnt { color: var(--muted-foreground); font-size: 0.8rem; white-space: nowrap; }

	@media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
	@media (max-width: 520px) { .stats { grid-template-columns: 1fr; } .attention li { flex-wrap: wrap; } }
</style>
