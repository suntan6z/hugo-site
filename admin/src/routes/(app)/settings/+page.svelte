<script lang="ts">
	import { enhance } from '$app/forms';
	import { enroll } from '$lib/client/passkey';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();
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
	<h2>Recent activity</h2>
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
	.note { font-size: 0.8rem; color: var(--muted-foreground); margin: 0.6rem 0 0; }
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
