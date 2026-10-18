// The message that asks someone to confirm their newsletter address, in the
// site's three languages. Written out here rather than kept as a Resend
// template so that nothing depends on the dashboard.

const COPY = {
  en: {
    subject: 'Please confirm your subscription',
    hello: 'Hello,',
    ask: 'Someone, hopefully you, asked to receive my newsletter at this address. To confirm, please use the link below.',
    button: 'Confirm my subscription',
    note: "The link works for 48 hours. If you didn't ask for this, ignore this email: nothing happens and your address is not added to the list.",
    sign: 'Lorenzo',
  },
  fr: {
    subject: 'Confirmez votre inscription',
    hello: 'Bonjour,',
    ask: "Quelqu'un, j'espère vous, a demandé à recevoir ma newsletter à cette adresse. Pour confirmer, utilisez le lien ci-dessous.",
    button: 'Confirmer mon inscription',
    note: "Le lien est valable 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne se passe et votre adresse n'est pas ajoutée à la liste.",
    sign: 'Lorenzo',
  },
  it: {
    subject: 'Conferma la tua iscrizione',
    hello: 'Ciao,',
    ask: 'Qualcuno, spero tu, ha chiesto di ricevere la mia newsletter a questo indirizzo. Per confermare, usa il link qui sotto.',
    button: 'Conferma la mia iscrizione',
    note: "Il link è valido per 48 ore. Se non l'hai richiesto tu, ignora questa email: non succede nulla e il tuo indirizzo non viene aggiunto alla lista.",
    sign: 'Lorenzo',
  },
};

/** `{ subject, html, text }` for `lang`, with `url` as the confirmation link. */
export function confirmationEmail(lang, url) {
  const c = COPY[lang] ?? COPY.en;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#222;max-width:34rem">` +
    `<p>${c.hello}</p><p>${c.ask}</p>` +
    `<p style="margin:1.5rem 0"><a href="${url}" style="background:#943847;color:#f8f5f2;text-decoration:none;padding:0.75rem 1.25rem;border-radius:0.5rem;display:inline-block">${c.button}</a></p>` +
    `<p style="font-size:14px;color:#666">${c.note}</p><p>${c.sign}</p></div>`;
  const text = `${c.hello}\n\n${c.ask}\n\n${url}\n\n${c.note}\n\n${c.sign}\n`;
  return { subject: c.subject, html, text };
}
