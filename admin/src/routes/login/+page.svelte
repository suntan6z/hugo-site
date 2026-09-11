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
			const msg = e instanceof Error ? e.message : String(e);
			// A dismissed Touch ID prompt is not an error worth alarming about.
			err = /NotAllowed|cancel|timed out/i.test(msg) ? 'Sign-in was cancelled.' : msg;
		} finally {
			busy = false;
		}
	}
</script>

<main>
	<img class="logo" src="/brand/logo.svg" alt="Lorenzo Loconsole" width="701" height="362" />

	<div class="frame">
		<div class="card box">
			<h1>Welcome back</h1>
			<p class="sub">Sign in to manage lorenzo.loconsole.eu.</p>
			<button class="btn-primary" onclick={signIn} disabled={busy}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>
				{busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
			</button>
			{#if err}<p class="err">{err}</p>{/if}
		</div>
	</div>

	<p class="foot">Private admin portal · not indexed</p>
</main>

<style>
	main {
		min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
		padding: 2rem 1.5rem; background: var(--hero-gradient);
	}
	.logo { height: 4.5rem; width: auto; margin-bottom: 2.25rem; }
	.frame { width: 100%; max-width: 24rem; margin-right: 0.7rem; }
	.box { padding: 2rem 1.9rem 1.8rem; text-align: center; }
	h1 { font-size: 1.75rem; margin: 0 0 0.35rem; }
	.sub { color: var(--muted-foreground); margin: 0 0 1.6rem; font-size: 0.94rem; }
	.btn-primary { width: 100%; justify-content: center; padding: 0.75rem 1.25rem; }
	.err { color: var(--danger); margin: 1rem 0 0; font-size: 0.88rem; }
	.foot { margin-top: 2.75rem; font-size: 0.78rem; color: var(--muted-foreground); letter-spacing: 0.02em; }
</style>
