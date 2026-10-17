<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	let { children, data } = $props();

	// Grouped by what the visit is for, not by how the code is organised.
	// Icons are Lucide paths: one 24px grid, 2px round stroke.
	const groups = [
		{
			label: null,
			items: [{ href: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]
		},
		{
			label: 'Write',
			items: [
				{ href: '/posts', label: 'Articles', icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6' },
				{ href: '/pages', label: 'Pages', icon: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M9 9v11' }
			]
		},
		{
			label: 'Media',
			items: [
				{ href: '/gallery', label: 'Gallery', icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21' },
				{ href: '/media', label: 'Library', icon: 'M2 7a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z' }
			]
		},
		{
			label: 'Audience',
			items: [{ href: '/newsletter', label: 'Newsletter', icon: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 6 9-6' }]
		},
		{
			label: 'Insights',
			items: [
				{ href: '/visitors', label: 'Visitors', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
				{ href: '/analytics', label: 'Search', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3' }
			]
		},
		{
			label: 'Site',
			items: [
				{ href: '/i18n', label: 'Strings', icon: 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6' },
				{ href: '/redirects', label: 'Redirects', icon: 'M15 14l5-5-5-5M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13' },
				{ href: '/audit', label: 'Activity', icon: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2' },
				{ href: '/settings', label: 'Settings', icon: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M16 4v4M8 10v4M18 16v4' }
			]
		}
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

<div class="shell">
	<!-- Narrow screens: a slim bar with the logo and a menu button. -->
	<header class="topbar">
		<a href="/" class="logo" aria-label="loconsole admin — Home">
			<img src="/brand/logo.svg" alt="Lorenzo Loconsole" width="701" height="362" />
		</a>
		<button class="icon-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				{#if menuOpen}<path d="M6 6l12 12M18 6 6 18" />{:else}<path d="M4 7h16M4 12h16M4 17h16" />{/if}
			</svg>
		</button>
	</header>

	{#if menuOpen}<button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>{/if}

	<aside class:open={menuOpen}>
		<a href="/" class="logo brand" aria-label="loconsole admin — Home">
			<img src="/brand/logo.svg" alt="Lorenzo Loconsole" width="701" height="362" />
			<span class="tag">admin</span>
		</a>

		<nav aria-label="Sections">
			{#each groups as g}
				<div class="group">
					{#if g.label}<span class="group-label">{g.label}</span>{/if}
					{#each g.items as item}
						<a href={item.href} class="item" class:active={isActive(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
							{item.label}
						</a>
					{/each}
				</div>
			{/each}
		</nav>

		<div class="foot">
			{#if data.mode === 'local'}
				<span class="local" title="Writing directly to the working copy on disk">Local mode</span>
			{/if}
			<a href={data.siteUrl} class="item" target="_blank" rel="noreferrer">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
				View live site
			</a>
			<button class="item" onclick={toggleTheme}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if dark}<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />{:else}<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />{/if}
				</svg>
				{dark ? 'Light mode' : 'Dark mode'}
			</button>
			<button class="item" onclick={signOut}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
				Sign out
			</button>
		</div>
	</aside>

	<main>{@render children()}</main>
</div>

<style>
	.shell {
		--bar-h: 0rem;
		display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100vh;
	}

	/* ---- sidebar ---------------------------------------------------- */
	aside {
		position: sticky; top: 0; height: 100vh; overflow-y: auto;
		display: flex; flex-direction: column; gap: 1.1rem;
		padding: 1.1rem 0.8rem 0.9rem; background: var(--sidebar-bg);
		border-right: 1px solid var(--border);
	}
	.logo { display: flex; align-items: center; gap: 0.55rem; text-decoration: none; }
	.logo img { height: 2.6rem; width: auto; display: block; }
	.brand { padding: 0 0.5rem; }
	.tag {
		font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 500;
		font-size: 0.9rem; color: var(--muted-foreground);
		padding-left: 0.55rem; border-left: 1px solid var(--border);
	}

	nav { display: flex; flex-direction: column; gap: 1.1rem; flex: 1; }
	.group { display: flex; flex-direction: column; gap: 0.12rem; }
	.group-label {
		padding: 0 0.7rem 0.25rem; font-size: 0.68rem; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground);
	}
	.item {
		position: relative; display: flex; align-items: center; gap: 0.7rem;
		width: 100%; padding: 0.55rem 0.7rem; border: 0; border-radius: 0.6rem;
		background: none; color: var(--foreground); font: inherit; font-size: 0.92rem; font-weight: 500;
		text-align: left; text-decoration: none; cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
	}
	.item svg { flex: none; color: var(--muted-foreground); transition: color 0.15s; }
	.item:hover { background: color-mix(in srgb, var(--foreground) 7%, transparent); }
	.item:hover svg { color: var(--foreground); }
	.item.active { background: var(--accent); color: var(--primary-strong); font-weight: 650; }
	.item.active svg { color: var(--primary); }
	.item.active::before {
		content: ''; position: absolute; left: -0.8rem; top: 0.45rem; bottom: 0.45rem;
		width: 4px; border-radius: 0 4px 4px 0; background: var(--primary);
	}

	.foot { display: flex; flex-direction: column; gap: 0.12rem; padding-top: 0.8rem; border-top: 1px solid var(--border); }
	.foot .item { font-size: 0.86rem; color: var(--muted-foreground); }
	.local {
		align-self: flex-start; margin: 0 0 0.5rem 0.7rem;
		font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
		padding: 0.2rem 0.55rem; border-radius: 2rem;
		background: var(--brand-yellow); color: hsl(35, 60%, 20%);
	}

	/* ---- content ---------------------------------------------------- */
	main { min-width: 0; width: 100%; max-width: 74rem; padding: 2.25rem 2.5rem 6rem; }

	.topbar, .scrim { display: none; }
	.icon-btn {
		display: inline-flex; align-items: center; justify-content: center;
		width: 2.6rem; height: 2.6rem; padding: 0; border: none; border-radius: 0.6rem;
		background: none; color: var(--foreground); cursor: pointer;
	}
	.icon-btn:hover { background: var(--accent); color: var(--primary); }

	/* ---- narrow screens: the sidebar becomes a drawer ---------------- */
	@media (max-width: 899px) {
		.shell { --bar-h: 3.4rem; display: block; }
		.topbar {
			position: sticky; top: 0; z-index: 30; height: var(--bar-h);
			display: flex; align-items: center; justify-content: space-between;
			padding: 0 0.6rem 0 1rem; background: var(--header-bg);
			backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
			border-bottom: 1px solid var(--border);
		}
		.topbar .logo img { height: 2.3rem; }
		aside {
			position: fixed; z-index: 50; top: 0; bottom: 0; left: 0; height: auto;
			width: min(19rem, 86vw); transform: translateX(-100%); visibility: hidden;
			transition: transform 0.2s ease, visibility 0s linear 0.2s;
			box-shadow: 0 0 40px hsl(0 0% 0% / 0.25);
		}
		aside.open { transform: none; visibility: visible; transition: transform 0.2s ease; }
		.item.active::before { left: -0.8rem; }
		.scrim {
			display: block; position: fixed; inset: 0; z-index: 40; border: 0;
			background: hsl(0 0% 0% / 0.4);
		}
		main { padding: 1.5rem 1rem 5rem; max-width: none; }
	}
</style>
