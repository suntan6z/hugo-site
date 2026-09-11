<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();

	const bing = $derived(data.bing);
	const points = $derived(bing.data?.traffic ?? []);
	// Two tracks, each scaled to its own maximum. Nesting clicks inside the
	// impression bar is proportionally honest but unreadable: search CTR runs a
	// few percent, so the clicks were a one-pixel sliver.
	const maxImp = $derived(Math.max(1, ...points.map((p) => p.impressions)));
	const maxClicks = $derived(Math.max(1, ...points.map((p) => p.clicks)));
	const fmt = (n: number) => n.toLocaleString('en-GB');
	const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
	const shortUrl = (u: string) => u.replace(/^https?:\/\/[^/]+/, '') || '/';
</script>

<div class="head">
	<h1>Search</h1>
	{#if bing.configured}
		<form method="POST" action="?/refresh" use:enhance>
			<button type="submit">Refresh</button>
		</form>
	{/if}
</div>

{#if !bing.configured}
	<section class="setup">
		<h2>Bing Webmaster Tools is not connected</h2>
		<ol>
			<li>Open <a href="https://www.bing.com/webmasters/" target="_blank" rel="noreferrer">Bing Webmaster Tools</a> → Settings → API Access → API Key.</li>
			<li>Add it to <code>admin/.env</code> as <code>BING_API_KEY=…</code>.</li>
			<li>Run <code>cd admin && ./scripts/create-container.sh</code> to push it to the container.</li>
		</ol>
		<p class="note">
			The key is account-scoped, and <code>{data.siteUrl}</code> must already be verified under
			that account.
		</p>
	</section>
{:else if bing.error}
	<p class="msg err">{bing.error}</p>
{:else if bing.data}
	{#if data.totals.impressions > 0 && data.totals.clicks === 0}
		<p class="explain">
			Your pages have appeared in Bing results {fmt(data.totals.impressions)} times but have not
			been clicked yet. At this stage impressions and average position are the numbers worth
			watching — clicks follow once pages rank high enough to be seen.
		</p>
	{:else if data.totals.impressions === 0}
		<p class="explain">
			Bing has not shown your pages in any results yet. Indexing a new site takes weeks; the
			IndexNow submissions on the dashboard tell Bing about changes sooner.
		</p>
	{/if}

	<section class="tiles">
		<div class="tile">
			<span class="n">{fmt(data.totals.clicks)}</span>
			<span class="l">clicks</span>
			{#if data.trend.enough}
				<span class="delta" class:up={data.trend.change >= 0}>
					{data.trend.change >= 0 ? '▲' : '▼'} {Math.abs(data.trend.change).toFixed(0)}%
				</span>
			{/if}
		</div>
		<div class="tile"><span class="n">{fmt(data.totals.impressions)}</span><span class="l">impressions</span></div>
		<div class="tile"><span class="n">{data.totals.ctr.toFixed(1)}%</span><span class="l">click-through rate</span></div>
		<div class="tile"><span class="n">{points.length}</span><span class="l">days of data</span></div>
	</section>

	{#if points.length > 0}
		<section class="chart">
			<h2>Impressions and clicks</h2>
			<div class="track">
				<span class="scale">{fmt(maxImp)}</span>
				<div class="bars">
					{#each points as p}
						<div class="col" title="{day(p.date)} — {fmt(p.impressions)} impressions">
							<div class="bar imp" style="height:{(p.impressions / maxImp) * 100}%"></div>
						</div>
					{/each}
				</div>
				<span class="tracklabel">impressions</span>
			</div>
			<div class="track">
				<span class="scale">{fmt(maxClicks)}</span>
				<div class="bars short">
					{#each points as p}
						<div class="col" title="{day(p.date)} — {fmt(p.clicks)} clicks">
							<div class="bar clk" style="height:{(p.clicks / maxClicks) * 100}%"></div>
						</div>
					{/each}
				</div>
				<span class="tracklabel">clicks</span>
			</div>
			<div class="axis"><span>{day(points[0].date)}</span><span>{day(points.at(-1)!.date)}</span></div>
		</section>
	{/if}

	<div class="cols">
		<section>
			<h2>Top queries</h2>
			{#if bing.data.queries.length === 0}
				<p class="empty">No query data yet.</p>
			{:else}
				<div class="scroll"><table>
					<thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th title="Average position in results">Pos.</th></tr></thead>
					<tbody>
						{#each bing.data.queries.slice(0, 12) as q}
							<tr>
								<td class="q">{q.query}</td>
								<td class="n">{fmt(q.clicks)}</td>
								<td class="n">{fmt(q.impressions)}</td>
								<td class="n">{q.avgImpressionPosition.toFixed(1)}</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>

		<section>
			<h2>Your articles in search</h2>
			{#if data.perPost.length === 0}
				<p class="empty">No article pages have appeared in Bing results yet.</p>
			{:else}
				<div class="scroll"><table>
					<thead><tr><th>Article</th><th>Clicks</th><th>Impr.</th><th title="Impressions per language">By language</th></tr></thead>
					<tbody>
						{#each data.perPost as p}
							<tr>
								<td class="q"><a href="/posts/{p.slug}">{data.titles[p.slug] ?? p.slug}</a></td>
								<td class="n">{fmt(p.clicks)}</td>
								<td class="n">{fmt(p.impressions)}</td>
								<td class="langs">
									{#each Object.entries(p.langs).sort((a, b) => b[1] - a[1]) as [lang, clicks]}
										<span>{lang} {clicks}</span>
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>
	</div>

	{#if bing.data.pages.length > 0}
		<section>
			<h2>All pages</h2>
			<div class="scroll"><table>
				<thead><tr><th>Page</th><th>Clicks</th><th>Impr.</th></tr></thead>
				<tbody>
					{#each bing.data.pages.slice(0, 12) as p}
						<tr><td class="q">{shortUrl(p.url)}</td><td class="n">{fmt(p.clicks)}</td><td class="n">{fmt(p.impressions)}</td></tr>
					{/each}
				</tbody>
			</table></div>
		</section>
	{/if}

	<p class="fetched" class:stale={bing.data.stale}>
		Fetched {new Date(bing.data.fetchedAt).toLocaleString('en-GB')}
		{#if bing.data.stale}· stale, Bing could not be reached on the last attempt{/if}
	</p>
{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.head button { padding: 0.4rem 0.8rem; border: 1px solid var(--line); border-radius: 8px;
		background: var(--panel); font-size: 0.85rem; cursor: pointer; color: var(--muted); }
	.head button:hover { color: var(--ink); }
	h2 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 0.6rem; }

	.setup { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.1rem 1.25rem; }
	.setup h2 { font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--ink); }
	.setup ol { margin: 0 0 0.75rem; padding-left: 1.2rem; font-size: 0.88rem; }
	.setup li { margin-bottom: 0.35rem; }
	.note { font-size: 0.82rem; color: var(--muted); margin: 0; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger);
		padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.88rem; }

	@media (max-width: 640px) {
		.track { grid-template-columns: 2.4rem minmax(0, 1fr); }
		.track .tracklabel { grid-column: 2; font-size: 0.65rem; }
		.bars { gap: 1px; }
		.axis { margin-left: 2.9rem; }
	}

	.explain { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius) var(--radius) 0; padding: 0.8rem 1rem; font-size: 0.86rem;
		color: var(--muted); margin: 0 0 1.25rem; }

	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
	.tile { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
		padding: 1rem; display: flex; flex-direction: column; gap: 0.15rem; position: relative; }
	.tile .n { font-size: 1.7rem; font-weight: 650; letter-spacing: -0.02em; }
	.tile .l { font-size: 0.82rem; color: var(--muted); }
	.delta { position: absolute; top: 0.8rem; right: 0.9rem; font-size: 0.72rem; font-weight: 700; color: var(--danger); }
	.delta.up { color: var(--accent); }

	.chart { margin-bottom: 1.75rem; }
	.track { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr) auto; align-items: end;
		gap: 0.5rem; margin-bottom: 0.5rem; }
	.track .scale { font-size: 0.68rem; color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
	.track .tracklabel { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
	.bars { display: flex; align-items: flex-end; gap: 2px; min-width: 0; height: 92px;
		border-bottom: 1px solid var(--line); padding-bottom: 1px; }
	.bars.short { height: 46px; }
	/* min-width:0 so a long series (75 days and counting) compresses instead of
	   forcing the whole page to scroll sideways on a phone. */
	.col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
	.bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 1px; }
	.imp { background: color-mix(in srgb, var(--accent) 28%, transparent); }
	.clk { background: var(--accent); }
	.axis { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--muted);
		margin: 0.3rem 0 0 3.7rem; }

	/* 26rem, not 20: at two columns a 20rem minimum still left the tables too
	   narrow, and their content overlapped the next column instead of wrapping. */
	.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr)); gap: 1.75rem; margin-bottom: 1.75rem; }
	.cols > section { min-width: 0; }
	.scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; min-width: 20rem; }
	th { text-align: left; font-weight: 600; font-size: 0.72rem; text-transform: uppercase;
		letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--line); padding: 0.3rem 0.4rem; }
	th:not(:first-child), td.n { text-align: right; }
	td { padding: 0.42rem 0.4rem; border-bottom: 1px solid var(--line); }
	th:first-child, td:first-child { width: auto; }
	th:not(:first-child), td:not(:first-child) { width: 4.5rem; }
	td.q { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	td.q a { text-decoration: none; }
	td.q a:hover { text-decoration: underline; }
	td.n { font-variant-numeric: tabular-nums; }
	.langs { text-align: right; font-size: 0.72rem; color: var(--muted); }
	.langs span { margin-left: 0.4rem; font-variant: small-caps; }
	.empty { font-size: 0.85rem; color: var(--muted); }
	.fetched { font-size: 0.75rem; color: var(--muted); margin-top: 1.5rem; }
	.fetched.stale { color: var(--warn); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
