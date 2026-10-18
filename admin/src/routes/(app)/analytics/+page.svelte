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

	// Bing's crawler: what it fetched, what failed, and what it holds in its index.
	const crawl = $derived(bing.data?.crawl ?? null);
	const crawled = $derived((crawl?.days ?? []).reduce((n, d) => n + d.crawled, 0));
	const crawlErrors = $derived((crawl?.days ?? []).reduce((n, d) => n + d.errors, 0));
	const indexed = $derived((crawl?.days ?? []).filter((d) => d.indexed > 0).at(-1)?.indexed ?? null);
	const when = (d: string | null) => (d ? day(d) : '–');
	// A sitemap Bing has not read for a month is not being used to find new pages.
	const daysAgo = (d: string | null) => (d ? Math.floor((Date.now() - Date.parse(d + 'T00:00:00Z')) / 86_400_000) : null);
	const staleSitemap = (d: string | null) => (daysAgo(d) ?? 0) > 30;
</script>

<div class="head">
	<h1>Search</h1>
	<nav class="jump" aria-label="Search engines"><a href="#bing">Bing</a><a href="#google">Google</a></nav>
	{#if bing.configured || data.google.configured}
		<form method="POST" action="?/refresh" use:enhance>
			<button type="submit" class="btn-outline btn-sm">Refresh</button>
		</form>
	{/if}
</div>

<h2 id="bing" class="engine">Bing</h2>
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

	{#if crawl}
		<h2 class="sub">Crawl health</h2>
		<section class="tiles">
			<div class="tile" title="Pages Bing's crawler fetched from the site"><span class="n">{fmt(crawled)}</span><span class="l">pages fetched · {crawl.days.length} days</span></div>
			<div class="tile" class:bad={crawlErrors > 0} title="Fetches that failed: not found, a server error, a timeout, blocked by robots.txt"><span class="n">{fmt(crawlErrors)}</span><span class="l">fetches that failed</span></div>
			<div class="tile"><span class="n">{indexed === null ? '–' : fmt(indexed)}</span><span class="l">pages in Bing’s index</span></div>
			<div class="tile" class:bad={crawl.issues.length > 0}><span class="n">{crawl.issues.length}</span><span class="l">pages with problems</span></div>
		</section>

		<div class="cols">
			<section>
				<h2>Sitemaps</h2>
				{#if crawl.sitemaps.length === 0}
					<p class="empty">Bing knows of no sitemap. Submit <code>{data.siteUrl}/sitemap.xml</code> in Bing Webmaster Tools.</p>
				{:else}
					<div class="scroll"><table>
						<thead><tr><th>Sitemap</th><th>Status</th><th>URLs</th><th>Read</th></tr></thead>
						<tbody>
							{#each crawl.sitemaps as m}
								<tr>
									<td class="q" title={m.url}>{shortUrl(m.url)}</td>
									<td class="n" class:okcell={m.status === 'Success'}>{m.status}</td>
									<td class="n">{fmt(m.urlCount)}</td>
									<td class="n" class:warncell={staleSitemap(m.lastCrawled)} title={staleSitemap(m.lastCrawled) ? `Bing last read this ${daysAgo(m.lastCrawled)} days ago` : ''}>{when(m.lastCrawled)}</td>
								</tr>
							{/each}
						</tbody>
					</table></div>
					{#if crawl.sitemaps.some((m) => staleSitemap(m.lastCrawled))}
						<p class="note">Bing has not read a sitemap for over a month. Submitting it again in Bing Webmaster Tools → Sitemaps prompts a fresh read; IndexNow covers pages as they change.</p>
					{/if}
				{/if}
			</section>

			<section>
				<h2>Pages with problems</h2>
				{#if crawl.issues.length === 0}
					<p class="empty">None. Bing found nothing it could not fetch or read.</p>
				{:else}
					<div class="scroll"><table>
						<thead><tr><th>Page</th><th>HTTP</th><th title="Links to it that Bing knows of">Links</th></tr></thead>
						<tbody>
							{#each crawl.issues as i}
								<tr><td class="q" title={i.url}>{shortUrl(i.url)}</td><td class="n">{i.httpCode || '–'}</td><td class="n">{fmt(i.inLinks)}</td></tr>
							{/each}
						</tbody>
					</table></div>
					<p class="note">The reason for each is in Bing Webmaster Tools → Site Explorer.</p>
				{/if}
			</section>
		</div>
	{/if}

	<p class="fetched" class:stale={bing.data.stale}>
		Fetched {new Date(bing.data.fetchedAt).toLocaleString('en-GB')}
		{#if bing.data.stale}· stale, Bing could not be reached on the last attempt{/if}
	</p>
{/if}

<h2 id="google" class="engine">Google</h2>
{#if !data.google.configured}
	<section class="setup">
		<h2>Google Search Console is not connected</h2>
		<ol>
			<li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project, enable the <strong>Google Search Console API</strong>, then create a <strong>service account</strong> and download a JSON key for it.</li>
			<li>In <a href="https://search.google.com/search-console/users" target="_blank" rel="noreferrer">Search Console → Settings → Users and permissions</a>, add the service account’s email address as a user (Restricted is enough: it only reads).</li>
			<li>Put the key into <code>admin/.env</code> as <code>GSC_SERVICE_ACCOUNT_B64=…</code> (<code>base64 -i key.json | tr -d '\n'</code>) and the property as <code>GSC_SITE_URL=…</code>, exactly as Search Console lists it: <code>sc-domain:loconsole.eu</code> or <code>{data.siteUrl}/</code>.</li>
			<li>Run <code>cd admin && ./scripts/create-container.sh</code>.</li>
		</ol>
		<p class="note">The key can only read search numbers; it cannot change anything in Search Console.</p>
	</section>
{:else if data.google.error}
	<p class="msg err">{data.google.error}</p>
{:else if data.google.data}
	{@const g = data.google.data}
	{#if data.googleTotals.impressions === 0}
		<p class="explain">Google has not shown the site in any results over the last {g.days.length || 28} days. A new site takes weeks to appear; the sitemap below is how Google finds its pages.</p>
	{/if}

	<section class="tiles">
		<div class="tile"><span class="n">{fmt(data.googleTotals.clicks)}</span><span class="l">clicks</span></div>
		<div class="tile"><span class="n">{fmt(data.googleTotals.impressions)}</span><span class="l">impressions</span></div>
		<div class="tile"><span class="n">{data.googleTotals.ctr.toFixed(1)}%</span><span class="l">click-through rate</span></div>
		<div class="tile"><span class="n">{data.googleTotals.position ?? '–'}</span><span class="l">average position</span></div>
	</section>

	<div class="cols">
		<section>
			<h2>Top queries</h2>
			{#if g.queries.length === 0}
				<p class="empty">No query data yet.</p>
			{:else}
				<div class="scroll"><table>
					<thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th title="Average position in results">Pos.</th></tr></thead>
					<tbody>
						{#each g.queries.slice(0, 12) as q}
							<tr><td class="q">{q.query}</td><td class="n">{fmt(q.clicks)}</td><td class="n">{fmt(q.impressions)}</td><td class="n">{q.position.toFixed(1)}</td></tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>

		<section>
			<h2>Your articles in Google</h2>
			{#if data.googleByPost.length === 0}
				<p class="empty">No article page has appeared in Google results yet.</p>
			{:else}
				<div class="scroll"><table>
					<thead><tr><th>Article</th><th>Clicks</th><th>Impr.</th><th title="Average position in results">Pos.</th></tr></thead>
					<tbody>
						{#each data.googleByPost as p}
							<tr>
								<td class="q"><a href="/posts/{p.slug}">{data.titles[p.slug] ?? p.slug}</a></td>
								<td class="n">{fmt(p.clicks)}</td>
								<td class="n">{fmt(p.impressions)}</td>
								<td class="n">{p.position ?? '–'}</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>
	</div>

	<div class="cols">
		<section>
			<h2>Sitemaps</h2>
			{#if g.sitemaps.length === 0}
				<p class="empty">Google knows of no sitemap. Submit <code>{data.siteUrl}/sitemap.xml</code> in Search Console → Sitemaps.</p>
			{:else}
				<div class="scroll"><table>
					<thead><tr><th>Sitemap</th><th>Indexed</th><th>Errors</th><th>Read</th></tr></thead>
					<tbody>
						{#each g.sitemaps as m}
							<tr>
								<td class="q" title={m.path}>{shortUrl(m.path)}</td>
								<td class="n" title="{m.indexed} of the {m.offered} URLs it offers">{m.offered > 0 ? `${fmt(m.indexed)} / ${fmt(m.offered)}` : '–'}</td>
								<td class="n" class:warncell={m.errors > 0}>{m.errors}</td>
								<td class="n" class:warncell={staleSitemap(m.lastRead)} title={staleSitemap(m.lastRead) ? `Google last read this ${daysAgo(m.lastRead)} days ago` : ''}>{when(m.lastRead)}</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			{/if}
		</section>

		{#if g.pages.length > 0}
			<section>
				<h2>All pages</h2>
				<div class="scroll"><table>
					<thead><tr><th>Page</th><th>Clicks</th><th>Impr.</th></tr></thead>
					<tbody>
						{#each g.pages.slice(0, 12) as p}
							<tr><td class="q">{shortUrl(p.url)}</td><td class="n">{fmt(p.clicks)}</td><td class="n">{fmt(p.impressions)}</td></tr>
						{/each}
					</tbody>
				</table></div>
			</section>
		{/if}
	</div>

	<p class="fetched" class:stale={g.stale}>
		From Google Search Console, the last {g.days.length} days with data (its figures run a couple of days behind) · fetched {new Date(g.fetchedAt).toLocaleString('en-GB')}
		{#if g.stale}· stale, Google could not be reached on the last attempt{/if}
	</p>
{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	h2 { font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted-foreground); margin: 0 0 0.6rem; }

	.setup { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.25rem; }
	.setup h2 { font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--foreground); }
	.setup ol { margin: 0 0 0.75rem; padding-left: 1.2rem; font-size: 0.88rem; }
	.setup li { margin-bottom: 0.35rem; }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger);
		padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.88rem; }

	@media (max-width: 640px) {
		.track { grid-template-columns: 2.4rem minmax(0, 1fr); }
		.track .tracklabel { grid-column: 2; font-size: 0.65rem; }
		.bars { gap: 1px; }
		.axis { margin-left: 2.9rem; }
	}

	.explain { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--primary);
		border-radius: 0 var(--radius) var(--radius) 0; padding: 0.8rem 1rem; font-size: 0.86rem;
		color: var(--muted-foreground); margin: 0 0 1.25rem; }

	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
	.tile { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
		padding: 1rem; display: flex; flex-direction: column; gap: 0.15rem; position: relative; }
	.tile .n { font-size: 1.7rem; font-weight: 650; letter-spacing: -0.02em; }
	.tile .l { font-size: 0.82rem; color: var(--muted-foreground); }
	.delta { position: absolute; top: 0.8rem; right: 0.9rem; font-size: 0.72rem; font-weight: 700; color: var(--danger); }
	.delta.up { color: var(--ok); }

	.chart { margin-bottom: 1.75rem; }
	.track { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr) auto; align-items: end;
		gap: 0.5rem; margin-bottom: 0.5rem; }
	.track .scale { font-size: 0.68rem; color: var(--muted-foreground); text-align: right; font-variant-numeric: tabular-nums; }
	.track .tracklabel { font-size: 0.7rem; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; }
	.bars { display: flex; align-items: flex-end; gap: 2px; min-width: 0; height: 92px;
		border-bottom: 1px solid var(--border); padding-bottom: 1px; }
	.bars.short { height: 46px; }
	/* min-width:0 so a long series (75 days and counting) compresses instead of
	   forcing the whole page to scroll sideways on a phone. */
	.col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
	.bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 1px; }
	.imp { background: color-mix(in srgb, var(--primary) 28%, transparent); }
	.clk { background: var(--primary); }
	.axis { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--muted-foreground);
		margin: 0.3rem 0 0 3.7rem; }

	/* 26rem, not 20: at two columns a 20rem minimum still left the tables too
	   narrow, and their content overlapped the next column instead of wrapping. */
	.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr)); gap: 1.75rem; margin-bottom: 1.75rem; }
	.cols > section { min-width: 0; }
	.scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; min-width: 20rem; }
	th { text-align: left; font-weight: 600; font-size: 0.72rem; text-transform: uppercase;
		letter-spacing: 0.05em; color: var(--muted-foreground); border-bottom: 1px solid var(--border); padding: 0.3rem 0.4rem; }
	th:not(:first-child), td.n { text-align: right; }
	td { padding: 0.42rem 0.4rem; border-bottom: 1px solid var(--border); }
	th:first-child, td:first-child { width: auto; }
	th:not(:first-child), td:not(:first-child) { width: 4.5rem; }
	td.q { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	td.q a { text-decoration: none; }
	td.q a:hover { text-decoration: underline; }
	td.n { font-variant-numeric: tabular-nums; }
	.langs { text-align: right; font-size: 0.72rem; color: var(--muted-foreground); }
	.langs span { margin-left: 0.4rem; font-variant: small-caps; }
	.empty { font-size: 0.85rem; color: var(--muted-foreground); }
	h2.sub { margin: 0.5rem 0 0.7rem; }
	h2.engine { font-size: 1.05rem; text-transform: none; letter-spacing: 0; color: var(--foreground); margin: 1.75rem 0 0.9rem; padding-top: 0.25rem; }
	h2.engine:first-of-type { margin-top: 0; }
	.jump { display: flex; gap: 0.9rem; font-size: 0.85rem; margin-right: auto; margin-left: 1.25rem; }
	.jump a { color: var(--muted-foreground); text-decoration: none; }
	.jump a:hover { color: var(--foreground); text-decoration: underline; }
	.tile.bad .n { color: var(--danger); }
	td.okcell { color: var(--ok); }
	td.warncell { color: var(--warn); font-weight: 600; }
	.fetched { font-size: 0.75rem; color: var(--muted-foreground); margin-top: 1.5rem; }
	.fetched.stale { color: var(--warn); }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
