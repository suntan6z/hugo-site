<script lang="ts">
	/**
	 * Two questions about a published article, asked of Google on demand: is it in the
	 * index, and how fast is it. Each answer is for one language's address.
	 */
	let { urls, googleReady }: { urls: { lang: string; url: string }[]; googleReady: boolean } = $props();

	type Tone = 'ok' | 'warn' | 'bad' | 'plain';
	type Indexed = { state: 'loading' } | { state: 'error'; error: string } | { state: 'done'; label: string; tone: Tone; detail: string; canonical: string | null };
	type Chip = { label: string; value: number | null; text?: string; hint?: string; rating: 'good' | 'needs' | 'poor' | 'unknown' };
	type Speed = { state: 'loading' } | { state: 'error'; error: string } | { state: 'done'; scores: Chip[]; vitals: Chip[]; field: string | null; cachedAt: string | null };

	let indexed = $state<Record<string, Indexed>>({});
	let speed = $state<Record<string, Speed>>({});

	async function askIndex(url: string) {
		indexed[url] = { state: 'loading' };
		try {
			const r = await fetch(`/api/inspect?url=${encodeURIComponent(url)}`);
			const j = await r.json();
			indexed[url] = j.ok ? { state: 'done', label: j.label, tone: j.tone, detail: j.detail, canonical: j.canonical } : { state: 'error', error: j.error ?? 'No answer.' };
		} catch {
			indexed[url] = { state: 'error', error: 'The portal could not be reached.' };
		}
	}

	async function askSpeed(url: string) {
		speed[url] = { state: 'loading' };
		try {
			const r = await fetch(`/api/speed?url=${encodeURIComponent(url)}`);
			const j = await r.json();
			speed[url] = j.ok ? { state: 'done', scores: j.scores, vitals: j.vitals, field: j.field, cachedAt: j.cachedAt } : { state: 'error', error: j.error ?? 'No answer.' };
		} catch {
			speed[url] = { state: 'error', error: 'The portal could not be reached.' };
		}
	}

	const FIELD = { FAST: 'Real visitors on Chrome find it fast.', AVERAGE: 'Real visitors on Chrome find it average.', SLOW: 'Real visitors on Chrome find it slow.' } as const;
	const NAMES: Record<string, string> = { en: 'English', fr: 'Français', it: 'Italiano' };
</script>

{#if urls.length > 0}
	<section class="checks" aria-label="How this article does on the web">
		<h3>On the web</h3>
		<p class="hint">Asks Google about the published page, so it only answers for what is live. Search Console's figures run a day or two behind.</p>
		{#each urls as u (u.url)}
			<div class="page">
				<div class="line">
					<strong>{NAMES[u.lang] ?? u.lang}</strong>
					<a href={u.url} target="_blank" rel="noopener">{u.url.replace(/^https?:\/\//, '')}</a>
				</div>
				<div class="line buttons">
					{#if googleReady}
						<button type="button" class="btn-outline btn-sm" disabled={indexed[u.url]?.state === 'loading'} onclick={() => askIndex(u.url)}>
							{indexed[u.url]?.state === 'loading' ? 'Asking Google…' : 'Is it on Google?'}
						</button>
					{/if}
					<button type="button" class="btn-outline btn-sm" disabled={speed[u.url]?.state === 'loading'} onclick={() => askSpeed(u.url)}>
						{speed[u.url]?.state === 'loading' ? 'Testing, up to 30 s…' : 'Check speed'}
					</button>
				</div>

				{#each [indexed[u.url]] as a}
					{#if a?.state === 'error'}<p class="msg err">{a.error}</p>
					{:else if a?.state === 'done'}
						<p class="answer"><span class="chip {a.tone}">{a.label}</span> {a.detail}
							{#if a.canonical}<br /><span class="hint">Google treats <a href={a.canonical} target="_blank" rel="noopener">{a.canonical}</a> as the main address.</span>{/if}
						</p>
					{/if}
				{/each}

				{#each [speed[u.url]] as sp}
					{#if sp?.state === 'error'}<p class="msg err">{sp.error}</p>
					{:else if sp?.state === 'done'}
						<div class="scores">
							{#each sp.scores as c}
								<span class="score {c.rating}" title={c.label}><b>{c.value ?? '–'}</b>{c.label}</span>
							{/each}
						</div>
						<div class="vitals">
							{#each sp.vitals as v}
								<span class="vital {v.rating}" title={v.hint}>{v.label} <b>{v.text}</b></span>
							{/each}
						</div>
						<p class="hint">
							A lab test on a mobile connection, from Google’s servers{sp.cachedAt ? `, run ${new Date(sp.cachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.
							{sp.field ? FIELD[sp.field as keyof typeof FIELD] : 'Too few real visitors for Google to report their experience.'}
						</p>
					{/if}
				{/each}
			</div>
		{/each}
	</section>
{/if}

<style>
	.checks { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	h3 { margin: 0 0 0.3rem; font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
	.hint { margin: 0 0 0.6rem; font-size: 0.82rem; color: var(--muted-foreground); }
	.page { padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
	.page:last-child { border-bottom: 0; }
	.line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.8rem; font-size: 0.88rem; }
	.line a { overflow-wrap: anywhere; }
	.buttons { margin-top: 0.45rem; }
	.answer { margin: 0.5rem 0 0; font-size: 0.86rem; }
	.msg.err { margin: 0.5rem 0 0; font-size: 0.84rem; color: var(--danger); }
	.chip { display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 650; background: var(--muted); }
	.chip.ok { background: var(--ok-bg, color-mix(in srgb, var(--ok) 15%, transparent)); color: var(--ok); }
	.chip.warn { background: var(--warn-bg); color: var(--warn); }
	.chip.bad { background: var(--danger-bg); color: var(--danger); }
	.scores, .vitals { display: flex; flex-wrap: wrap; gap: 0.4rem 0.6rem; margin-top: 0.55rem; }
	.score { display: inline-flex; flex-direction: column; align-items: center; min-width: 4.8rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 0.72rem; color: var(--muted-foreground); }
	.score b { font-size: 1.15rem; color: var(--foreground); }
	.vital { font-size: 0.8rem; padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted-foreground); }
	.good b { color: var(--ok); }
	.needs b { color: var(--warn); }
	.poor b { color: var(--danger); }
</style>
