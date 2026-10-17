<script lang="ts">
	import '$lib/brand/brand.css';
	let { children } = $props();
</script>

<svelte:head><title>loconsole admin</title></svelte:head>

{@render children()}

<style>
	/* Brand colours, fonts and radius come from the site via brand.css. The
	   portal adds what a working tool needs and a showcase site does not:
	   status colours that are told apart at a glance (green done, amber
	   needs a look, red irreversible, blue information), a sidebar surface,
	   and edges and shadows strong enough to separate a card from the page.
	   `html:root` outranks brand.css's plain `:root`, whatever the load order. */
	:global(html:root) {
		--ok: hsl(152, 48%, 26%);
		--ok-bg: hsl(150, 46%, 92%);
		--ok-line: hsl(150, 32%, 74%);
		--warn: hsl(30, 90%, 28%);
		--warn-bg: hsl(43, 96%, 90%);
		--warn-line: hsl(40, 72%, 68%);
		--danger: hsl(4, 68%, 42%);
		--danger-bg: hsl(4, 82%, 95%);
		--danger-line: hsl(4, 62%, 80%);
		--info: hsl(213, 64%, 38%);
		--info-bg: hsl(213, 72%, 94%);
		--info-line: hsl(213, 52%, 78%);
		--brand-yellow-soft: hsl(42, 100%, 90%);
		--sidebar-bg: hsl(30, 22%, 93%);
		--border: hsl(30, 14%, 83%);
		--card-shadow: 0 1px 2px hsl(220 15% 15% / 0.06), 0 6px 18px -8px hsl(220 15% 15% / 0.14);
		--primary-strong: hsl(350, 48%, 32%);
		--sidebar-w: 15.5rem;
	}
	:global(html[data-theme='dark']) {
		--ok: hsl(150, 46%, 62%);
		--ok-bg: hsl(150, 24%, 15%);
		--ok-line: hsl(150, 24%, 28%);
		--warn: hsl(40, 88%, 66%);
		--warn-bg: hsl(40, 32%, 16%);
		--warn-line: hsl(40, 38%, 30%);
		--danger: hsl(4, 80%, 68%);
		--danger-bg: hsl(4, 34%, 17%);
		--danger-line: hsl(4, 36%, 32%);
		--info: hsl(212, 80%, 70%);
		--info-bg: hsl(212, 34%, 17%);
		--info-line: hsl(212, 34%, 32%);
		--brand-yellow-soft: hsl(42, 30%, 18%);
		--sidebar-bg: hsl(25, 14%, 8%);
		--border: hsl(25, 9%, 27%);
		--card-shadow: 0 1px 2px hsl(0 0% 0% / 0.4), 0 6px 18px -8px hsl(0 0% 0% / 0.6);
		--primary-strong: hsl(350, 50%, 64%);
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
	/* One button vocabulary. A screen has a single .btn-primary, named for what
	   it does ("Publish", "Send to 3 people"); everything else is quieter. */
	:global(.btn-primary, .btn-outline, .btn-ghost, .btn-danger, .btn-danger-quiet) {
		display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
		min-height: 2.6rem; padding: 0.55rem 1.3rem; border: 1.5px solid transparent;
		border-radius: 0.65rem; font-size: 0.92rem; font-weight: 600; line-height: 1.2;
		cursor: pointer; text-decoration: none; white-space: nowrap;
		transition: background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.08s;
	}
	:global(.btn-primary:active:not(:disabled), .btn-danger:active:not(:disabled)) { transform: translateY(1px); }
	:global(.btn-primary) {
		background: var(--primary); color: var(--primary-foreground);
		box-shadow: 0 1px 0 hsl(350 50% 22% / 0.35), 0 6px 14px -6px hsl(350 45% 38% / 0.6);
	}
	:global(.btn-primary:hover:not(:disabled)) { background: color-mix(in srgb, var(--primary) 86%, black); }
	:global(.btn-outline) { background: var(--card); color: var(--foreground); border-color: var(--border); }
	:global(.btn-outline:hover:not(:disabled)) { border-color: var(--primary); color: var(--primary); background: var(--accent); }
	:global(.btn-ghost) { background: transparent; color: var(--primary); padding-inline: 0.8rem; }
	:global(.btn-ghost:hover:not(:disabled)) { background: var(--accent); }
	:global(.btn-danger) {
		background: var(--danger); color: #fff;
		box-shadow: 0 1px 0 hsl(4 66% 24% / 0.35), 0 6px 14px -6px hsl(4 66% 40% / 0.6);
	}
	:global(.btn-danger:hover:not(:disabled)) { background: color-mix(in srgb, var(--danger) 86%, black); }
	:global(.btn-danger-quiet) { background: transparent; color: var(--danger); border-color: var(--danger-line); }
	:global(.btn-danger-quiet:hover:not(:disabled)) { background: var(--danger-bg); border-color: var(--danger); }
	:global(.btn-lg) { min-height: 3rem; padding: 0.7rem 1.7rem; font-size: 1rem; }
	:global(.btn-sm, .btn-primary.small, .btn-outline.small) {
		min-height: 2.1rem; padding: 0.3rem 0.85rem; font-size: 0.82rem; border-radius: 0.55rem;
	}
	:global(.btn-primary:disabled, .btn-outline:disabled, .btn-ghost:disabled, .btn-danger:disabled, .btn-danger-quiet:disabled) {
		opacity: 0.45; cursor: not-allowed; box-shadow: none;
	}
	/* Status chips: the same four colours everywhere, text plus a dot so colour
	   is never the only signal. */
	:global(.chip) {
		display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.65rem;
		border-radius: 2rem; font-size: 0.76rem; font-weight: 600; border: 1px solid transparent;
		background: var(--muted); color: var(--muted-foreground);
	}
	:global(.chip::before) { content: ''; width: 0.45rem; height: 0.45rem; border-radius: 50%; background: currentColor; }
	:global(.chip.ok) { background: var(--ok-bg); color: var(--ok); border-color: var(--ok-line); }
	:global(.chip.warn) { background: var(--warn-bg); color: var(--warn); border-color: var(--warn-line); }
	:global(.chip.danger) { background: var(--danger-bg); color: var(--danger); border-color: var(--danger-line); }
	:global(.chip.info) { background: var(--info-bg); color: var(--info); border-color: var(--info-line); }
	/* Page title row: title and one-line purpose on the left, the screen's
	   primary action on the right. */
	:global(.page-head) { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
	:global(.page-head h1) { margin: 0; font-size: 1.75rem; letter-spacing: -0.02em; }
	:global(.page-head p) { margin: 0.25rem 0 0; color: var(--muted-foreground); font-size: 0.92rem; }
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
