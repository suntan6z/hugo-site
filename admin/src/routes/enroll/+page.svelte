<script lang="ts">
	import { enroll } from '$lib/client/passkey';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let label = $state('');
	let busy = $state(false);
	let err = $state('');

	const suggested = () =>
		/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'This device';

	async function add() {
		busy = true;
		err = '';
		try {
			await enroll(label.trim() || suggested(), page.url.search);
			await goto('/', { invalidateAll: true });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<main>
	<img class="logo" src="/brand/logo.svg" alt="Lorenzo Loconsole" width="701" height="362" />
	<div class="frame"><div class="card box">
	<h1>{data.existing.length === 0 ? 'Set up your passkey' : 'Add another passkey'}</h1>

	{#if data.existing.length === 0}
		<p class="sub">This creates the first sign-in credential for the portal.</p>
	{:else}
		<ul class="creds">
			{#each data.existing as c}
				<li>{c.label} <span>· added {c.createdAt.slice(0, 10)}</span></li>
			{/each}
		</ul>
	{/if}

	{#if data.existing.length === 1}
		<p class="warn">
			You only have one passkey. Enrol a second one on a different device now — losing this one
			otherwise means recovering through the Scaleway console.
		</p>
	{/if}

	<label>
		Name this device
		<input bind:value={label} placeholder={typeof navigator !== 'undefined' ? suggested() : 'Mac'} />
	</label>
	<button class="btn-primary" onclick={add} disabled={busy}>{busy ? 'Waiting for passkey…' : 'Create passkey'}</button>
	{#if err}<p class="err">{err}</p>{/if}
	</div></div>
</main>

<style>
	main { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
		padding: 2rem 1.5rem; background: var(--hero-gradient); }
	.logo { height: 4rem; width: auto; margin-bottom: 2rem; }
	.frame { width: 100%; max-width: 27rem; margin-right: 0.7rem; }
	.box { padding: 1.9rem 1.8rem; }
	h1 { font-size: 1.6rem; margin: 0 0 0.35rem; }
	.sub { color: var(--muted-foreground); margin: 0 0 1.4rem; font-size: 0.93rem; }
	.creds { list-style: none; padding: 0; margin: 0 0 1.25rem; font-size: 0.9rem; }
	.creds li { padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
	.creds span { color: var(--muted-foreground); }
	.warn { background: var(--warn-bg); border-left: 3px solid var(--brand-yellow-deep);
		padding: 0.7rem 0.9rem; border-radius: 0 0.5rem 0.5rem 0; font-size: 0.86rem; margin: 0 0 1.25rem; }
	label { margin-bottom: 1.1rem; }
	.btn-primary { width: 100%; justify-content: center; padding: 0.75rem 1.25rem; }
	.err { color: var(--danger); margin-top: 1rem; font-size: 0.88rem; }
</style>
