// The welcome email, in the site's three languages: one template to paste into
// Resend as newsletter-welcome-en, -fr and -it (Templates -> Create -> HTML).
//
//   node templates/welcome.js        writes templates/out/welcome-<lang>.html
//
// Email clients ignore most <style> blocks and every web font, so everything is
// inline, laid out in tables, in a Georgia serif stack; nothing is loaded from a
// third party. The logo and the three icons are PNGs on the site (static/img/email/), because
// Gmail and Outlook do not draw SVG; each button also carries its label, so it
// still works when images are blocked. It has no unsubscribe link of its own: a
// welcome is a one-to-one message, and Resend gives a link only to broadcasts.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://lorenzo.loconsole.eu';
// The site's own tokens (static/css/main.css, as hex because email clients ignore hsl and variables):
// primary #943847, background #f9f7f5, card #fdfcfc, foreground #21242c, muted text #676f7e,
// border #e5e0dc, accent #f2e3e6. The newsletter builder in the portal uses the same.
const ACCENT = '#943847';

const SOCIALS = [
  { key: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/lloconsole/' },
  { key: 'mastodon', label: 'Mastodon', href: 'https://c.im/@lv' },
  { key: 'github', label: 'GitHub', href: 'https://github.com/suntan6z' },
];

const COPY = {
  en: {
    languageName: 'English',
    title: 'Welcome to my newsletter',
    preheader: 'Thanks for subscribing. Here is what to expect.',
    hi: 'Hi,',
    intro: 'Thank you for subscribing! I write about technology and digital sovereignty, cybersecurity and privacy, the European projects I take part in, and now and then something more personal.',
    note: "You'll receive the articles in English. Reply to this email if you'd rather read them in another language.",
    expect: 'What to expect',
    items: [
      ['🔒', 'Cybersecurity and privacy, in plain words'],
      ['🇪🇺', 'EU-based tools and digital sovereignty'],
      ['🌍', 'Erasmus+ and European projects'],
      ['✍️', 'Personal stories, now and then'],
    ],
    cadence: 'I write when I have something worth saying, not on a schedule. Quality over quantity.',
    cta: 'Read the latest articles',
    connect: "Let's connect",
    why: "You're receiving this because you subscribed at",
    unsubscribe: 'You can unsubscribe at any time with the link at the bottom of every issue.',
    privacy: 'Privacy policy',
    rights: 'All rights reserved.',
  },
  fr: {
    languageName: 'Français',
    title: 'Bienvenue dans ma newsletter',
    preheader: "Merci pour votre inscription. Voici à quoi vous attendre.",
    hi: 'Bonjour,',
    intro: "Merci de vous être abonné(e) ! J'écris sur la technologie et la souveraineté numérique, la cybersécurité et la vie privée, les projets européens auxquels je participe, et de temps en temps sur quelque chose de plus personnel.",
    note: "Vous recevrez les articles en français. Répondez à cet e-mail si vous préférez les lire dans une autre langue.",
    expect: "À quoi s'attendre",
    items: [
      ['🔒', 'Cybersécurité et vie privée, en termes simples'],
      ['🇪🇺', 'Outils européens et souveraineté numérique'],
      ['🌍', 'Erasmus+ et projets européens'],
      ['✍️', 'Des histoires personnelles, de temps en temps'],
    ],
    cadence: "J'écris quand j'ai quelque chose qui vaut la peine d'être dit, pas selon un calendrier. La qualité plutôt que la quantité.",
    cta: 'Lire les derniers articles',
    connect: 'Restons en contact',
    why: 'Vous recevez ce message parce que vous vous êtes abonné(e) sur',
    unsubscribe: 'Vous pouvez vous désabonner à tout moment avec le lien en bas de chaque numéro.',
    privacy: 'Politique de confidentialité',
    rights: 'Tous droits réservés.',
  },
  it: {
    languageName: 'Italiano',
    title: 'Benvenuto nella mia newsletter',
    preheader: 'Grazie per esserti iscritto. Ecco cosa aspettarti.',
    hi: 'Ciao,',
    intro: "Grazie per esserti iscritto/a! Scrivo di tecnologia e sovranità digitale, di cybersicurezza e privacy, dei progetti europei a cui partecipo e, ogni tanto, di qualcosa di più personale.",
    note: "Riceverai gli articoli in italiano. Rispondi a questa email se preferisci leggerli in un'altra lingua.",
    expect: 'Cosa aspettarti',
    items: [
      ['🔒', 'Cybersicurezza e privacy, in parole semplici'],
      ['🇪🇺', 'Strumenti europei e sovranità digitale'],
      ['🌍', 'Erasmus+ e progetti europei'],
      ['✍️', 'Storie personali, ogni tanto'],
    ],
    cadence: "Scrivo quando ho qualcosa che vale la pena dire, non secondo un calendario. Qualità più che quantità.",
    cta: 'Leggi gli ultimi articoli',
    connect: 'Restiamo in contatto',
    why: 'Ricevi questo messaggio perché ti sei iscritto/a su',
    unsubscribe: 'Puoi annullare l’iscrizione in qualsiasi momento con il link in fondo a ogni numero.',
    privacy: 'Informativa sulla privacy',
    rights: 'Tutti i diritti riservati.',
  },
};

export const LANGS = Object.keys(COPY);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** The whole HTML document for `lang`. */
export function renderWelcome(lang) {
  const c = COPY[lang];
  if (!c) throw new Error(`no welcome email in ${lang}`);
  const blog = `${SITE}/${lang}/blog/`;
  const items = c.items
    .map(([icon, text]) => `<tr><td width="30" valign="top" style="padding:0 0 10px 0;font-size:18px;line-height:24px">${icon}</td><td valign="top" style="padding:0 0 10px 0;font-family:${SANS};font-size:16px;line-height:24px;color:#21242c">${esc(text)}</td></tr>`)
    .join('');
  // Each button is a small table (icon cell, label cell): Apple Mail and Outlook put an
  // inline image on a line of its own, so "icon beside text" has to be a layout, not a style.
  const socials = `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>${SOCIALS.map(
    (s) =>
      `<td class="soc" style="padding:4px"><a href="${s.href}" target="_blank" rel="noopener noreferrer" style="display:block;background-color:#a45663;border-radius:8px;text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td valign="middle" style="padding:9px 0 9px 12px"><img src="${SITE}/img/email/${s.key}.png" width="20" height="20" alt="" style="display:block;border:0"></td><td valign="middle" style="padding:9px 14px 9px 8px;font-family:${SANS};font-size:14px;font-weight:600;line-height:20px;color:#ffffff">${s.label}</td></tr></table></a></td>`
  ).join('')}</tr></table>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(c.title)}</title>
<style>@media (max-width:480px){.soc{display:block !important;width:100% !important;padding:4px 0 !important} }</style>
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
    <h1 style="margin:0 0 24px 0;font-family:${SERIF};font-size:34px;line-height:1.2;font-weight:bold;color:#21242c">${esc(c.title)} 👋</h1>
    <p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.hi)}</p>
    <p style="margin:0 0 24px 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 20px;background-color:#f2e3e6;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;font-family:${SANS};font-size:15px;line-height:24px;color:#21242c"><strong>${esc(c.languageName)}.</strong> ${esc(c.note)}</td></tr></table>
    <p style="margin:28px 0 12px 0;font-family:${SERIF};font-size:20px;font-weight:bold;color:#21242c">${esc(c.expect)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">${items}</table>
    <p style="margin:8px 0 0 0;font-family:${SANS};font-size:16px;line-height:26px;color:#21242c">${esc(c.cadence)}</p>
  </td></tr>
  <tr><td align="center" style="padding:32px 40px 44px 40px">
    <a href="${blog}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${ACCENT};border-radius:8px;color:#ffffff;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:600;line-height:20px">${esc(c.cta)} →</a>
  </td></tr>
  <tr><td align="center" style="padding:36px 24px 32px 24px;background-color:${ACCENT}">
    <p style="margin:0 0 14px 0;font-family:${SERIF};font-size:26px;font-weight:bold;color:#ffffff">${esc(c.connect)}</p>
    ${socials}
  </td></tr>
  <tr><td align="center" style="padding:28px 40px;background-color:#f9f7f5;border-top:1px solid #e5e0dc">
    <p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:21px;color:#676f7e">${esc(c.why)} <a href="${SITE}/${lang}/" style="color:${ACCENT};text-decoration:none">lorenzo.loconsole.eu</a>.</p>
    <p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:21px;color:#676f7e">${esc(c.unsubscribe)}</p>
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
    fs.writeFileSync(path.join(out, `welcome-${lang}.html`), renderWelcome(lang));
    console.log(`templates/out/welcome-${lang}.html`);
  }
}
