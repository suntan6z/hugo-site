<script lang="ts">
	import { login } from '$lib/client/passkey';
	import { goto } from '$app/navigation';

	let busy = $state(false);
	let err = $state('');

	async function signIn() {
		busy = true;
		err = '';
		try {
			await login();
			await goto('/', { invalidateAll: true });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<main>
	<h1>loconsole admin</h1>
	<p class="sub">Sign in with your passkey.</p>
	<button onclick={signIn} disabled={busy}>{busy ? 'Waiting for passkey…' : 'Sign in'}</button>
	{#if err}<p class="err">{err}</p>{/if}
</main>

<style>
	main {
		max-width: 22rem;
		margin: 18vh auto;
		padding: 0 1.5rem;
		text-align: center;
	}
	h1 { font-size: 1.4rem; margin: 0 0 0.35rem; letter-spacing: -0.01em; }
	.sub { color: var(--muted); margin: 0 0 1.75rem; }
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
