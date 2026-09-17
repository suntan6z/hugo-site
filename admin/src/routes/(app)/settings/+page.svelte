<script lang="ts">
	import { enhance } from '$app/forms';
	import { enroll } from '$lib/client/passkey';
	import { invalidateAll } from '$app/navigation';
	import { prepareHero, ImageError } from '$lib/client/image';

	let { data, form } = $props();

	const LANG_NAMES = { en: 'English', fr: 'Français', it: 'Italiano' } as const;
	// What the form shows: a refused save comes back with what was typed, so nothing is lost.
	const text = $derived(form?.siteValues ?? data.site.text);
	let descriptions = $state<Record<string, string>>({});
	$effect(() => {
		descriptions = { ...(text?.description ?? {}) };
	});
	const idealMin = $derived(data.site.ideal[0]);
	const idealMax = $derived(data.site.ideal[1]);

	// The photo is resized and encoded here, then sent as both files the site reads.
	let hero = $state<{ webp: Blob; jpeg: Blob; previewUrl: string; width: number; height: number } | null>(null);
	let heroError = $state('');
	let heroVersion = $state(0);
	async function pickHero(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		heroError = '';
		if (hero) URL.revokeObjectURL(hero.previewUrl);
		hero = null;
		if (!file) return;
		try {
			hero = await prepareHero(file);
		} catch (err) {
			heroError = err instanceof ImageError ? err.message : String(err);
		}
		input.value = '';
	}
	let adding = $state(false);
	let addError = $state('');

	async function addPasskey() {
		adding = true;
		addError = '';
		try {
			const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone'
				: /Mac/.test(navigator.userAgent) ? 'Mac' : 'This device';
			await enroll(label, '');
			await invalidateAll();
		} catch (e) {
			addError = e instanceof Error ? e.message : String(e);
		} finally {
			adding = false;
		}
	}

	const when = (s: unknown) =>
		typeof s === 'string' ? new Date(s).toLocaleString('en-GB') : '';
</script>

<h1>Settings</h1>

{#if form?.message}<p class="msg ok">{form.message}</p>{/if}
{#if addError}<p class="msg err">{addError}</p>{/if}

<section>
	<h2>Homepage and search results</h2>
	{#if data.site.error}
		<p class="msg err">Cannot edit these: {data.site.error}</p>
	{:else if text}
		{#if form?.siteSaved}
			<p class="msg ok">Saved {form.siteSaved.join(', ')}. The site shows it in a minute or two, once it has rebuilt.</p>
		{/if}
		{#if form?.siteError}<p class="msg err">{form.siteError}</p>{/if}
		<form method="POST" action="?/saveSiteText" use:enhance={() => ({ update }) => update({ reset: false })} class="sitetext">
			<label>Quote on the homepage
				<textarea name="quote" rows="3" value={text.quote}></textarea>
			</label>
			<div class="two">
				<label>By<input name="quoteAuthor" value={text.quoteAuthor} autocomplete="off" /></label>
				<label>“Read the article” opens
					<select name="quoteArticle" value={text.quoteArticle}>
						{#each data.site.articles as a}<option value={a.slug}>{a.title}</option>{/each}
					</select>
				</label>
			</div>
			<p class="lede">
				The description is what search engines and link previews show for the homepage, in each language.
			</p>
			{#each Object.keys(LANG_NAMES) as l (l)}
				{@const n = (descriptions[l] ?? '').length}
				<label>Description · {LANG_NAMES[l as keyof typeof LANG_NAMES]}
					<textarea name="description_{l}" rows="2" bind:value={descriptions[l]}></textarea>
					<span class="count" class:over={n < idealMin || n > idealMax}>{n} characters · {idealMin}–{idealMax} reads best</span>
				</label>
			{/each}
			<button type="submit">Save homepage text</button>
		</form>
	{/if}
</section>

<section>
	<h2>Photo and CV</h2>
	<div class="files">
		<div class="hero">
			{#key heroVersion}
				<img src={hero?.previewUrl ?? `/api/hero?v=${heroVersion}`} alt="You, as the homepage shows you" />
			{/key}
			<div>
				{#if form?.heroSaved}<p class="msg ok">Photo replaced. The homepage shows it once the site has rebuilt.</p>{/if}
				{#if form?.heroError}<p class="msg err">{form.heroError}</p>{/if}
				{#if heroError}<p class="msg err">{heroError}</p>{/if}
				<p class="lede">
					The photo beside your introduction. It is shown in a tall frame, so a portrait crop works best.
					Location data is removed before it is uploaded.
				</p>
				<form method="POST" action="?/saveHero" enctype="multipart/form-data" use:enhance={({ formData, cancel }) => {
						if (!hero) return cancel();
						formData.set('hero_webp', hero.webp, 'hero.webp');
						formData.set('hero_jpeg', hero.jpeg, 'hero.jpeg');
						return async ({ update, result }) => {
							await update();
							if (result.type === 'success') {
								if (hero) URL.revokeObjectURL(hero.previewUrl);
								hero = null;
								heroVersion++;
							}
						};
					}}>
					<label class="picker">
						<input type="file" accept="image/*" onchange={pickHero} />
						<span>{hero ? 'Choose another' : 'Choose a photo'}</span>
					</label>
					{#if hero}
						<button type="submit">Replace the photo</button>
						<span class="note">{hero.width}×{hero.height}, not saved yet</span>
					{/if}
				</form>
			</div>
		</div>

		<div class="resume">
			{#if form?.resumeSaved}<p class="msg ok">CV replaced. The homepage button opens the new one once the site has rebuilt.</p>{/if}
			{#if form?.resumeError}<p class="msg err">{form.resumeError}</p>{/if}
			<p class="lede">
				The homepage’s CV button opens <a href="{data.siteUrl}{data.site.resumeUrl}" target="_blank" rel="noreferrer"><code>{data.site.resumeUrl}</code></a>.
			</p>
			{#if data.site.canReplaceResume}
				<form method="POST" action="?/saveResume" enctype="multipart/form-data" use:enhance>
					<input type="file" name="resume" accept="application/pdf" required />
					<button type="submit">Replace the CV</button>
				</form>
			{:else}
				<p class="note">That link is not a PDF on this site, so there is no file here to replace.</p>
			{/if}
		</div>
	</div>
</section>

<section>
	<h2>Old addresses</h2>
	<p class="lede">
		{data.redirects === 0 ? 'No redirects.' : `${data.redirects} redirect file${data.redirects === 1 ? '' : 's'} keep old article addresses working.`}
		<a href="/redirects">Review redirects →</a>
	</p>
</section>

<section>
	<h2>Social links</h2>
	<p class="lede">The icons in the site's footer. Leave a field empty to hide that icon.</p>
	{#if data.socials.error}
		<p class="msg err">Cannot edit these: {data.socials.error}</p>
	{:else}
		{#if form?.socialsSaved}
			<p class="msg ok">Saved {form.socialsSaved.join(', ')}. The site shows it in a minute or two, once it has rebuilt.</p>
		{/if}
		{#if form?.socialsError}<p class="msg err">{form.socialsError}</p>{/if}
		<form method="POST" action="?/saveSocials" use:enhance={() => ({ update }) => update({ reset: false })} class="socials">
			{#each data.socials.fields as s (s.key)}
				{@const value = form?.socials?.[s.key] ?? data.socials.values?.[s.key] ?? ''}
				<label>
					<span>{s.label}</span>
					<input type="url" name={s.key} {value} placeholder="Hidden" autocomplete="off" spellcheck="false" />
					{#if data.socials.values?.[s.key]}
						<a href={data.socials.values[s.key]} target="_blank" rel="noopener noreferrer" title="Open the current link">↗</a>
					{:else}
						<i></i>
					{/if}
				</label>
			{/each}
			<button type="submit">Save links</button>
		</form>
	{/if}
</section>

<section>
	<h2>Passkeys</h2>
	{#if data.credentials.length === 1}
		<p class="warn">
			Only one passkey. If you lose access to it, getting back in means rotating
			<code>BOOTSTRAP_TOKEN</code> in the Scaleway console.
		</p>
	{/if}
	<ul class="creds">
		{#each data.credentials as c}
			<li>
				<div><strong>{c.label}</strong><span>added {c.createdAt.slice(0, 10)}</span></div>
				<form method="POST" action="?/removePasskey" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<button type="submit" class="danger" disabled={data.credentials.length <= 1}>Remove</button>
				</form>
			</li>
		{/each}
	</ul>
	<button onclick={addPasskey} disabled={adding}>{adding ? 'Waiting for passkey…' : 'Add a passkey'}</button>
	<p class="note">Passkeys are bound to <code>{data.rpId}</code> and cannot be used on another domain.</p>
</section>

<section>
	<h2>Sessions</h2>
	<form method="POST" action="?/signOutEverywhere" use:enhance>
		<button type="submit" class="danger">Sign out everywhere</button>
	</form>
	<p class="note">Invalidates every signed-in session on every device. You stay signed in here.</p>
</section>

<section>
	<h2>Connections</h2>
	<ul class="status">
		<li><i class:on={data.mode === 'github'}></i> Content source — <strong>{data.mode === 'github' ? 'GitHub' : 'local working copy'}</strong></li>
		<li><i class:on={data.integrations.bing}></i> Bing Webmaster Tools {#if !data.integrations.bing}<span>— set BING_API_KEY</span>{/if}</li>
		<li>
			<i class:on={data.integrations.indexNow}></i> IndexNow
			{#if data.integrations.indexNowQueued > 0}<span>— {data.integrations.indexNowQueued} URL(s) queued</span>{/if}
		</li>
		<li><i class:on={data.integrations.resend}></i> Resend {#if !data.integrations.resend}<span>— not configured</span>{/if}</li>
		<li><i class:on={data.integrations.litlyx}></i> Litlyx visitor numbers {#if !data.integrations.litlyx}<span>— set LITLYX_TOKEN</span>{/if}</li>
		<li>
			<i class:on={data.integrations.deepl}></i> DeepL translation
			{#if !data.integrations.deepl}<span>— set DEEPL_API_KEY</span>
			{:else if data.integrations.deeplUsage}
				{@const u = data.integrations.deeplUsage}
				<span>— {u.used.toLocaleString('en-GB')} of {u.limit.toLocaleString('en-GB')} characters used this month</span>
			{/if}
		</li>
	</ul>
	<p class="note">Site: <code>{data.siteUrl}</code> · Portal: <code>{data.origin}</code></p>
</section>

<section>
	<h2>Recent activity <a class="all" href="/audit">see all →</a></h2>
	{#if data.audit.length === 0}
		<p class="note">Nothing recorded yet.</p>
	{:else}
		<ul class="audit">
			{#each data.audit as e}
				<li>
					<span class="ev">{e.event}</span>
					<span class="detail">{[e.slug, e.credential, e.sha].filter(Boolean).join(' · ')}</span>
					<span class="at">{when(e.at)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	h2 .all { font-size: 0.78rem; font-weight: 400; text-decoration: none; color: var(--primary); margin-left: 0.5rem; }
	h1 { font-size: 1.5rem; margin: 0 0 1.5rem; letter-spacing: -0.015em; }
	h2 { font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted-foreground); margin: 0 0 0.6rem; }
	section { margin-bottom: 2.25rem; }
	.msg { padding: 0.7rem 0.9rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.warn { background: color-mix(in srgb, var(--warn) 12%, transparent); border-left: 3px solid var(--warn);
		padding: 0.7rem 0.9rem; border-radius: 0 8px 8px 0; font-size: 0.85rem; margin: 0 0 0.9rem; }
	.creds { list-style: none; padding: 0; margin: 0 0 0.9rem; }
	.creds li { display: flex; align-items: center; justify-content: space-between;
		padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
	.creds div { display: flex; flex-direction: column; gap: 0.1rem; }
	.creds span { font-size: 0.78rem; color: var(--muted-foreground); }
	button { padding: 0.45rem 0.9rem; border: 1px solid var(--border); border-radius: 8px;
		background: var(--card); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
	button:hover:not(:disabled) { border-color: var(--primary); }
	button.danger { color: var(--danger); font-weight: 500; }
	button:disabled { opacity: 0.4; cursor: default; }
	.lede { font-size: 0.85rem; color: var(--muted-foreground); margin: 0 0 0.8rem; }
	.socials { display: grid; gap: 0.5rem; max-width: 36rem; }
	.socials label { display: grid; grid-template-columns: 7.5rem 1fr 1.5rem; align-items: center; gap: 0.6rem; font-size: 0.87rem; }
	.socials input { width: 100%; box-sizing: border-box; padding: 0.45rem 0.6rem; border: 1px solid var(--border); border-radius: 8px;
		background: var(--card); color: var(--foreground); font: inherit; font-size: 0.85rem; }
	.socials input:focus { outline: none; border-color: var(--primary); }
	.socials a { text-decoration: none; color: var(--primary); text-align: center; }
	.socials button { justify-self: start; margin-top: 0.4rem; }
	@media (max-width: 520px) {
		.socials label { grid-template-columns: 1fr 1.5rem; }
		.socials label span { grid-column: 1 / -1; }
	}
	.note { font-size: 0.8rem; color: var(--muted-foreground); margin: 0.6rem 0 0; }
	.sitetext { display: grid; gap: 0.8rem; max-width: 40rem; }
	.sitetext button { justify-self: start; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: 0.8rem; }
	.count { display: block; margin-top: 0.25rem; font-size: 0.72rem; font-weight: 400; color: var(--muted-foreground); }
	.count.over { color: var(--warn); }
	.files { display: grid; gap: 1.25rem; max-width: 40rem; }
	.hero { display: flex; gap: 1rem; align-items: flex-start; }
	.hero img { width: 7rem; height: 9.2rem; object-fit: cover; border-radius: var(--radius); border: 1px solid var(--border); background: var(--muted); flex: none; }
	.hero form, .resume form { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
	.hero .note { margin: 0; }
	.picker { display: inline-block; cursor: pointer; }
	.picker input { position: absolute; opacity: 0; width: 1px; height: 1px; }
	.picker span { display: inline-block; padding: 0.45rem 0.9rem; border: 1px dashed var(--border); border-radius: 8px; font-size: 0.85rem; font-weight: 600; }
	.picker:hover span { border-color: var(--primary); color: var(--primary); }
	@media (max-width: 520px) { .hero { flex-direction: column; } }
	.status { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; font-size: 0.87rem; }
	.status i { width: 8px; height: 8px; border-radius: 50%; background: var(--border);
		display: inline-block; margin-right: 0.5rem; }
	.status i.on { background: var(--ok); }
	.status span { color: var(--muted-foreground); font-size: 0.82rem; }
	.audit { list-style: none; padding: 0; margin: 0; font-size: 0.82rem; }
	.audit li { display: flex; gap: 0.6rem; padding: 0.32rem 0; border-bottom: 1px solid var(--border); }
	.audit .ev { font-weight: 600; min-width: 9rem; }
	.audit .detail { color: var(--muted-foreground); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.audit .at { color: var(--muted-foreground); white-space: nowrap; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
