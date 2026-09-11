<script lang="ts">
	/**
	 * Live article preview.
	 *
	 * The frame is loaded ONCE with a shell document — the site's stylesheet
	 * and empty .post-title / .post-body elements — and every update after that
	 * swaps only the text inside it. Replacing the whole document on each
	 * keystroke reloaded the frame and snapped it back to the top, which on a
	 * long article made split view unusable.
	 *
	 * Sandboxed WITHOUT allow-scripts: articles may carry raw HTML, and with
	 * scripting disabled nothing in them can run, not even inline handlers.
	 * allow-same-origin on its own is safe — it is what lets this component
	 * update the frame, and lets preview images load with the session cookie.
	 */
	import { onMount } from 'svelte';
	import { renderMarkdown, buildPreviewDoc } from '$lib/preview/render';
	import siteCss from '$lib/brand/site.css?raw';

	let {
		body,
		title,
		date,
		category,
		lang,
		slug,
		siteUrl,
		pending = {},
		theme,
		syncRatio = null
	}: {
		body: string;
		title: string;
		date: string;
		category: string;
		lang: string;
		slug: string;
		siteUrl: string;
		pending?: Record<string, string>;
		theme: 'light' | 'dark';
		/** 0..1 scroll position of the textarea, to keep the two in step. */
		syncRatio?: number | null;
	} = $props();

	let frame: HTMLIFrameElement;
	let loaded = $state(false);

	onMount(() => {
		// Imperative on purpose: a declarative srcdoc binding set before the frame
		// was attached left it showing an empty document.
		frame.addEventListener('load', () => (loaded = true), { once: true });
		frame.srcdoc = buildPreviewDoc({ html: '', title: '', date: '', category: '', siteCss, theme, lang });
	});

	const doc = () => (loaded ? frame?.contentDocument : null);

	$effect(() => {
		const d = doc();
		if (!d) return;
		d.documentElement.setAttribute('data-theme', theme);
		d.documentElement.lang = lang;
	});

	// Re-render shortly after typing stops.
	$effect(() => {
		const d = doc();
		const input = { body, title, date, category, lang, pending };
		if (!d) return;
		const t = setTimeout(() => {
			const titleEl = d.querySelector('.post-title');
			const bodyEl = d.querySelector('.post-body');
			const meta = d.querySelector('.pv-meta');
			if (titleEl) titleEl.textContent = input.title || 'Untitled';
			if (meta) {
				const when = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
					? new Date(`${input.date}T00:00:00Z`).toLocaleDateString(input.lang, {
							day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
						})
					: '';
				meta.replaceChildren();
				if (input.category) {
					const b = d.createElement('span');
					b.className = 'category-badge';
					b.textContent = input.category;
					meta.append(b);
				}
				if (when) {
					const s = d.createElement('span');
					s.textContent = when;
					meta.append(s);
				}
			}
			if (bodyEl) {
				bodyEl.innerHTML = renderMarkdown(input.body, { slug, siteUrl, pending: input.pending });
			}
		}, 160);
		return () => clearTimeout(t);
	});

	// Follow the textarea's scroll position proportionally.
	$effect(() => {
		const d = doc();
		if (!d || syncRatio === null) return;
		const el = d.scrollingElement ?? d.documentElement;
		el.scrollTop = syncRatio * (el.scrollHeight - el.clientHeight);
	});
</script>

<iframe
	bind:this={frame}
	title="Article preview"
	sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
></iframe>

<style>
	iframe {
		width: 100%; height: 100%; min-height: 60vh; display: block;
		border: 1px solid var(--border); border-radius: var(--radius); background: var(--background);
	}
</style>
