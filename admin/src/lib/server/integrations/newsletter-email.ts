/**
 * Builds the HTML for a newsletter broadcast.
 *
 * Email clients are not browsers: no external stylesheets, no flexbox or grid
 * worth relying on, and Outlook still renders through Word. So this is a
 * table-free, inline-styled, single-column layout with generous fallbacks
 * rather than anything clever.
 *
 * Free of SvelteKit imports so the suite can drive it directly.
 */

export interface BroadcastInput {
	/** Article title, used as the headline. */
	title: string;
	/** The article's own description, or whatever the author rewrote. */
	intro: string;
	url: string;
	/** Absolute URL of the featured image, when the article has one. */
	imageUrl?: string;
	/** Free text above the article card. Optional. */
	note?: string;
	siteName: string;
	siteUrl: string;
}

/** Resend rejects a broadcast whose body lacks this token. */
export const UNSUBSCRIBE_TOKEN = '{{{RESEND_UNSUBSCRIBE_URL}}}';

const esc = (s: string) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** Paragraph breaks only — this is an announcement, not a rich-text document. */
function paragraphs(text: string, style: string): string {
	return text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p style="${style}">${esc(p).replace(/\n/g, '<br />')}</p>`)
		.join('\n');
}

export function buildBroadcastHtml(input: BroadcastInput): string {
	// The site's tokens (static/css/main.css), as hex: email clients ignore
	// CSS variables and most of hsl().
	const ink = '#202429'; // --foreground
	const muted = '#676f7e'; // --muted-foreground
	const accent = '#943847'; // --primary
	const line = '#e5e0dc'; // --border
	const ground = '#f9f7f5'; // --background
	const serif = "Fraunces,Georgia,'Times New Roman',serif";
	const body = `margin:0 0 1em;font-size:16px;line-height:1.6;color:${ink}`;

	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${ground};">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

    <a href="${esc(input.siteUrl)}" style="text-decoration:none;color:${accent};font-family:${serif};font-weight:600;font-size:17px;">${esc(input.siteName)}</a>

    ${input.note ? `<div style="margin-top:24px;">${paragraphs(input.note, body)}</div>` : ''}

    <div style="margin-top:24px;padding-top:24px;border-top:1px solid ${line};">
      ${
				input.imageUrl
					? `<a href="${esc(input.url)}"><img src="${esc(input.imageUrl)}" alt="" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;display:block;margin-bottom:20px;" /></a>`
					: ''
			}
      <h1 style="margin:0 0 12px;font-family:${serif};font-size:26px;font-weight:600;line-height:1.25;color:${ink};">
        <a href="${esc(input.url)}" style="color:${ink};text-decoration:none;">${esc(input.title)}</a>
      </h1>
      ${paragraphs(input.intro, `margin:0 0 20px;font-size:16px;line-height:1.6;color:${muted}`)}
      <a href="${esc(input.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">Read the article</a>
    </div>

    <div style="margin-top:36px;padding-top:20px;border-top:1px solid ${line};font-size:13px;line-height:1.6;color:${muted};">
      <p style="margin:0 0 8px;">You are receiving this because you subscribed at ${esc(input.siteName)}.</p>
      <p style="margin:0;"><a href="${UNSUBSCRIBE_TOKEN}" style="color:${muted};">Unsubscribe</a></p>
    </div>

  </div>
</body>
</html>`;
}

/** Plain-text alternative, for clients that will not render HTML. */
export function buildBroadcastText(input: BroadcastInput): string {
	return [
		input.note?.trim(),
		input.title,
		'',
		input.intro.trim(),
		'',
		`Read it: ${input.url}`,
		'',
		`You are receiving this because you subscribed at ${input.siteName}.`,
		`Unsubscribe: ${UNSUBSCRIBE_TOKEN}`
	]
		.filter((l) => l !== undefined)
		.join('\n');
}

export interface BroadcastValidation {
	ok: boolean;
	errors: string[];
	warnings: string[];
}

/** Catches what Resend would reject, plus what readers would notice. */
export function validateBroadcast(input: {
	subject: string;
	title: string;
	intro: string;
	url: string;
	html: string;
}): BroadcastValidation {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!input.subject.trim()) errors.push('Subject is required.');
	else if (input.subject.length > 100) {
		warnings.push(`Subject is ${input.subject.length} characters; inboxes truncate around 60.`);
	}
	if (!input.title.trim()) errors.push('The article headline is empty.');
	if (!input.intro.trim()) errors.push('The intro text is empty.');
	if (!/^https?:\/\//.test(input.url)) errors.push('The article URL must be absolute.');

	// Resend rejects a broadcast with no unsubscribe link, and it is a legal
	// requirement in the EU besides.
	if (!input.html.includes(UNSUBSCRIBE_TOKEN)) {
		errors.push('The unsubscribe link is missing — Resend will reject this.');
	}
	if (/localhost|127\.0\.0\.1/.test(input.url)) {
		errors.push('The article URL points at localhost.');
	}
	return { ok: errors.length === 0, errors, warnings };
}
