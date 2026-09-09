<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const stats = $derived(data.stats);
	const posts = $derived(data.posts);
	const status = $derived(data.status);

	const LABEL = {
		live: 'Live',
		building: 'Publishing…',
		stale: 'Not rebuilt',
		unknown: 'Unknown'
	} as const;

	function ago(mins: number | null) {
		if (mins === null) return '';
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const h = Math.floor(mins / 60);
		return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
	}

	// Group the debt by language so it reads as work to do, not as a raw number.
	const debtByLang = $derived(
		(['fr', 'it'] as const).map((l) => ({
			lang: l,
			slugs: stats.translationDebt.filter((d) => d.lang === l).map((d) => d.slug)
		}))
	);
</script>

<div class="head">
	<h1>Dashboard</h1>
	<a class="refresh" href="/?refresh" title="Bypass the 30s cache on build-info.json">Refresh</a>
</div>

<section class="deploy {status.state}">
	<div class="dot"></div>
	<div class="txt">
		<strong>{LABEL[status.state]}</strong>
		<span>{status.detail}</span>
	</div>
	<div class="when">
		{#if status.builtAt}
			<span title={status.builtAt}>built {ago(status.ageMinutes)}</span>
			{#if status.hugo}<span class="hugo">Hugo {status.hugo}</span>{/if}
		{/if}
	</div>
</section>

<section class="tiles">
	<a class="tile" href="/posts"><span class="n">{stats.total}</span><span class="l">articles</span></a>
	<a class="tile" href="/posts"><span class="n">{stats.drafts}</span><span class="l">drafts</span></a>
	<div class="tile" class:flag={stats.missingFeatured.length > 0}>
		<span class="n">{stats.missingFeatured.length}</span><span class="l">no featured image</span>
	</div>
	<div class="tile" class:flag={stats.translationDebt.length > 0}>
		<span class="n">{stats.translationDebt.length}</span><span class="l">missing translations</span>
	</div>
</section>

{#if form?.indexNow}<p class="note ok">{form.indexNow}</p>{/if}
{#if form?.message}<p class="note bad">{form.message}</p>{/if}

{#if data.indexNow.configured && data.indexNow.queued.length > 0}
	<section class="indexnow" class:ready={status.state === 'live'}>
		<div>
			<strong>{data.indexNow.queued.length} URL{data.indexNow.queued.length === 1 ? '' : 's'} ready for IndexNow</strong>
			<span>
				{#if status.state === 'live'}
					Bing will be told these changed instead of waiting to crawl them.
				{:else}
					Waiting for the deploy — submitting now would point Bing at a page that still 404s.
				{/if}
			</span>
		</div>
		<form method="POST" action="?/indexnow" use:enhance>
			<button type="submit" disabled={status.state !== 'live'}>Submit</button>
		</form>
	</section>
{/if}

{#if !data.fromManifest}
	<p class="note warn">
		Counts are from the repository, not the live site — <code>/en/build-info.json</code> could not be
		read. Translation counts may be optimistic, because a placeholder file looks like a translation
		from the repo alone.
	</p>
{/if}

{#if stats.missingFeatured.length > 0}
	<section class="gap">
		<h2>No featured image</h2>
		<p>
			The homepage “Latest Articles” grid only shows a thumbnail when <code>featured_image</code> is
			set — it has no fallback to the first image in the body.
		</p>
		<ul class="chips">
			{#each stats.missingFeatured as slug}<li><a href="/posts/{slug}">{slug}</a></li>{/each}
		</ul>
	</section>
{/if}

{#if stats.translationDebt.length > 0}
	<section class="gap">
		<h2>Missing translations</h2>
		<p>
			Articles with no real translation in a language. A file flagged
			<code>untranslated</code> is a placeholder and counts as missing.
		</p>
		{#each debtByLang as row}
			{#if row.slugs.length}
				<div class="lang-row">
					<span class="lang">{row.lang}</span>
					<ul class="chips">
						{#each row.slugs as slug}<li><a href="/posts/{slug}">{slug}</a></li>{/each}
					</ul>
				</div>
			{/if}
		{/each}
	</section>
{/if}

<h2 class="recent">Recent</h2>
<ul class="posts">
	{#each posts as p}
		<li>
			<a href="/posts/{p.slug}">{p.title}</a>
			<span class="meta">
				{p.date} · {p.category}
				{#if p.draft}<em>draft</em>{/if}
				<span class="langs">{p.langs.join(' ')}</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.refresh { font-size: 0.82rem; text-decoration: none; color: var(--muted); }
	.refresh:hover { color: var(--ink); }

	.deploy {
		display: flex; align-items: center; gap: 0.75rem;
		border: 1px solid var(--line); border-radius: var(--radius);
		background: var(--panel); padding: 0.8rem 1rem; margin-bottom: 1rem;
	}
	.deploy .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--muted); }
	.deploy.live .dot { background: var(--accent); }
	.deploy.building .dot { background: var(--warn); animation: pulse 1.2s ease-in-out infinite; }
	.deploy.stale .dot, .deploy.unknown .dot { background: var(--danger); }
	@keyframes pulse { 50% { opacity: 0.25; } }
	.deploy .txt { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.deploy strong { font-size: 0.9rem; }
	.deploy span { font-size: 0.82rem; color: var(--muted); }
	.deploy .when { margin-left: auto; text-align: right; display: flex; flex-direction: column; }
	.deploy .hugo { font-size: 0.72rem; opacity: 0.75; }

	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; }
	.tile {
		background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
		padding: 1rem; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 0.15rem;
	}
	.tile.flag { border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
	.n { font-size: 1.7rem; font-weight: 650; letter-spacing: -0.02em; }
	.l { font-size: 0.82rem; color: var(--muted); }

	.gap { margin-top: 1.5rem; }
	.gap h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 0.35rem; }
	.gap p { font-size: 0.84rem; color: var(--muted); margin: 0 0 0.6rem; }
	.lang-row { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.4rem; }
	.lang { font-variant: small-caps; font-weight: 700; letter-spacing: 0.06em; font-size: 0.8rem; color: var(--muted); }
	.chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.chips a {
		display: inline-block; font-size: 0.76rem; padding: 0.18rem 0.5rem;
		border: 1px solid var(--line); border-radius: 999px; text-decoration: none;
		color: var(--muted); background: var(--panel);
	}
	.chips a:hover { color: var(--ink); border-color: var(--accent); }

	.indexnow { display: flex; align-items: center; gap: 1rem; margin-top: 1rem;
		background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.8rem 1rem; }
	.indexnow.ready { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
	.indexnow div { display: flex; flex-direction: column; gap: 0.1rem; }
	.indexnow strong { font-size: 0.88rem; }
	.indexnow span { font-size: 0.8rem; color: var(--muted); }
	.indexnow form { margin-left: auto; }
	.indexnow button { padding: 0.45rem 0.9rem; border: 0; border-radius: 8px;
		background: var(--accent); color: var(--accent-ink); font-weight: 600; cursor: pointer; font-size: 0.85rem; }
	.indexnow button:disabled { opacity: 0.45; cursor: default; }
	.note.ok { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); border: 0; }
	.note.bad { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); border: 0; }

	.note { font-size: 0.84rem; padding: 0.75rem 1rem; border-radius: var(--radius); margin: 1rem 0 0; }
	.note.warn { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--warn); color: var(--muted); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }

	h2.recent { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 2rem 0 0.6rem; }
	.posts { list-style: none; padding: 0; margin: 0; }
	.posts li { padding: 0.6rem 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
	.posts a { text-decoration: none; font-weight: 550; }
	.posts a:hover { text-decoration: underline; }
	.meta { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
	.meta em { color: var(--warn); font-style: normal; font-weight: 600; }
	.langs { font-variant: small-caps; letter-spacing: 0.05em; margin-left: 0.4rem; }
</style>
