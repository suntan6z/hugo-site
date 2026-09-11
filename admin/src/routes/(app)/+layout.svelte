<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	let { children, data } = $props();

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/posts', label: 'Articles' },
		{ href: '/gallery', label: 'Gallery' },
		{ href: '/analytics', label: 'Search' }
	];

	async function signOut() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/login', { invalidateAll: true });
	}
</script>

<header>
	<nav>
		<strong>loconsole</strong>
		{#each nav as item}
			<a href={item.href} class:active={page.url.pathname === item.href}>{item.label}</a>
		{/each}
	</nav>
	<div class="right">
		<a class="settings" href="/settings" title="Settings">Settings</a>
		{#if data.mode === 'local'}<span class="badge" title="Writing directly to the working copy on disk">local</span>{/if}
		<button onclick={signOut}>Sign out</button>
	</div>
</header>

<main>{@render children()}</main>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 1.25rem;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		position: sticky;
		top: 0;
		z-index: 5;
	}
	nav { display: flex; align-items: baseline; gap: 1.1rem; }
	nav strong { letter-spacing: -0.01em; }
	nav a { color: var(--muted); text-decoration: none; font-size: 0.92rem; }
	nav a.active, nav a:hover { color: var(--ink); }
	.right { display: flex; align-items: center; gap: 0.75rem; }
	.settings { color: var(--muted); text-decoration: none; font-size: 0.85rem; }
	.settings:hover { color: var(--ink); }
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
		font-weight: 700;
	}
	button {
		background: none;
		border: 1px solid var(--line);
		border-radius: 7px;
		padding: 0.3rem 0.7rem;
		font-size: 0.85rem;
		cursor: pointer;
		color: var(--muted);
	}
	button:hover { color: var(--ink); }
	main { max-width: 60rem; margin: 0 auto; padding: 1.75rem 1.25rem 5rem; }
</style>
