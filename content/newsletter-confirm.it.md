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
        <div style="margin-bottom:0.75rem"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary);flex-shrink:0" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
        <h1>Iscrizione alla <span class="text-gradient">newsletter</span></h1>
        <div aria-live="polite">
          <p class="page-lede" id="nlc-working">Conferma dell'iscrizione in corso…</p>
          <p class="page-lede" id="nlc-done" hidden>Sei iscritto/a. Grazie per aver confermato! Un'email di benvenuto è in arrivo.</p>
          <p class="page-lede" id="nlc-failed" hidden>Questo link di conferma è scaduto o non è valido. Iscriviti di nuovo da un qualsiasi articolo e te ne manderò uno nuovo.</p>
          <p class="page-lede" id="nlc-error" hidden>Qualcosa è andato storto da parte mia. Ricarica questa pagina tra un momento: il link resta valido per 48 ore.</p>
          <p class="page-lede" id="nlc-hint" hidden style="font-size:0.95rem">L'email di benvenuto arriva entro un minuto. Se non lo vedi, controlla la cartella dello spam.</p>
        </div>
        <noscript><p class="page-lede">La conferma richiede JavaScript. Attivalo e apri di nuovo il link nell'email.</p></noscript>
        <p style="margin-top:1.5rem"><a class="btn-primary" href="/it/blog/">Leggi gli ultimi articoli</a></p>
      </div>
    </div>
  </section>
</div>
