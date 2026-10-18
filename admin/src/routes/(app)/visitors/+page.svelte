<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();

	const v = $derived(data.visitors.data);
	const maxViews = $derived(Math.max(1, ...(v?.daily ?? []).map((d) => d.views)));
	const fmt = (n: number) => n.toLocaleString('en-GB');
	const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
	const regions = (() => {
		try {
			return new Intl.DisplayNames(['en'], { type: 'region' });
		} catch {
			return null;
		}
	})();
	const country = (code: string) => {
		if (!code) return 'Unknown';
		if (/^[A-Z]{2}$/i.test(code)) {
			try {
				return regions?.of(code.toUpperCase()) ?? code;
			} catch {
				return code;
			}
		}
		return code;
	};
	const pagesPerVisit = $derived(v && v.visits > 0 ? (v.views / v.visits).toFixed(1) : '–');
	const otherPages = $derived((v?.pages ?? []).filter((p) => !/\/blog\/[a-z0-9-]+\/?$/.test(p.key)).slice(0, 10));
	const tagged = $derived(
		!!data.campaigns && (data.campaigns.sources.length > 0 || data.campaigns.mediums.length > 0 || data.campaigns.campaigns.length > 0)
	);
</script>

{#snippet shareTable(title: string, head: string, rows: { key: string; count: number; share: number }[])}
	<section>
		<h2>{title}</h2>
		<table>
			<thead><tr><th>{head}</th><th>Visits</th></tr></thead>
			<tbody>
				{#each rows as r}
					<tr>
						<td class="q share"><span class="fill" style:width="{r.share}%"></span><span class="lab">{r.key}</span></td>
						<td class="n">{fmt(r.count)} <span class="pct">{r.share}%</span></td>
					</tr>
				{:else}
					<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
{/snippet}

{#snippet pageTable(title: string, rows: { key: string; count: number }[])}
	<section>
		<h2>{title}</h2>
		<table>
			<thead><tr><th>Page</th><th>Visits</th></tr></thead>
			<tbody>
				{#each rows as p}
					<tr><td class="q"><a href="{data.siteUrl}{p.key}" target="_blank" rel="noreferrer">{p.key}</a></td><td class="n">{fmt(p.count)}</td></tr>
				{:else}
					<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
{/snippet}

<div class="head">
	<h1>Visitors</h1>
	{#if data.live !== null}
		<span class="live" title="Different people on the site in the last five minutes"><span class="dot" class:on={data.live > 0}></span>{data.live} on the site now</span>
	{/if}
	{#if data.visitors.configured}
		<form method="POST" action="?/refresh" use:enhance>
			<button type="submit" class="btn-outline btn-sm">Refresh</button>
		</form>
	{/if}
</div>

{#if !data.visitors.configured}
	<section class="setup">
		<h2>Visitor numbers aren’t connected yet</h2>
		<p>The site already counts its visits. Connect the counter to read the numbers here: pages, sources, countries and devices.</p>
		<details><summary>How to connect</summary>
		<ol>
			<li>
				In the dashboard at <a href={data.litlyxHost} target="_blank" rel="noreferrer">{data.litlyxHost.replace(/^https?:\/\//, '')}</a>,
				open <strong>Shareable links</strong> and create one for all domains. A password is optional.
			</li>
			<li>Copy the link’s id — the part after <code>/shared/</code> — into <code>admin/.env</code> as <code>LITLYX_TOKEN=…</code>, and the password, if you set one, as <code>LITLYX_SHARE_PASSWORD=…</code>.</li>
			<li>Run <code>cd admin && ./scripts/create-container.sh</code>.</li>
		</ol>
		<p class="note">A shareable link can only read numbers: it cannot change anything in Litlyx.</p>
		</details>
	</section>
{:else if data.visitors.error}
	<p class="msg err">{data.visitors.error}</p>
{:else if v}
	{#if v.views === 0}
		<p class="explain">No visits recorded in the last {v.days} days. If the site did have visitors, check that the Litlyx script still loads on it.</p>
	{/if}

	<section class="tiles">
		<div class="tile">
			<span class="n">{fmt(v.visits)}</span>
			<span class="l">visits</span>
			{#if v.trend !== null}
				<span class="delta" class:up={v.trend >= 0}>{v.trend >= 0 ? '▲' : '▼'} {Math.abs(v.trend)}%</span>
			{/if}
		</div>
		<div class="tile"><span class="n">{fmt(v.views)}</span><span class="l">pages read</span></div>
		<div class="tile"><span class="n">{pagesPerVisit}</span><span class="l">pages per visit</span></div>
		{#if data.engagement?.visitLength}
			<div class="tile"><span class="n">{data.engagement.visitLength}</span><span class="l">an average visit</span></div>
		{/if}
		{#if data.engagement?.bounceRate !== null && data.engagement?.bounceRate !== undefined}
			<div class="tile" title="Visits that read a single page and left"><span class="n">{data.engagement.bounceRate}%</span><span class="l">read one page only</span></div>
		{/if}
		<div class="tile"><span class="n">{v.days}</span><span class="l">days</span></div>
	</section>

	<section class="chart" aria-label="Pages read per day">
		<div class="bars">
			{#each v.daily as d}
				<div class="col" title="{day(d.date)}: {d.views} pages read, {d.visits} visits">
					<div class="bar" style:height="{(d.views / maxViews) * 100}%"></div>
				</div>
			{/each}
		</div>
		<div class="axis"><span>{day(v.daily[0]?.date ?? '')}</span><span>{day(v.daily.at(-1)?.date ?? '')}</span></div>
	</section>

	<div class="cols">
		<section>
			<h2>Articles</h2>
			{#if data.articles.length === 0}
				<p class="empty">No article was read in this period.</p>
			{:else}
				<table>
					<thead><tr><th>Article</th><th>Read</th></tr></thead>
					<tbody>
						{#each data.articles.slice(0, 15) as a}
							<tr>
								<td class="q"><a href="/posts/{a.slug}">{a.title}</a></td>
								<td class="n">
									{fmt(a.total)}
									<span class="langs">{#each Object.entries(a.langs) as [l, n]}<span>{l} {n}</span>{/each}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			{#if data.unread.length > 0}
				<p class="note unread">
					Not read at all in these {v.days} days:
					{#each data.unread as u, i}<a href="/posts/{u.slug}">{u.title}</a>{i < data.unread.length - 1 ? ', ' : ''}{/each}.
				</p>
			{/if}
		</section>

		<section>
			<h2>Other pages</h2>
			<table>
				<thead><tr><th>Page</th><th>Read</th></tr></thead>
				<tbody>
					{#each otherPages as p}
						<tr><td class="q"><a href="{data.siteUrl}{p.key}" target="_blank" rel="noreferrer">{p.key}</a></td><td class="n">{fmt(p.count)}</td></tr>
					{:else}
						<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section>
			<h2>Where they came from</h2>
			<table>
				<thead><tr><th>Source</th><th>Visits</th></tr></thead>
				<tbody>
					{#each v.referrers as r}
						<tr><td class="q">{r.key}</td><td class="n">{fmt(r.count)}</td></tr>
					{:else}
						<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section>
			<h2>Countries</h2>
			<table>
				<thead><tr><th>Country</th><th>Read</th></tr></thead>
				<tbody>
					{#each v.countries as c}
						<tr><td class="q">{country(c.key)}</td><td class="n">{fmt(c.count)}</td></tr>
					{:else}
						<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>

	{#if data.who}
		<div class="cols">
			{#if !v.unavailable.includes('devices')}{@render shareTable('Devices', 'Device', data.who.devices)}{/if}
			{#if !v.unavailable.includes('browsers')}{@render shareTable('Browsers', 'Browser', data.who.browsers)}{/if}
			{#if !v.unavailable.includes('systems')}{@render shareTable('Systems', 'System', data.who.systems)}{/if}
		</div>
	{/if}

	<div class="cols">
		{#if !v.unavailable.includes('entry pages')}{@render pageTable('Where visits began', data.entryPages)}{/if}
		{#if !v.unavailable.includes('exit pages')}{@render pageTable('Where visits ended', data.exitPages)}{/if}
		{#if !v.unavailable.includes('time on page')}
		<section>
			<h2>Time on page</h2>
			<table>
				<thead><tr><th>Page</th><th>Stay</th></tr></thead>
				<tbody>
					{#each data.stays as d}
						<tr><td class="q"><a href="{data.siteUrl}{d.key}" target="_blank" rel="noreferrer">{d.key}</a></td><td class="n" title="{d.measured} measured">{d.stay}</td></tr>
					{:else}
						<tr><td colspan="2" class="empty">Nothing yet.</td></tr>
					{/each}
				</tbody>
			</table>
			<p class="note">How long a reader stays before opening another page, so the last page of a visit is not counted.</p>
		</section>
		{/if}
	</div>

	<h2 class="sub">Campaigns</h2>
	{#if tagged && data.campaigns}
		<div class="cols">
			{#if data.campaigns.sources.length > 0}{@render shareTable('Source', 'utm_source', data.campaigns.sources)}{/if}
			{#if data.campaigns.mediums.length > 0}{@render shareTable('Medium', 'utm_medium', data.campaigns.mediums)}{/if}
			{#if data.campaigns.campaigns.length > 0}{@render shareTable('Campaign', 'utm_campaign', data.campaigns.campaigns)}{/if}
		</div>
	{:else}
		<p class="note">No visit came through a link tagged with <code>utm_source</code>, <code>utm_medium</code> or <code>utm_campaign</code>. Add them to a link you share (for instance in a newsletter) and they appear here.</p>
	{/if}

	{#if v.unavailable.length > 0}
		<p class="note missing">
			Litlyx did not answer for: {v.unavailable.join(', ')}. That part is left out; the rest of the page is unaffected. A different Litlyx version may not offer it, or it timed out.
		</p>
	{/if}

	<p class="fetched">
		From Litlyx, {new Date(v.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
		<a href={data.litlyxHost} target="_blank" rel="noreferrer">Open the full dashboard →</a>
	</p>
{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	h2 { font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted-foreground); margin: 0 0 0.6rem; }

	.setup { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.25rem; max-width: 46rem; }
	.setup h2 { font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--foreground); }
	.setup summary { cursor: pointer; font-size: 0.85rem; font-weight: 500; color: var(--primary); width: max-content; }
	.setup details ol { margin-top: 0.7rem; }
	.setup p { font-size: 0.88rem; margin: 0 0 0.6rem; }
	.setup ol { margin: 0 0 0.75rem; padding-left: 1.2rem; font-size: 0.88rem; }
	.setup li { margin-bottom: 0.35rem; }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0; }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger);
		padding: 0.8rem 1rem; border-radius: 8px; font-size: 0.88rem; }
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
	.bars { display: flex; align-items: flex-end; gap: 2px; height: 110px; border-bottom: 1px solid var(--border); padding-bottom: 1px; }
	.col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
	.bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 1px; background: var(--primary); }
	.axis { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--muted-foreground); margin-top: 0.3rem; }

	.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: 1.75rem; margin-bottom: 1.75rem; }
	.cols > section { min-width: 0; }
	table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; }
	th { text-align: left; font-weight: 600; font-size: 0.72rem; text-transform: uppercase;
		letter-spacing: 0.05em; color: var(--muted-foreground); border-bottom: 1px solid var(--border); padding: 0.3rem 0.4rem; }
	th:last-child, td.n { text-align: right; width: 7rem; }
	td { padding: 0.42rem 0.4rem; border-bottom: 1px solid var(--border); }
	td.q { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	td.q a { text-decoration: none; }
	td.q a:hover { text-decoration: underline; }
	td.n { font-variant-numeric: tabular-nums; }
	.langs { display: block; font-size: 0.68rem; color: var(--muted-foreground); }
	.langs span { margin-left: 0.35rem; font-variant: small-caps; }
	.empty { font-size: 0.85rem; color: var(--muted-foreground); }
	.unread { margin-top: 0.7rem; }
	.fetched { font-size: 0.75rem; color: var(--muted-foreground); }
	h2.sub { margin: 0.25rem 0 0.6rem; }
	.live { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--muted-foreground); margin-right: auto; margin-left: 1rem; }
	.dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--border); }
	.dot.on { background: var(--ok); }
	td.share { position: relative; }
	td.share .fill { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--primary) 14%, transparent); border-radius: 3px; }
	td.share .lab { position: relative; padding-left: 0.2rem; }
	.pct { font-size: 0.7rem; color: var(--muted-foreground); margin-left: 0.25rem; }
	.missing { margin: 0 0 1rem; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
