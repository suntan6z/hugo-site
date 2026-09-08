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
	<button onclick={add} disabled={busy}>{busy ? 'Waiting for passkey…' : 'Create passkey'}</button>
	{#if err}<p class="err">{err}</p>{/if}
</main>

<style>
	main { max-width: 24rem; margin: 14vh auto; padding: 0 1.5rem; }
	h1 { font-size: 1.35rem; margin: 0 0 0.35rem; letter-spacing: -0.01em; }
	.sub { color: var(--muted); margin: 0 0 1.5rem; }
	.creds { list-style: none; padding: 0; margin: 0 0 1.25rem; font-size: 0.9rem; }
	.creds li { padding: 0.4rem 0; border-bottom: 1px solid var(--line); }
	.creds span { color: var(--muted); }
	.warn {
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		border-left: 3px solid var(--warn);
		padding: 0.7rem 0.9rem;
		border-radius: 0 6px 6px 0;
		font-size: 0.88rem;
		margin: 0 0 1.25rem;
	}
	label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 1rem; }
	input {
		display: block;
		width: 100%;
		margin-top: 0.3rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--panel);
	}
	button {
		width: 100%;
		padding: 0.7rem 1rem;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled { opacity: 0.6; cursor: default; }
	.err { color: var(--danger); margin-top: 1rem; font-size: 0.9rem; }
</style>
