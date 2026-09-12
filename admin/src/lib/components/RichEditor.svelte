<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { keymap } from 'prosemirror-keymap';
	import { baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode } from 'prosemirror-commands';
	import { history, undo, redo } from 'prosemirror-history';
	import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, ellipsis } from 'prosemirror-inputrules';
	import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
	import { schema, parseMarkdown, serializeMarkdown } from '$lib/editor/markdown';
	import type { Node as PMNode } from 'prosemirror-model';

	/**
	 * Writing surface for an article: what you see is the article, not its
	 * Markdown. Markdown remains what gets committed — see lib/editor/markdown.ts
	 * for how the round trip is kept honest against the existing corpus.
	 */
	let {
		value = $bindable(''),
		imageUrl,
		onInsertImage,
		placeholder = 'Start writing…'
	}: {
		value: string;
		/** Turns a bundle file name into something the browser can display. */
		imageUrl: (src: string) => string;
		/** Opens the article's image picker; resolves to a file name, or null. */
		onInsertImage?: () => Promise<{ src: string; alt: string } | null>;
		placeholder?: string;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let view: EditorView | null = null;
	/** The Markdown this editor last produced, to tell its own output from a change made elsewhere. */
	let mine = '';
	/** The body as it arrived, so untouched whitespace is written back exactly. */
	let original = '';
	let active = $state({ strong: false, em: false, link: false, h2: false, h3: false, bullet: false, ordered: false, quote: false, code: false });

	const mark = (name: keyof typeof schema.marks) => schema.marks[name];

	function refreshActive() {
		if (!view) return;
		const { state } = view;
		const sel = state.selection;
		// `$from` cannot be destructured here: Svelte reserves the $ prefix.
		const at = sel.$from;
		const has = (m: (typeof schema.marks)[string]) =>
			sel.empty ? !!m.isInSet(state.storedMarks || at.marks()) : state.doc.rangeHasMark(sel.from, sel.to, m);
		const parent = at.node(at.depth);
		const wrapper = at.depth > 0 ? at.node(at.depth - 1) : null;
		const grandparent = at.depth > 1 ? at.node(at.depth - 2) : null;
		const inList = wrapper?.type === schema.nodes.list_item;
		active = {
			strong: has(mark('strong')),
			em: has(mark('em')),
			code: has(mark('code')),
			link: has(mark('link')),
			h2: parent.type === schema.nodes.heading && parent.attrs.level === 2,
			h3: parent.type === schema.nodes.heading && parent.attrs.level === 3,
			bullet: inList && grandparent?.type === schema.nodes.bullet_list,
			ordered: inList && grandparent?.type === schema.nodes.ordered_list,
			quote: wrapper?.type === schema.nodes.blockquote
		};
	}

	/** An image shows as the picture it is, with its alt text underneath. */
	class ImageView {
		dom: HTMLElement;
		constructor(node: PMNode) {
			const figure = document.createElement('figure');
			figure.className = 'pm-image';
			const img = document.createElement('img');
			img.src = imageUrl(node.attrs.src);
			img.alt = node.attrs.alt ?? '';
			const caption = document.createElement('figcaption');
			caption.textContent = node.attrs.alt || 'No description — add one for screen readers';
			caption.className = node.attrs.alt ? '' : 'missing';
			figure.append(img, caption);
			this.dom = figure;
		}
		// The picture is not editable text; selection and deletion still work.
		stopEvent() { return false; }
		ignoreMutation() { return true; }
	}

	function buildRules() {
		const rules = [
			...smartQuotes,
			ellipsis,
			// Typing Markdown still works, it just turns into formatting as you go.
			wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
			wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list),
			wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
			textblockTypeInputRule(/^(#{1,4})\s$/, schema.nodes.heading, (m) => ({ level: m[1].length }))
		];
		return inputRules({ rules });
	}

	function setLink() {
		if (!view) return;
		const { state, dispatch } = view;
		if (active.link) return toggleMark(mark('link'))(state, dispatch);
		const href = window.prompt('Link to', 'https://');
		if (!href) return;
		toggleMark(mark('link'), { href, title: null })(state, dispatch);
		view.focus();
	}

	async function insertImage() {
		if (!view || !onInsertImage) return;
		const picked = await onInsertImage();
		if (!picked) return;
		insert(picked.src, picked.alt);
	}

	/** Inserts an image without going through the picker (used by the images panel). */
	export function insert(src: string, alt: string) {
		if (!view) return;
		const { state } = view;
		const image = schema.nodes.image.create({ src, alt, title: null });
		// An image is an inline node, so dropping it at the cursor would tuck it
		// into the sentence you are standing in. In an article it is its own
		// block, unless the block you are in is empty and can simply hold it.
		const atEmptyBlock = state.selection.empty && state.selection.$from.parent.content.size === 0;
		const node = atEmptyBlock ? image : schema.nodes.paragraph.create(null, image);
		view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
		view.focus();
	}

	function command(fn: (s: EditorState, d?: (t: Transaction) => void) => boolean) {
		return () => {
			if (!view) return;
			fn(view.state, view.dispatch);
			view.focus();
		};
	}

	const toggleHeading = (level: number) => () => {
		if (!view) return;
		const on = level === 2 ? active.h2 : active.h3;
		const type = on ? schema.nodes.paragraph : schema.nodes.heading;
		setBlockType(type, on ? {} : { level })(view.state, view.dispatch);
		view.focus();
	};

	onMount(() => {
		original = value;
		const state = EditorState.create({
			doc: parseMarkdown(value),
			plugins: [
				history(),
				buildRules(),
				keymap({
					'Mod-b': toggleMark(mark('strong')),
					'Mod-i': toggleMark(mark('em')),
					'Mod-k': () => (setLink(), true),
					'Mod-z': undo,
					'Shift-Mod-z': redo,
					'Mod-y': redo,
					Enter: splitListItem(schema.nodes.list_item),
					Tab: sinkListItem(schema.nodes.list_item),
					'Shift-Tab': liftListItem(schema.nodes.list_item),
					'Shift-Enter': chainCommands(exitCode, (state, dispatch) => {
						dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
						return true;
					})
				}),
				keymap(baseKeymap)
			]
		});

		view = new EditorView(host, {
			state,
			nodeViews: { image: (node) => new ImageView(node) },
			attributes: { class: 'pm', 'aria-label': 'Article body' },
			dispatchTransaction(tr) {
				if (!view) return;
				view.updateState(view.state.apply(tr));
				refreshActive();
				if (!tr.docChanged) return;
				mine = serializeMarkdown(view.state.doc, original);
				value = mine;
			}
		});
		refreshActive();
	});

	// Changed from outside — a restored draft, or DeepL filling the pane.
	$effect(() => {
		const incoming = value;
		if (!view || incoming === mine) return;
		original = incoming;
		mine = incoming;
		const state = EditorState.create({ doc: parseMarkdown(incoming), plugins: view.state.plugins });
		view.updateState(state);
	});

	onDestroy(() => view?.destroy());

	const empty = $derived(value.trim() === '');
</script>

<div class="editor">
	<div class="tools" role="toolbar" aria-label="Formatting">
		<button type="button" class:on={active.h2} onclick={toggleHeading(2)} title="Heading">H2</button>
		<button type="button" class:on={active.h3} onclick={toggleHeading(3)} title="Smaller heading">H3</button>
		<span class="sep"></span>
		<button type="button" class:on={active.strong} onclick={command(toggleMark(mark('strong')))} title="Bold (⌘B)"><b>B</b></button>
		<button type="button" class:on={active.em} onclick={command(toggleMark(mark('em')))} title="Italic (⌘I)"><i>I</i></button>
		<button type="button" class:on={active.link} onclick={setLink} title="Link (⌘K)">Link</button>
		<button type="button" class:on={active.code} onclick={command(toggleMark(mark('code')))} title="Code">{'</>'}</button>
		<span class="sep"></span>
		<button type="button" class:on={active.bullet} onclick={command(wrapInList(schema.nodes.bullet_list))} title="Bulleted list">• List</button>
		<button type="button" class:on={active.ordered} onclick={command(wrapInList(schema.nodes.ordered_list))} title="Numbered list">1. List</button>
		<button type="button" class:on={active.quote} onclick={command(wrapIn(schema.nodes.blockquote))} title="Quote">❝</button>
		{#if onInsertImage}
			<span class="sep"></span>
			<button type="button" onclick={insertImage} title="Insert an image">Image</button>
		{/if}
		<span class="spacer"></span>
		<button type="button" onclick={command(undo)} title="Undo (⌘Z)">↶</button>
		<button type="button" onclick={command(redo)} title="Redo (⇧⌘Z)">↷</button>
	</div>
	<div class="surface" class:empty bind:this={host} data-placeholder={placeholder}></div>
</div>

<style>
	.editor { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; }
	.tools { display: flex; align-items: center; gap: 0.15rem; padding: 0.35rem 0.4rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; background: color-mix(in srgb, var(--muted) 45%, transparent); }
	.tools button { background: none; border: 0; border-radius: 6px; padding: 0.3rem 0.5rem; font-size: 0.82rem; color: var(--muted-foreground); cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; line-height: 1; }
	.tools button:hover { background: var(--card); color: var(--foreground); }
	.tools button.on { background: var(--primary); color: var(--primary-foreground); }
	.sep { width: 1px; height: 1.1rem; background: var(--border); margin: 0 0.25rem; }
	.spacer { flex: 1; }
	.surface { padding: 1.1rem 1.25rem; min-height: 24rem; max-height: 70vh; overflow-y: auto; }
	.surface.empty::before { content: attr(data-placeholder); color: var(--muted-foreground); position: absolute; pointer-events: none; }

	/* The writing surface itself: close to the published article, without
	   pretending to be it — the preview pane is still the accurate view. */
	.surface :global(.pm) { outline: none; font-size: 1.02rem; line-height: 1.7; max-width: 38rem; }
	.surface :global(.pm p) { margin: 0 0 1.1em; }
	.surface :global(.pm h1), .surface :global(.pm h2), .surface :global(.pm h3), .surface :global(.pm h4) {
		font-family: Fraunces, Georgia, serif; line-height: 1.25; margin: 1.6em 0 0.5em; letter-spacing: -0.01em;
	}
	.surface :global(.pm h2) { font-size: 1.45rem; }
	.surface :global(.pm h3) { font-size: 1.2rem; }
	.surface :global(.pm a) { color: var(--primary); }
	.surface :global(.pm code) { font-family: ui-monospace, monospace; font-size: 0.88em; background: var(--muted); padding: 0.1em 0.3em; border-radius: 4px; }
	.surface :global(.pm blockquote) { margin: 0 0 1.1em; padding-left: 1rem; border-left: 3px solid var(--border); color: var(--muted-foreground); }
	.surface :global(.pm ul), .surface :global(.pm ol) { margin: 0 0 1.1em; padding-left: 1.4rem; }
	.surface :global(.pm li) { margin-bottom: 0.3em; }
	.surface :global(.pm-image) { margin: 1.4em 0; }
	.surface :global(.pm-image img) { display: block; width: 100%; border-radius: 10px; background: var(--muted); }
	.surface :global(.pm-image figcaption) { font-size: 0.8rem; color: var(--muted-foreground); margin-top: 0.4rem; }
	.surface :global(.pm-image figcaption.missing) { color: var(--warn); }
	.surface :global(.ProseMirror-selectednode) { outline: 2px solid var(--primary); border-radius: 10px; }
</style>
