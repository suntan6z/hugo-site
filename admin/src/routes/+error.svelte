<script lang="ts">
	import { page } from '$app/state';

	const known: Record<number, { title: string; hint: string }> = {
		404: { title: 'Not found', hint: 'That page, article or gallery city does not exist.' },
		401: { title: 'Not signed in', hint: 'Your session expired or was signed out elsewhere.' },
		409: { title: 'The repository moved', hint: 'Something was pushed while you were editing. Reload and try again.' },
		422: { title: 'Blocked by pre-publish checks', hint: 'Go back and fix the problems listed on the article.' },
		500: { title: 'Something broke', hint: 'The details below are what the server reported.' }
	};
	const info = $derived(known[page.status] ?? { title: 'Error', hint: '' });
</script>

<main>
	<span class="code">{page.status}</span>
	<h1>{info.title}</h1>
	{#if info.hint}<p class="hint">{info.hint}</p>{/if}
	{#if page.error?.message && page.error.message !== info.title}
		<pre>{page.error.message}</pre>
	{/if}
	<nav>
		<a href="/">Dashboard</a>
		<a href="/posts">Articles</a>
		{#if page.status === 401}<a href="/login">Sign in</a>{/if}
	</nav>
</main>

<style>
	main { max-width: 34rem; margin: 14vh auto; padding: 0 1.5rem; }
	.code { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; color: var(--muted-foreground); }
	h1 { font-size: 1.5rem; margin: 0.2rem 0 0.4rem; letter-spacing: -0.015em; }
	.hint { color: var(--muted-foreground); margin: 0 0 1rem; }
	pre { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--danger);
		border-radius: 0 8px 8px 0; padding: 0.7rem 0.9rem; font-size: 0.82rem;
		white-space: pre-wrap; word-break: break-word; margin: 0 0 1.25rem; }
	nav { display: flex; gap: 1rem; font-size: 0.9rem; }
</style>
