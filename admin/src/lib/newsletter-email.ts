/**
 * Builds the HTML for a newsletter broadcast.
 *
 * Email clients are not browsers: no external stylesheets, no flexbox or grid
 * worth relying on, and Outlook still renders through Word. So this is an
 * inline-styled single-column card laid out in tables (a div cannot be centred
 * reliably in Apple Mail), with the same look as the welcome email.
 *
 * Free of SvelteKit imports so the suite can drive it directly, and kept out
 * of lib/server/ because the newsletter page runs it in the browser too: the
 * live preview beside the form is this function, not a copy of it.
 */

/**
 * The newsletter's languages. The same three as lib/server/langs.ts, repeated
 * because this module also runs in the browser and cannot import from there.
 */
export const NEWSLETTER_LANGS = ['en', 'fr', 'it'] as const;
export type NewsletterLang = (typeof NEWSLETTER_LANGS)[number];
export const LANG_LABEL: Record<NewsletterLang, string> = { en: 'English', fr: 'Français', it: 'Italiano' };

/** The words an email carries that are not the article's: the button and the footer. */
const WORDS: Record<NewsletterLang, { read: string; readText: string; why: (site: string) => string; unsubscribe: string }> = {
	en: { read: 'Read the article', readText: 'Read it', why: (s) => `You are receiving this because you subscribed at ${s}.`, unsubscribe: 'Unsubscribe' },
	fr: { read: "Lire l'article", readText: 'À lire', why: (s) => `Vous recevez ce message parce que vous vous êtes abonné(e) sur ${s}.`, unsubscribe: 'Se désabonner' },
	it: { read: "Leggi l'articolo", readText: 'Da leggere', why: (s) => `Ricevi questo messaggio perché ti sei iscritto/a su ${s}.`, unsubscribe: 'Annulla l’iscrizione' }
};

/** An article's address in a language, as the site serves it. */
export const articleUrl = (siteUrl: string, slug: string, lang: NewsletterLang): string => `${siteUrl}/${lang}/blog/${slug}/`;

export interface BroadcastInput {
	/** What language the email is written in: its button, footer and `lang`. English when not said. */
	lang?: NewsletterLang;
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

/**
 * A broadcast's unsubscribe token only means something to Resend's broadcast
 * sender. For a test email or an on-screen preview, point it somewhere real.
 */
export const forSingleRecipient = (body: string, siteUrl: string): string => body.split(UNSUBSCRIBE_TOKEN).join(siteUrl);

/** Good enough to catch a typo; the provider has the last word. */
export const looksLikeEmail = (s: string): boolean => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);

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
	// CSS variables and most of hsl(). The same card as the welcome and confirmation
	// emails (functions/templates/): a table, because Apple Mail and Outlook ignore
	// `margin: 0 auto` on a div and put an inline image on its own line.
	const ink = '#21242c'; // --foreground
	const muted = '#676f7e'; // --muted-foreground
	const accent = '#943847'; // --primary
	const line = '#e5e0dc'; // --border
	const ground = '#f9f7f5'; // --background
	const card = '#fdfcfc'; // --card
	const tint = '#f2e3e6'; // --accent
	const serif = "Georgia,'Times New Roman',serif";
	const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
	const lang = input.lang ?? 'en';
	const w = WORDS[lang];
	const home = `${input.siteUrl}/${lang}/`;
	const noteStyle = `margin:0 0 12px 0;font-family:${sans};font-size:16px;line-height:26px;color:${ink}`;

	return `<!doctype html>
<html lang="${lang}" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${esc(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${ground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${ground};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${card};border-radius:12px;overflow:hidden;">
  <tr><td style="padding:40px 40px 8px 40px;">
    <a href="${esc(home)}" style="color:${accent};text-decoration:none;font-family:${serif};font-size:18px;font-weight:bold;"><img src="${esc(input.siteUrl)}/img/email/logo.png" width="140" height="72" alt="${esc(input.siteName)}" style="display:block;border:0;width:140px;height:auto;font-family:${serif};font-size:18px;color:${accent};" /></a>
  </td></tr>
${
	input.note
		? `  <tr><td style="padding:16px 40px 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 20px;background-color:${tint};border-left:4px solid ${accent};border-radius:0 8px 8px 0;">${paragraphs(input.note, noteStyle.replace('margin:0 0 12px 0', 'margin:0 0 8px 0'))}</td></tr></table>
  </td></tr>\n`
		: ''
}  <tr><td style="padding:24px 40px 0 40px;">
${
	input.imageUrl
		? `    <a href="${esc(input.url)}"><img src="${esc(input.imageUrl)}" alt="" width="520" style="display:block;border:0;width:100%;max-width:520px;height:auto;border-radius:8px;margin:0 0 24px 0;" /></a>\n`
		: ''
}    <h1 style="margin:0 0 16px 0;font-family:${serif};font-size:30px;line-height:1.2;font-weight:bold;color:${ink};"><a href="${esc(input.url)}" style="color:${ink};text-decoration:none;">${esc(input.title)}</a></h1>
    ${paragraphs(input.intro, `margin:0 0 16px 0;font-family:${sans};font-size:16px;line-height:26px;color:${muted}`)}
  </td></tr>
  <tr><td align="center" style="padding:16px 40px 44px 40px;">
    <a href="${esc(input.url)}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${accent};border-radius:8px;color:#ffffff;text-decoration:none;font-family:${sans};font-size:16px;font-weight:600;line-height:20px;">${esc(w.read)} →</a>
  </td></tr>
  <tr><td align="center" style="padding:28px 40px;background-color:${ground};border-top:1px solid ${line};">
    <p style="margin:0 0 8px 0;font-family:${sans};font-size:13px;line-height:21px;color:${muted};">${esc(w.why(input.siteName))}</p>
    <p style="margin:0;font-family:${sans};font-size:13px;line-height:21px;color:${muted};"><a href="${UNSUBSCRIBE_TOKEN}" style="color:${accent};text-decoration:underline;">${esc(w.unsubscribe)}</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative, for clients that will not render HTML. */
export function buildBroadcastText(input: BroadcastInput): string {
	const w = WORDS[input.lang ?? 'en'];
	// French sets a space before a colon.
	const colon = input.lang === 'fr' ? ' : ' : ': ';
	return [
		input.note?.trim(),
		input.title,
		'',
		input.intro.trim(),
		'',
		`${w.readText}${colon}${input.url}`,
		'',
		w.why(input.siteName),
		`${w.unsubscribe}${colon}${UNSUBSCRIBE_TOKEN}`
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
