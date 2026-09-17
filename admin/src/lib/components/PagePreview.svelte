<script lang="ts">
	/**
	 * Live preview of a standalone page's HTML, styled by the site's stylesheet.
	 *
	 * Same approach as ArticlePreview: the frame is loaded once and only the
	 * contents of <main> are swapped as you type, so it keeps its scroll
	 * position. Sandboxed without allow-scripts, so nothing in the page runs —
	 * which also means the contact form shows but does not work here.
	 */
	import { onMount } from 'svelte';
	import siteCss from '$lib/brand/site.css?raw';

	let { html, lang, siteUrl, theme }: { html: string; lang: string; siteUrl: string; theme: 'light' | 'dark' } = $props();

	let frame: HTMLIFrameElement;
	let loaded = $state(false);

	/** Root-relative images and links point at the live site: the preview has none of its own. */
	const resolve = (s: string) =>
		s
			.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
			.replace(/(\s(?:src|href)=")(\/(?!\/)[^"]*)"/gi, (_m, a: string, path: string) => `${a}${siteUrl}${path}"`);

	onMount(() => {
		frame.addEventListener('load', () => (loaded = true), { once: true });
		frame.srcdoc = `<!doctype html><html lang="${lang}" data-theme="${theme}"><head><meta charset="utf-8"><style>${siteCss}</style><style>body{margin:0}</style></head><body><main></main></body></html>`;
	});

	$effect(() => {
		const d = loaded ? frame?.contentDocument : null;
		if (!d) return;
		d.documentElement.setAttribute('data-theme', theme);
		d.documentElement.lang = lang;
	});

	$effect(() => {
		const d = loaded ? frame?.contentDocument : null;
		const source = html;
		if (!d) return;
		const t = setTimeout(() => {
			const main = d.querySelector('main');
			if (main) main.innerHTML = resolve(source);
		}, 160);
		return () => clearTimeout(t);
	});
</script>

<iframe bind:this={frame} title="Page preview" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>

<style>
	iframe {
		width: 100%; height: 100%; min-height: 70vh; display: block;
		border: 1px solid var(--border); border-radius: var(--radius); background: var(--background);
	}
</style>
