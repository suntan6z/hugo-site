/**
 * The image an article is shown with: its featured_image, else the first image
 * in its body.
 *
 * The site decides this in layouts/partials/resolve-thumb.html for the homepage,
 * the blog listing and social cards. This is the same rule for the portal: the
 * editor marks that image, and a newsletter carries the picture the site shows.
 *
 * Pure, and outside lib/server because the editor runs it in the browser. It reads Markdown rather than rendered HTML, so it recognises both forms
 * a body can hold an image in: Markdown images and raw <img> tags.
 */

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const HTML_IMAGE = /<img\b[^>]*\ssrc=["']([^"']+)["']/i;

export function thumbnailOf(featured: string | undefined, body: string): string | undefined {
	if (featured) return featured;
	const md = MARKDOWN_IMAGE.exec(body);
	const html = HTML_IMAGE.exec(body);
	const first = md && html ? (md.index < html.index ? md : html) : (md ?? html);
	return first?.[1];
}

/** An absolute URL, as an email needs. Bundle files resolve against the English article. */
export function thumbnailUrl(siteUrl: string, slug: string, src: string): string {
	if (/^https?:\/\//i.test(src)) return src;
	if (src.startsWith('//')) return `https:${src}`;
	if (src.startsWith('/')) return `${siteUrl}${src}`;
	return `${siteUrl}/en/blog/${slug}/${src}`;
}
