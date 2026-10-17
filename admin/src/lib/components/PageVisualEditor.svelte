<script lang="ts">
	/**
	 * A standalone page as visitors see it, editable where it stands: click a
	 * heading, a paragraph, a button, and type.
	 *
	 * The page is the site's own HTML in a frame styled by the site's own
	 * stylesheet. Each editable block (see lib/page-blocks.ts for what counts)
	 * is made `contenteditable`, and every keystroke replaces that one block's
	 * inner HTML in the source string and nothing else, so the file the author
	 * would have written by hand is the file that gets saved. Nothing here
	 * re-serialises the page from the browser's DOM.
	 *
	 * Sandboxed without allow-scripts, as in the preview: the page's own scripts
	 * (the contact form's) never run, so clicking is always editing.
	 */
	import { onMount, tick } from 'svelte';
	import siteCss from '$lib/brand/site.css?raw';
	import {
		annotate, scanBlocks, patchInner, patchAttr, attrOf, removeBlock, duplicateBlock, blockName, isRepeatable
	} from '$lib/page-blocks';

	let { html = $bindable(), lang, siteUrl, theme }: { html: string; lang: string; siteUrl: string; theme: 'light' | 'dark' } = $props();

	let frame: HTMLIFrameElement;
	let stage: HTMLDivElement;
	let urlInput = $state<HTMLInputElement | null>(null);
	let loaded = $state(false);
	let showAll = $state(false);

	// What the frame currently shows, so our own edits do not repaint it under the caret.
	let lastEmitted = '';
	let activeEl: HTMLElement | null = null;

	let active = $state<{ id: number; tag: string } | null>(null);
	let pos = $state({ top: 0, left: 0 });
	let bold = $state(false);
	let italic = $state(false);
	let inLink = $state(false);
	let collapsed = $state(true);
	let linkMode = $state(false);
	let linkUrl = $state('');
	let linkHint = $state('');
	let savedRange: Range | null = null;
	let blockHref = $state('');
	let textVal = $state('');
	let toast = $state<{ text: string } | null>(null);
	let undo: string[] = [];

	/** Edited in the toolbar rather than in place: a button or a summary does not take typing reliably. */
	const FIELD_TAGS = new Set(['button', 'summary']);

	const EDITOR_CSS = `
		body{margin:0}
		[data-ed]{cursor:text;border-radius:3px;transition:outline-color .12s,background-color .12s}
		button[data-ed],summary[data-ed]{cursor:pointer}
		[data-ed]:hover{outline:2px dashed color-mix(in srgb,var(--primary) 65%,transparent);outline-offset:3px}
		[data-ed]:focus,[data-ed].on{outline:2px solid var(--primary);outline-offset:3px;background-color:color-mix(in srgb,var(--primary) 7%,transparent)}
		html.show-all [data-ed]{outline:1px dashed color-mix(in srgb,var(--primary) 50%,transparent);outline-offset:3px}
		[contenteditable]{caret-color:var(--primary)}
	`;

	const doc = () => frame.contentDocument!;

	/** Images in the page are root-relative; the portal has none of its own, so they come from the live site. */
	const srcAbs = (s: string) =>
		s
			.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
			.replace(/(\s(?:src|srcset)=")(\/(?!\/)[^"]*)"/gi, (_m, a: string, p: string) => `${a}${siteUrl}${p}"`);

	function paint(d: Document, source: string) {
		const main = d.querySelector('main');
		if (!main) return;
		const y = d.defaultView?.scrollY ?? 0;
		main.innerHTML = srcAbs(annotate(source));
		for (const el of main.querySelectorAll<HTMLElement>('[data-ed]')) {
			if (FIELD_TAGS.has(el.tagName.toLowerCase())) continue;
			el.setAttribute('contenteditable', 'true');
			el.setAttribute('spellcheck', 'true');
		}
		lastEmitted = source;
		d.defaultView?.scrollTo(0, y);
	}

	onMount(() => {
		frame.addEventListener('load', () => (loaded = true), { once: true });
		frame.srcdoc = `<!doctype html><html lang="${lang}" data-theme="${theme}"><head><meta charset="utf-8"><style>${siteCss}</style><style>${EDITOR_CSS}</style></head><body><main></main></body></html>`;
		const onResize = () => place();
		addEventListener('resize', onResize);
		return () => removeEventListener('resize', onResize);
	});

	// Paint whenever the source changed from somewhere other than typing here:
	// another language, a restored version, a machine translation, the HTML view.
	$effect(() => {
		const d = loaded ? frame?.contentDocument : null;
		const source = html;
		if (!d || source === lastEmitted) return;
		active = null;
		activeEl = null;
		paint(d, source);
	});

	$effect(() => {
		const d = loaded ? frame?.contentDocument : null;
		if (!d) return;
		d.documentElement.setAttribute('data-theme', theme);
		d.documentElement.lang = lang;
	});

	$effect(() => {
		const d = loaded ? frame?.contentDocument : null;
		d?.documentElement.classList.toggle('show-all', showAll);
	});

	// Listeners go on once, when the frame is ready.
	$effect(() => {
		if (!loaded) return;
		const d = doc();
		const w = d.defaultView!;
		// The frame is another realm: its elements are not `instanceof` this page's Element.
		const blockOf = (t: EventTarget | null) => {
			const el = t as Element | null;
			return el && typeof el.closest === 'function' ? (el.closest('[data-ed]') as HTMLElement | null) : null;
		};

		const click = (e: Event) => {
			const t = e.target as Element;
			if (t.closest('a, button, summary')) e.preventDefault();
			const b = blockOf(t);
			if (!b) {
				clearActive();
			} else if (FIELD_TAGS.has(b.tagName.toLowerCase())) {
				activate(b);
			}
		};
		const focusin = (e: Event) => {
			const b = blockOf(e.target);
			if (b) activate(b);
		};
		const input = (e: Event) => {
			const b = blockOf(e.target);
			if (b) commit(b);
		};
		const keydown = (e: KeyboardEvent) => {
			if (!blockOf(e.target)) return;
			if (e.key === 'Enter' && !e.isComposing) {
				// A new line inside the block; new paragraphs are made with Copy.
				e.preventDefault();
				d.execCommand('insertLineBreak');
			} else if (e.key === 'Escape') {
				(e.target as HTMLElement).blur();
				clearActive();
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				openLink();
			}
		};
		const paste = (e: ClipboardEvent) => {
			if (!blockOf(e.target)) return;
			// Pasted formatting would bring styles and classes from wherever it was copied.
			e.preventDefault();
			d.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
		};
		const drop = (e: Event) => e.preventDefault();
		const select = () => syncState();
		const scroll = () => place();

		d.addEventListener('click', click, true);
		d.addEventListener('focusin', focusin);
		d.addEventListener('input', input);
		d.addEventListener('keydown', keydown);
		d.addEventListener('paste', paste);
		d.addEventListener('drop', drop);
		d.addEventListener('selectionchange', select);
		w.addEventListener('scroll', scroll);
		return () => {
			d.removeEventListener('click', click, true);
			d.removeEventListener('focusin', focusin);
			d.removeEventListener('input', input);
			d.removeEventListener('keydown', keydown);
			d.removeEventListener('paste', paste);
			d.removeEventListener('drop', drop);
			d.removeEventListener('selectionchange', select);
			w.removeEventListener('scroll', scroll);
		};
	});

	function clearActive() {
		activeEl?.classList.remove('on');
		active = null;
		activeEl = null;
		linkMode = false;
	}

	function activate(el: HTMLElement) {
		if (activeEl && activeEl !== el) activeEl.classList.remove('on');
		activeEl = el;
		el.classList.add('on');
		const id = Number(el.dataset.ed);
		const tag = el.tagName.toLowerCase();
		if (active?.id !== id) linkMode = false;
		active = { id, tag };
		blockHref = tag === 'a' ? (attrOf(html, id, 'href') ?? '') : '';
		textVal = FIELD_TAGS.has(tag) ? (el.textContent ?? '').trim() : '';
		syncState();
		place();
	}

	/** The toolbar sits just above the block, or just below it when the block is at the top. */
	function place() {
		if (!activeEl || !stage) return;
		const r = activeEl.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		const s = stage.getBoundingClientRect();
		const above = f.top - s.top + r.top - 52;
		pos = {
			top: above < 34 ? f.top - s.top + Math.min(r.bottom, f.height) + 10 : above,
			left: Math.max(0, Math.min(f.left - s.left + r.left, s.width - 440))
		};
	}

	const closestLink = (n: Node | null): HTMLAnchorElement | null =>
		((n?.nodeType === 3 ? n.parentElement : (n as Element | null))?.closest('a') as HTMLAnchorElement | null) ?? null;

	function syncState() {
		if (!loaded || !activeEl) return;
		const d = doc();
		const sel = d.getSelection();
		const inside = !!sel?.anchorNode && activeEl.contains(sel.anchorNode);
		collapsed = !sel || sel.isCollapsed;
		bold = inside && d.queryCommandState('bold');
		italic = inside && d.queryCommandState('italic');
		const a = inside ? closestLink(sel!.anchorNode) : null;
		inLink = !!a && a !== activeEl;
	}

	const ESC = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	/** The block's inner HTML as the source would have it: the site's tags, no editing leftovers. */
	function cleanInner(el: HTMLElement, original: string): string {
		const c = el.cloneNode(true) as HTMLElement;
		for (const n of c.querySelectorAll('*')) {
			n.removeAttribute('data-ed');
			n.removeAttribute('contenteditable');
			n.removeAttribute('spellcheck');
		}
		// execCommand writes <b> and <i>; the pages say <strong> and <em>.
		for (const [from, to] of [['b', 'strong'], ['i', 'em']] as const) {
			for (const n of c.querySelectorAll(from)) {
				const r = c.ownerDocument.createElement(to);
				r.append(...n.childNodes);
				n.replaceWith(r);
			}
		}
		// Chrome wraps stray text in styled spans when lines are joined; unwrap those.
		for (const n of c.querySelectorAll('span[style]:not([class])')) n.replaceWith(...n.childNodes);
		let out = c.innerHTML.replace(/<br>/g, '<br />');
		if (out === '<br />') out = '';
		if (!original.includes('&nbsp;')) out = out.replace(/&nbsp;/g, ' ');
		return out;
	}

	function commit(el: HTMLElement) {
		const id = Number(el.dataset.ed);
		const blocks = scanBlocks(html);
		const b = blocks.find((x) => x.id === id);
		if (!b) return;
		const next = patchInner(html, id, cleanInner(el, html.slice(b.start, b.end)));
		if (next === html) return;
		lastEmitted = next;
		html = next;
		place();
	}

	/* ------------------------------------------------------------ toolbar */

	function fmt(cmd: 'bold' | 'italic') {
		if (!activeEl) return;
		doc().execCommand(cmd);
		commit(activeEl);
		syncState();
	}

	async function openLink() {
		if (!activeEl || FIELD_TAGS.has(activeEl.tagName.toLowerCase()) || active?.tag === 'a') return;
		const sel = doc().getSelection();
		if (!sel || !sel.rangeCount || !activeEl.contains(sel.anchorNode)) return;
		const existing = closestLink(sel.anchorNode);
		if (sel.isCollapsed && !existing) {
			linkHint = 'Select the words you want to link first.';
			setTimeout(() => (linkHint = ''), 2600);
			return;
		}
		savedRange = sel.getRangeAt(0).cloneRange();
		linkUrl = existing?.getAttribute('href') ?? '';
		linkMode = true;
		await tick();
		urlInput?.focus();
		urlInput?.select();
	}

	/** A bare "example.org" would be read as a page on this site; give it a scheme. */
	const normalise = (u: string) => {
		const v = u.trim();
		return /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(v) ? v : v ? `https://${v}` : '';
	};

	function applyLink() {
		if (!activeEl || !savedRange) return;
		const d = doc();
		const sel = d.getSelection()!;
		activeEl.focus();
		sel.removeAllRanges();
		sel.addRange(savedRange);
		const url = normalise(linkUrl);
		const existing = closestLink(sel.anchorNode);
		if (!url) {
			if (existing) d.execCommand('unlink');
		} else if (existing && existing !== activeEl) {
			existing.setAttribute('href', url);
		} else {
			d.execCommand('createLink', false, url);
		}
		linkMode = false;
		commit(activeEl);
		syncState();
	}

	function removeLink() {
		linkUrl = '';
		applyLink();
	}

	function setBlockHref(v: string) {
		if (!active) return;
		blockHref = v;
		const next = patchAttr(html, active.id, 'href', v);
		lastEmitted = next;
		html = next;
		activeEl?.setAttribute('href', v);
	}

	function setBlockText(v: string) {
		if (!active || !activeEl) return;
		textVal = v;
		const next = patchInner(html, active.id, ESC(v));
		lastEmitted = next;
		html = next;
		activeEl.textContent = v;
	}

	function structural(kind: 'copy' | 'delete') {
		if (!active) return;
		const label = blockName(active.tag).toLowerCase();
		undo.push(html);
		if (undo.length > 20) undo.shift();
		html = kind === 'copy' ? duplicateBlock(html, active.id) : removeBlock(html, active.id);
		clearActive();
		toast = { text: kind === 'copy' ? `Copied the ${label} below it. Edit the copy.` : `Removed the ${label}.` };
	}

	function undoStructural() {
		const prev = undo.pop();
		if (prev !== undefined) html = prev;
		toast = null;
		clearActive();
	}
</script>

<div class="stage" bind:this={stage}>
	<div class="hint">
		<span><strong>Click any text to edit it.</strong> Select words for bold, italic or a link. Saved when you press Save.</span>
		<label class="all"><input type="checkbox" bind:checked={showAll} /> Show what I can edit</label>
	</div>

	<iframe
		bind:this={frame}
		title="The page, editable"
		sandbox="allow-same-origin"
	></iframe>

	{#if active}
		<!-- mousedown is held back so the click does not pull focus (and the selection) out of the page. -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="tb" role="group" aria-label="Edit this text" style="top:{pos.top}px;left:{pos.left}px"
			onmousedown={(e) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); }}
		>
			<span class="what">{blockName(active.tag)}</span>

			{#if FIELD_TAGS.has(active.tag)}
				<input class="field" aria-label="Text" value={textVal} oninput={(e) => setBlockText(e.currentTarget.value)} />
			{:else if linkMode}
				<input
					class="field" bind:this={urlInput} bind:value={linkUrl} aria-label="Link address"
					placeholder="https://… or /en/about/"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } else if (e.key === 'Escape') linkMode = false; }}
				/>
				<button type="button" class="go" onclick={applyLink}>Apply</button>
				{#if inLink}<button type="button" onclick={removeLink}>Remove link</button>{/if}
				<button type="button" onclick={() => (linkMode = false)}>Cancel</button>
			{:else}
				<button type="button" class="b" class:on={bold} onclick={() => fmt('bold')} title="Bold (⌘B)" aria-pressed={bold}>B</button>
				<button type="button" class="i" class:on={italic} onclick={() => fmt('italic')} title="Italic (⌘I)" aria-pressed={italic}>I</button>
				{#if active.tag !== 'a'}
					<button type="button" class:on={inLink} onclick={openLink} title="Link (⌘K)">{inLink ? 'Edit link' : 'Link'}</button>
				{:else}
					<input class="field" aria-label="Where this link goes" placeholder="Link address" value={blockHref} oninput={(e) => setBlockHref(e.currentTarget.value)} />
				{/if}
				{#if isRepeatable(active.tag)}
					<span class="sep"></span>
					<button type="button" onclick={() => structural('copy')} title="Put a copy straight after this one">Copy below</button>
					<button type="button" class="del" onclick={() => structural('delete')} title="Remove this {blockName(active.tag).toLowerCase()}">Remove</button>
				{/if}
			{/if}
			{#if linkHint}<span class="tip" role="status">{linkHint}</span>{/if}
		</div>
	{/if}

	{#if toast}
		<div class="toast" role="status">
			{toast.text}
			<button type="button" onclick={undoStructural}>Undo</button>
			<button type="button" class="x" aria-label="Dismiss" onclick={() => (toast = null)}>×</button>
		</div>
	{/if}
</div>

<style>
	.stage { position: relative; display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
	.hint { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 0.55rem 0.9rem; border-radius: 0.65rem; background: var(--info-bg); border: 1px solid var(--info-line); color: var(--info); font-size: 0.86rem; }
	.hint .all { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600; font-size: 0.82rem; color: inherit; }
	iframe { width: 100%; height: 76vh; min-height: 30rem; display: block; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); box-shadow: var(--card-shadow); }

	.tb { position: absolute; z-index: 20; display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.4rem; max-width: calc(100% - 0.5rem); background: var(--foreground); color: var(--background); border-radius: 0.7rem; box-shadow: 0 10px 30px -8px hsl(0 0% 0% / 0.5); font-size: 0.82rem; }
	.what { padding: 0 0.5rem 0 0.35rem; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.65; white-space: nowrap; }
	.tb button { min-width: 2rem; height: 1.95rem; padding: 0 0.6rem; border: 0; border-radius: 0.5rem; background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
	.tb button:hover { background: hsl(0 0% 50% / 0.28); }
	.tb button.on { background: var(--primary); color: var(--primary-foreground); }
	.tb .b { font-weight: 800; }
	.tb .i { font-style: italic; font-family: Georgia, serif; }
	.tb .go { background: var(--primary); color: var(--primary-foreground); }
	.tb .del:hover { background: var(--danger); color: #fff; }
	.sep { width: 1px; height: 1.2rem; background: currentColor; opacity: 0.25; margin: 0 0.15rem; }
	.field { height: 1.95rem; width: min(17rem, 40vw); padding: 0 0.6rem; margin: 0; border: 1px solid hsl(0 0% 50% / 0.5); border-radius: 0.5rem; background: var(--background); color: var(--foreground); font-size: 0.85rem; }
	.tip { padding: 0 0.5rem; color: var(--warn-line); font-weight: 600; white-space: nowrap; }

	.toast { position: absolute; left: 50%; bottom: 1rem; transform: translateX(-50%); z-index: 25; display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.7rem 0.55rem 1rem; background: var(--foreground); color: var(--background); border-radius: 0.7rem; box-shadow: 0 10px 30px -8px hsl(0 0% 0% / 0.5); font-size: 0.86rem; }
	.toast button { border: 0; background: transparent; color: var(--brand-yellow); font: inherit; font-weight: 700; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 0.4rem; }
	.toast button:hover { background: hsl(0 0% 50% / 0.28); }
	.toast .x { color: inherit; opacity: 0.7; font-size: 1.1rem; line-height: 1; }
</style>
