// The "we got your message" email sent to someone who used the contact form, in
// the site's three languages: paste each into Resend as contact-form-confirmation-en,
// -fr and -it (Templates -> Create -> HTML).
//
//   node templates/confirmation.js    writes templates/out/confirmation-<lang>.html
//
// Same rules as welcome.js: inline styles, tables, system fonts, nothing from a
// third party. Unlike the welcome it carries Resend variables, in double braces
// (Resend escapes them): {{name}}, {{subject}}, {{message_preview}}.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://lorenzo.loconsole.eu';
const ACCENT = '#943847';

const COPY = {
  en: {
    title: 'Thanks for your message',
    preheader: 'I received your message and will reply personally.',
    hi: 'Hi',
    intro: 'Thank you for getting in touch. Your message reached me, and I will reply personally, usually within a few days.',
    recap: 'What you sent me',
    subject: 'Subject',
    message: 'Message',
    reply: 'There is no need to write again. If you want to add something, just reply to this email.',
    cta: 'Read the blog',
    privacy: 'Privacy policy',
    why: 'You are receiving this because you used the contact form on',
    keep: 'I use your details only to answer you.',
    rights: 'All rights reserved.',
  },
  fr: {
    title: 'Merci pour votre message',
    preheader: 'J’ai bien reçu votre message et je vous répondrai personnellement.',
    hi: 'Bonjour',
    intro: 'Merci de m’avoir écrit. Votre message m’est bien parvenu, et je vous répondrai personnellement, en général sous quelques jours.',
    recap: 'Ce que vous m’avez envoyé',
    subject: 'Sujet',
    message: 'Message',
    reply: 'Inutile de réécrire. Si vous souhaitez ajouter quelque chose, répondez simplement à cet e-mail.',
    cta: 'Lire le blog',
    privacy: 'Politique de confidentialité',
    why: 'Vous recevez ce message parce que vous avez utilisé le formulaire de contact de',
    keep: 'J’utilise vos coordonnées uniquement pour vous répondre.',
    rights: 'Tous droits réservés.',
  },
  it: {
    title: 'Grazie per il tuo messaggio',
    preheader: 'Ho ricevuto il tuo messaggio e ti risponderò di persona.',
    hi: 'Ciao',
    intro: 'Grazie per avermi scritto. Il tuo messaggio mi è arrivato e ti risponderò di persona, di solito entro qualche giorno.',
    recap: 'Cosa mi hai inviato',
    subject: 'Oggetto',
    message: 'Messaggio',
    reply: 'Non serve scrivere di nuovo. Se vuoi aggiungere qualcosa, rispondi semplicemente a questa email.',
    cta: 'Leggi il blog',
    privacy: 'Informativa sulla privacy',
    why: 'Ricevi questo messaggio perché hai usato il modulo di contatto di',
    keep: 'Uso i tuoi dati solo per risponderti.',
    rights: 'Tutti i diritti riservati.',
  },
};

export const LANGS = Object.keys(COPY);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** The whole HTML document for `lang`. */
export function renderConfirmation(lang) {
  const c = COPY[lang];
  if (!c) throw new Error(`no confirmation email in ${lang}`);
  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(c.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f7f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f9f7f5">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f7f5">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#fdfcfc;border-radius:12px;overflow:hidden">
  <tr><td style="padding:40px 40px 8px 40px;font-family:${SERIF}">
    <a href="${SITE}/${lang}/" style="color:${ACCENT};text-decoration:none;font-family:${SERIF};font-size:18px;font-weight:bold"><img src="${SITE}/img/email/logo.png" width="140" height="72" alt="Lorenzo Loconsole" style="display:block;border:0;width:140px;height:auto;font-family:${SERIF};font-size:18px;color:${ACCENT}"></a>
  </td></tr>
  <tr><td style="padding:16px 40px 0 40px">
    <h1 style="margin:0 0 24px 0;font-family:${SERIF};font-size:34px;line-height:1.2;font-weight:bold;color:#21242c">${esc(c.title)}</h1>
    <p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.hi)} {{name}},</p>
    <p style="margin:0 0 24px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.intro)}</p>
    <p style="margin:0 0 12px 0;font-family:${SERIF};font-size:20px;font-weight:bold;color:#21242c">${esc(c.recap)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 20px;background-color:#f2e3e6;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;font-family:${SANS};font-size:15px;line-height:24px;color:#21242c">
      <strong>${esc(c.subject)}.</strong> {{subject}}<br>
      <strong>${esc(c.message)}.</strong> {{message_preview}}
    </td></tr></table>
    <p style="margin:24px 0 0 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.reply)}</p>
  </td></tr>
  <tr><td align="center" style="padding:32px 40px 44px 40px">
    <a href="${SITE}/${lang}/blog/" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${ACCENT};border-radius:8px;color:#ffffff;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:600;line-height:20px">${esc(c.cta)} →</a>
  </td></tr>
  <tr><td align="center" style="padding:28px 40px;background-color:#f9f7f5;border-top:1px solid #e5e0dc">
    <p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:21px;color:#676f7e">${esc(c.why)} <a href="${SITE}/${lang}/" style="color:${ACCENT};text-decoration:none">lorenzo.loconsole.eu</a>. ${esc(c.keep)}</p>
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:21px;color:#676f7e"><a href="${SITE}/${lang}/privacy-policy/" style="color:${ACCENT};text-decoration:none">${esc(c.privacy)}</a> · © Lorenzo Loconsole. ${esc(c.rights)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].split(path.sep).map(encodeURIComponent).join('/')}`).href) {
  const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/%20/g, ' ')), 'out');
  fs.mkdirSync(out, { recursive: true });
  for (const lang of LANGS) {
    fs.writeFileSync(path.join(out, `confirmation-${lang}.html`), renderConfirmation(lang));
    console.log(`templates/out/confirmation-${lang}.html`);
  }
}
