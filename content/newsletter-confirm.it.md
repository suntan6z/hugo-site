---
title: "Conferma la tua iscrizione"
description: "Conferma la tua iscrizione alla newsletter."
# A utility page for the link in the confirmation email: kept out of the sitemap
# and the search index (build.list), and told not to be indexed (noindex).
noindex: true
build:
  render: always
  list: never
---
<div id="newsletter-confirm">
  <section class="page-header">
    <div class="container">
      <div class="content-col">
        <h1>Iscrizione alla <span class="text-gradient">newsletter</span></h1>
        <div aria-live="polite">
          <p class="page-lede" id="nlc-working">Conferma dell'iscrizione in corso…</p>
          <p class="page-lede" id="nlc-done" hidden>Sei iscritto/a. Grazie per aver confermato! Un'email di benvenuto è in arrivo.</p>
          <p class="page-lede" id="nlc-failed" hidden>Questo link di conferma è scaduto o non è valido. Iscriviti di nuovo da un qualsiasi articolo e te ne manderò uno nuovo.</p>
          <p class="page-lede" id="nlc-error" hidden>Qualcosa è andato storto da parte mia. Ricarica questa pagina tra un momento: il link resta valido per 48 ore.</p>
        </div>
        <noscript><p class="page-lede">La conferma richiede JavaScript. Attivalo e apri di nuovo il link nell'email.</p></noscript>
        <p style="margin-top:1.5rem"><a class="btn-primary" href="/it/blog/">Leggi gli ultimi articoli</a></p>
      </div>
    </div>
  </section>
</div>
