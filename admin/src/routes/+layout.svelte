<script lang="ts">
	import '$lib/brand/brand.css';
	let { children } = $props();
</script>

<svelte:head><title>loconsole admin</title></svelte:head>

{@render children()}

<style>
	/* Colours, fonts and radius come from the site via brand.css. Only states
	   the site has no need for — success, warning, destructive — are defined
	   here, tuned to sit alongside the cream and burgundy. */
	:global(:root) {
		--ok: hsl(152, 38%, 30%);
		--warn: hsl(36, 78%, 32%);
		--danger: hsl(4, 66%, 44%);
		--warn-bg: hsl(45, 90%, 94%);
		--brand-yellow-soft: hsl(42, 100%, 90%);
	}
	:global([data-theme='dark']) {
		--ok: hsl(150, 40%, 58%);
		--warn: hsl(40, 80%, 62%);
		--danger: hsl(4, 72%, 64%);
		--warn-bg: hsl(40, 30%, 16%);
		--brand-yellow-soft: hsl(42, 30%, 18%);
	}

	:global(*) { box-sizing: border-box; }
	/* The hidden attribute is only a user-agent display:none, which any author
	   display rule overrides. The editor's language panes set display:grid, so
	   all three languages rendered stacked at once and the tabs did nothing —
	   from the first version until this was caught. Make hidden always win. */
	:global([hidden]) { display: none !important; }
	:global(body) {
		margin: 0;
		background: var(--background);
		color: var(--foreground);
		font: 15px/1.6 'DM Sans', system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
		transition: background-color 0.3s, color 0.3s;
	}
	:global(h1, h2, h3) {
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--foreground);
	}
	:global(a) { color: var(--primary); }
	:global(button, input, select, textarea) { font: inherit; color: inherit; }
	:global(::selection) { background: var(--accent); color: var(--accent-foreground); }
	:global(:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 4px; }

	/* Components mirrored from static/css/main.css, so the portal shares the
	   site's shapes as well as its colours. */
	:global(.btn-primary) {
		display: inline-flex; align-items: center; gap: 0.5rem;
		padding: 0.6rem 1.25rem; border: none; border-radius: 0.5rem;
		background: var(--primary); color: var(--primary-foreground);
		font-weight: 500; cursor: pointer; text-decoration: none;
		transition: opacity 0.2s;
	}
	:global(.btn-primary:hover:not(:disabled)) { opacity: 0.88; }
	:global(.btn-outline) {
		display: inline-flex; align-items: center; gap: 0.5rem;
		padding: 0.55rem 1.15rem; border: 2px solid var(--border); border-radius: 0.5rem;
		background: var(--card); color: var(--foreground);
		font-weight: 500; cursor: pointer; text-decoration: none;
		transition: all 0.2s;
	}
	:global(.btn-outline:hover:not(:disabled)) { border-color: var(--primary); color: var(--primary); }
	:global(.btn-danger) {
		display: inline-flex; align-items: center; gap: 0.5rem;
		padding: 0.55rem 1.15rem; border: 2px solid var(--danger); border-radius: 0.5rem;
		background: transparent; color: var(--danger);
		font-weight: 600; cursor: pointer;
	}
	:global(.btn-primary:disabled, .btn-outline:disabled, .btn-danger:disabled) {
		opacity: 0.45; cursor: default;
	}
	:global(.pill) {
		display: inline-flex; align-items: center;
		padding: 0.3rem 0.85rem; border-radius: 2rem; border: none;
		background: var(--muted); color: var(--muted-foreground);
		font-size: 0.85rem; font-weight: 500; cursor: pointer; text-decoration: none;
		transition: all 0.2s;
	}
	:global(.pill:hover:not(.active)) { background: var(--accent); color: var(--accent-foreground); }
	:global(.pill.active) { background: var(--primary); color: var(--primary-foreground); }
	:global(.badge) {
		display: inline-block; font-size: 0.7rem; font-weight: 500;
		padding: 0.18rem 0.6rem; border-radius: 2rem;
		background: var(--accent); color: var(--accent-foreground);
	}
	:global(.card) {
		background: var(--card); border: 1px solid var(--border);
		border-radius: var(--radius); box-shadow: var(--card-shadow);
	}
	/* The site's signature: a yellow outline offset behind a card. Used
	   sparingly, as the site does. */
	:global(.frame) { position: relative; }
	:global(.frame::before) {
		content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
		border: 3px solid var(--brand-yellow); border-radius: calc(var(--radius) + 0.25rem);
		transform: translate(0.7rem, 0.7rem);
	}
	:global(.frame > *) { position: relative; z-index: 1; }
	/* Form controls, mirroring the site's contact form (.form-group): ink
	   labels at weight 500, inputs on the page background, burgundy focus. */
	:global(label) { display: block; font-size: 0.86rem; font-weight: 500; color: var(--foreground); }
	:global(input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='hidden']), select, textarea) {
		padding: 0.6rem 0.875rem; font-size: 0.9rem;
		border: 1px solid var(--border); border-radius: 0.5rem;
		background: var(--background); color: var(--foreground);
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	:global(label > input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='hidden']), label > select, label > textarea) {
		display: block; width: 100%; margin-top: 0.4rem;
	}
	:global(input:focus, select:focus, textarea:focus) {
		outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--accent);
	}
	:global(textarea) { resize: vertical; line-height: 1.55; }
	:global(input[readonly]) { color: var(--muted-foreground); background: var(--muted); }
	:global(input[type='checkbox']) { accent-color: var(--primary); width: 1rem; height: 1rem; }
	:global(input::placeholder, textarea::placeholder) { color: var(--muted-foreground); opacity: 0.75; }

	:global(.eyebrow) {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 0.74rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: 0.08em; color: var(--muted-foreground);
	}
</style>
