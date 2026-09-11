/**
 * Renders an article's Markdown for the editor's live preview.
 *
 * The goal is to show the article as the site will, so the HTML is wrapped in
 * the site's own markup (.post-body, .post-title) and styled by the site's own
 * stylesheet. It is still approximate: Hugo renders with goldmark plus its
 * image render hook, and this uses marked — close for prose, not identical for
 * every edge case.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */
import { Marked, type Tokens } from 'marked';

export interface PreviewContext {
	slug: string;
	/** Absolute URL of the live site, for resolving root-relative links. */
	siteUrl: string;
	/** Images staged in the browser but not yet committed: filename -> blob URL. */
	pending?: Record<string, string>;
}

const isAbsolute = (u: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u);
const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Where a bundle-relative image actually lives from the portal's point of
 * view: a just-staged upload, or a committed file served by the preview API.
 */
export function resolveImage(src: string, ctx: PreviewContext): string {
	if (isAbsolute(src) || src.startsWith('data:')) return src;
	if (src.startsWith('/')) return `${ctx.siteUrl}${src}`;
	const file = src.split(/[?#]/)[0];
	if (ctx.pending?.[file]) return ctx.pending[file];
	return `/api/image/${encodeURIComponent(ctx.slug)}/${encodeURIComponent(file)}`;
}

/** Root-relative links point at the live site; the preview has no pages of its own. */
export function resolveLink(href: string, ctx: PreviewContext): string {
	if (href.startsWith('/')) return `${ctx.siteUrl}${href}`;
	return href;
}

export function renderMarkdown(markdown: string, ctx: PreviewContext): string {
	const marked = new Marked({ gfm: true, breaks: false });
	marked.use({
		renderer: {
			image({ href, title, text }: Tokens.Image) {
				const t = title ? ` title="${esc(title)}"` : '';
				// A missing alt is exactly what the pre-publish check flags; make it
				// visible here too, so the gap is noticed while writing.
				const flag = text.trim() ? '' : ' data-missing-alt';
				return `<img src="${esc(resolveImage(href, ctx))}" alt="${esc(text)}"${t}${flag} loading="lazy" />`;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const inner = this.parser.parseInline(tokens);
				const t = title ? ` title="${esc(title)}"` : '';
				return `<a href="${esc(resolveLink(href, ctx))}"${t} target="_blank" rel="noopener noreferrer">${inner}</a>`;
			}
		}
	});
	let html = marked.parse(markdown, { async: false }) as string;
	// The site allows raw HTML in articles (goldmark unsafe: true), so images
	// written as <img src="…"> need resolving too.
	html = html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/gi, (m, a, src, b) =>
		m.includes('data-missing-alt') || isAbsolute(src) || src.startsWith('blob:') || src.startsWith('/api/image/')
			? m
			: `${a}${esc(resolveImage(src, ctx))}${b}`
	);
	return html;
}

export interface PreviewDocInput {
	html: string;
	title: string;
	date: string;
	category: string;
	siteCss: string;
	theme: 'light' | 'dark';
	lang: string;
}

/**
 * A complete document for the preview iframe. It is rendered with
 * sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" and
 * deliberately WITHOUT allow-scripts: articles may contain raw HTML, and with
 * scripting disabled nothing in them can run — not even inline handlers.
 * allow-same-origin is safe on its own; only combined with allow-scripts would
 * it let content reach the portal.
 */
export function buildPreviewDoc(d: PreviewDocInput): string {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date)
		? new Date(`${d.date}T00:00:00Z`).toLocaleDateString(d.lang, {
				day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
			})
		: '';
	return `<!doctype html>
<html lang="${esc(d.lang)}" data-theme="${d.theme}">
<head><meta charset="utf-8" />
<style>${d.siteCss}</style>
<style>
  body { margin: 0; }
  .pv-head { max-width: 52rem; margin: 2.25rem auto 0; padding: 0 2rem; }
  .pv-meta { display: flex; gap: .6rem; align-items: center; font-size: .82rem; color: var(--muted-foreground); margin-bottom: .75rem; }
  .post-body { margin-top: 1.5rem; }
  img[data-missing-alt] { outline: 3px dashed hsl(4 66% 44%); outline-offset: 3px; }
</style>
</head>
<body>
  <header class="pv-head">
    <div class="pv-meta">${d.category ? `<span class="category-badge">${esc(d.category)}</span>` : ''}${date ? `<span>${esc(date)}</span>` : ''}</div>
    <h1 class="post-title">${esc(d.title || 'Untitled')}</h1>
  </header>
  <article class="post-body">${d.html}</article>
</body>
</html>`;
}
