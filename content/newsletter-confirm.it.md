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
    <div class="nlc-state" id="nlc-working">
      <div class="nlc-icon wait"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h1>Conferma della tua iscrizione…</h1>
    </div>
    <div class="nlc-state" id="nlc-done" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Sei iscritto/a</h1>
      <p class="page-lede">Grazie per aver confermato! Sei iscritto/a con l'indirizzo:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Un'email di benvenuto è in arrivo, entro un minuto. Se non la vedi, controlla la cartella dello spam.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/it/blog/">Leggi gli ultimi articoli</a></div>
    </div>
    <div class="nlc-state" id="nlc-already" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Già confermato</h1>
      <p class="page-lede">Questo link è già stato usato. Sei iscritto/a con l'indirizzo:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Non c'è altro da fare.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/it/blog/">Leggi gli ultimi articoli</a></div>
    </div>
    <div class="nlc-state" id="nlc-expired" hidden>
      <div class="nlc-icon warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h1>Questo link è scaduto</h1>
      <p class="page-lede">I link di conferma funzionano per 48 ore e questo è scaduto. Premi il pulsante e te ne invio uno nuovo.</p>
      <div class="nlc-actions"><button type="button" class="btn-primary" id="nlc-renew">Inviami un nuovo link</button><a class="nlc-link" href="/it/blog/">Torna al blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-renewed" hidden>
      <div class="nlc-icon wait"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h1>Controlla la tua casella</h1>
      <p class="page-lede">Un nuovo link è in arrivo a:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Funziona per 48 ore.</p>
    </div>
    <div class="nlc-state" id="nlc-failed" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
      <h1>Questo link non funziona</h1>
      <p class="page-lede">Non è valido. Iscriviti di nuovo da un qualsiasi articolo e te ne invierò uno nuovo.</p>
      <div class="nlc-actions"><a class="nlc-link" href="/it/blog/">Torna al blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-error" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div>
      <h1>Qualcosa è andato storto</h1>
      <p class="page-lede">Il problema è dalla mia parte. Ricarica questa pagina tra un momento: il link resta valido per 48 ore.</p>
    </div>
      <noscript><div class="nlc-state"><div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div><p class="page-lede">La conferma richiede JavaScript. Attivalo e apri di nuovo il link nell'email.</p></div></noscript>
    </div>
  </section>
</div>
