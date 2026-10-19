// The email that asks a newsletter subscriber to confirm their address, in the
// site's three languages: paste each into Resend as newsletter-confirm-en, -fr
// and -it (Templates -> Create -> HTML), with the subject of your choice.
//
//   node templates/confirm.js    writes templates/out/confirm-<lang>.html
//
// Same rules as welcome.js: inline styles, tables, system fonts, nothing from a
// third party. It has one Resend variable, the signed link, in triple braces
// (raw, never escaped): {{{confirm_url}}}. newsletter.js sends it; if Resend
// refuses the template it falls back to lib/confirm-email.js, so a missing
// template can never stop someone subscribing.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://lorenzo.loconsole.eu';
const ACCENT = '#943847';

const COPY = {
  en: {
    title: 'Please confirm your subscription',
    preheader: 'One click and you are on the list.',
    hello: 'Hello,',
    ask: 'Someone, hopefully you, asked to receive my newsletter at this address. To confirm, please use the button below.',
    button: 'Confirm my subscription',
    paste: 'If the button does not work, copy this link into your browser:',
    note: "The link works for 48 hours. If you didn't ask for this, ignore this email: nothing happens and your address is not added to the list.",
    sign: 'Lorenzo',
    why: 'You are receiving this because this address was entered on',
    privacy: 'Privacy policy',
    rights: 'All rights reserved.',
  },
  fr: {
    title: 'Confirmez votre inscription',
    preheader: 'Un clic et vous êtes inscrit(e).',
    hello: 'Bonjour,',
    ask: "Quelqu'un, j'espère vous, a demandé à recevoir ma newsletter à cette adresse. Pour confirmer, utilisez le bouton ci-dessous.",
    button: 'Confirmer mon inscription',
    paste: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    note: "Le lien est valable 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne se passe et votre adresse n'est pas ajoutée à la liste.",
    sign: 'Lorenzo',
    why: 'Vous recevez ce message parce que cette adresse a été saisie sur',
    privacy: 'Politique de confidentialité',
    rights: 'Tous droits réservés.',
  },
  it: {
    title: 'Conferma la tua iscrizione',
    preheader: 'Un clic e sei nella lista.',
    hello: 'Ciao,',
    ask: 'Qualcuno, spero tu, ha chiesto di ricevere la mia newsletter a questo indirizzo. Per confermare, usa il pulsante qui sotto.',
    button: 'Conferma la mia iscrizione',
    paste: 'Se il pulsante non funziona, copia questo link nel browser:',
    note: "Il link è valido per 48 ore. Se non l'hai richiesto tu, ignora questa email: non succede nulla e il tuo indirizzo non viene aggiunto alla lista.",
    sign: 'Lorenzo',
    why: 'Ricevi questo messaggio perché questo indirizzo è stato inserito su',
    privacy: 'Informativa sulla privacy',
    rights: 'Tutti i diritti riservati.',
  },
};

export const LANGS = Object.keys(COPY);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** The whole HTML document for `lang`. */
export function renderConfirm(lang) {
  const c = COPY[lang];
  if (!c) throw new Error(`no confirm email in ${lang}`);
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
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#fdfcfc;border-radius:12px;overflow:hidden">
  <tr><td style="padding:40px 40px 8px 40px;font-family:${SERIF}">
    <a href="${SITE}/${lang}/" style="color:${ACCENT};text-decoration:none;font-family:${SERIF};font-size:18px;font-weight:bold"><img src="${SITE}/img/email/logo.png" width="140" height="72" alt="Lorenzo Loconsole" style="display:block;border:0;width:140px;height:auto;font-family:${SERIF};font-size:18px;color:${ACCENT}"></a>
  </td></tr>
  <tr><td style="padding:16px 40px 0 40px">
    <h1 style="margin:0 0 24px 0;font-family:${SERIF};font-size:34px;line-height:1.2;font-weight:bold;color:#21242c">${esc(c.title)}</h1>
    <p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.hello)}</p>
    <p style="margin:0 0 8px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.ask)}</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 40px 8px 40px">
    <a href="{{{confirm_url}}}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${ACCENT};border-radius:8px;color:#ffffff;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:600;line-height:20px">${esc(c.button)}</a>
  </td></tr>
  <tr><td style="padding:16px 40px 40px 40px">
    <p style="margin:0 0 6px 0;font-family:${SANS};font-size:13px;line-height:20px;color:#676f7e">${esc(c.paste)}</p>
    <p style="margin:0 0 24px 0;font-family:${SANS};font-size:13px;line-height:20px;word-break:break-all"><a href="{{{confirm_url}}}" style="color:${ACCENT}">{{{confirm_url}}}</a></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:14px 18px;background-color:#f2e3e6;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;font-family:${SANS};font-size:14px;line-height:22px;color:#21242c">${esc(c.note)}</td></tr></table>
    <p style="margin:24px 0 0 0;font-family:${SERIF};font-size:18px;color:#21242c">${esc(c.sign)}</p>
  </td></tr>
  <tr><td align="center" style="padding:28px 40px;background-color:#f9f7f5;border-top:1px solid #e5e0dc">
    <p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:21px;color:#676f7e">${esc(c.why)} <a href="${SITE}/${lang}/" style="color:${ACCENT};text-decoration:none">lorenzo.loconsole.eu</a>.</p>
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
    fs.writeFileSync(path.join(out, `confirm-${lang}.html`), renderConfirm(lang));
    console.log(`templates/out/confirm-${lang}.html`);
  }
}
