<script lang="ts">
	let { children } = $props();
</script>

<svelte:head><title>loconsole admin</title></svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg: #faf8f4;
		--panel: #ffffff;
		--ink: #1c1a17;
		--muted: #6b6459;
		--line: #e4ded3;
		--accent: #1f5f4e;
		--accent-ink: #ffffff;
		--warn: #8a5a00;
		--danger: #a02c2c;
		--radius: 10px;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #161513;
			--panel: #201e1b;
			--ink: #f0ece5;
			--muted: #a09789;
			--line: #332f2a;
			--accent: #4ea88c;
			--accent-ink: #10201b;
			--warn: #d9a441;
			--danger: #e07a7a;
		}
	}
	:global(*) { box-sizing: border-box; }
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--ink);
		font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
	}
	:global(a) { color: var(--accent); }
	:global(button, input, select, textarea) { font: inherit; color: inherit; }
</style>
