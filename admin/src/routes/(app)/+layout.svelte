<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	let { children, data } = $props();

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/posts', label: 'Articles' },
		{ href: '/gallery', label: 'Gallery' },
		{ href: '/analytics', label: 'Search' },
		{ href: '/newsletter', label: 'Newsletter' },
		{ href: '/i18n', label: 'Strings' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	let menuOpen = $state(false);
	let dark = $state(false);
	$effect(() => {
		dark = document.documentElement.getAttribute('data-theme') === 'dark';
	});

	// Same toggle as the site's main.js: flip data-theme and remember it.
	function toggleTheme() {
		const next = dark ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		try { localStorage.setItem('theme', next); } catch {}
		dark = !dark;
	}

	async function signOut() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/login', { invalidateAll: true });
	}

	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});
</script>

<header>
	<div class="bar">
		<a href="/" class="logo" aria-label="loconsole admin — Dashboard">
			<img src="/brand/logo.svg" alt="Lorenzo Loconsole" width="701" height="362" />
			<span class="tag">admin</span>
		</a>

		<nav class:open={menuOpen}>
			{#each nav as item}
				<a href={item.href} class="nav-btn" class:active={isActive(item.href)}>{item.label}</a>
			{/each}
		</nav>

		<div class="right">
			{#if data.mode === 'local'}
				<span class="local" title="Writing directly to the working copy on disk">local</span>
			{/if}
			<a href={data.siteUrl} class="icon-btn" title="Open the live site" target="_blank" rel="noreferrer">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
			</a>
			<button class="icon-btn" onclick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle dark mode">
				{#if dark}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
				{/if}
			</button>
			<a href="/settings" class="icon-btn" class:on={isActive('/settings')} title="Settings" aria-label="Settings">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
			</a>
			<button class="icon-btn" onclick={signOut} title="Sign out" aria-label="Sign out">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
			</button>
			<button class="icon-btn hamburger" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
			</button>
		</div>
	</div>
</header>

<main>{@render children()}</main>

<style>
	/* Mirrors the site's header: translucent cream, blurred, hairline border. */
	header {
		position: sticky; top: 0; z-index: 20;
		background: var(--header-bg);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--header-border);
	}
	.bar {
		display: flex; align-items: center; gap: 1rem;
		max-width: 76rem; margin: 0 auto; padding: 0.55rem 1.25rem;
	}
	.logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; flex: none;
		transition: transform 0.2s; }
	.logo:hover { transform: scale(1.02); }
	.logo img { height: 2.6rem; width: auto; display: block; }
	.tag {
		font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 500;
		font-size: 0.85rem; color: var(--muted-foreground);
		padding-left: 0.5rem; border-left: 1px solid var(--border);
	}

	nav { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-left: auto; }
	/* The site's .nav-btn: bordered pill, burgundy tint when active. */
	.nav-btn {
		display: inline-block; padding: 0.32rem 0.9rem;
		font-size: 0.87rem; font-weight: 500; text-decoration: none;
		color: var(--foreground);
		border: 2px solid var(--border); border-radius: 2rem;
		transition: all 0.25s ease;
	}
	.nav-btn:hover, .nav-btn.active {
		border-color: var(--primary); color: var(--primary); background: var(--accent);
	}

	.right { display: flex; align-items: center; gap: 0.15rem; flex: none; }
	.icon-btn {
		display: inline-flex; align-items: center; justify-content: center;
		width: 2.1rem; height: 2.1rem; padding: 0; border: none; border-radius: 50%;
		background: none; color: var(--muted-foreground); cursor: pointer; text-decoration: none;
		transition: color 0.2s, background 0.2s;
	}
	.icon-btn:hover, .icon-btn.on { color: var(--primary); background: var(--accent); }
	.local {
		font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
		padding: 0.18rem 0.5rem; margin-right: 0.35rem; border-radius: 2rem;
		background: var(--brand-yellow); color: hsl(35, 60%, 20%);
	}
	.hamburger { display: none; }

	main { max-width: 76rem; margin: 0 auto; padding: 2rem 1.25rem 5rem; }

	/* Nav folds into a menu on narrow screens rather than wrapping into rows. */
	@media (max-width: 900px) {
		.hamburger { display: inline-flex; }
		nav {
			display: none; position: absolute; left: 0; right: 0; top: 100%;
			flex-direction: column; gap: 0.35rem; padding: 0.75rem 1.25rem 1rem;
			background: var(--background); border-bottom: 1px solid var(--border);
			box-shadow: var(--card-shadow);
		}
		nav.open { display: flex; }
		.nav-btn { text-align: center; }
		.right { margin-left: auto; }
		main { padding: 1.5rem 1rem 4rem; }
	}
	@media (max-width: 480px) {
		.tag { display: none; }
		.logo img { height: 2.2rem; }
	}
</style>
