---
title: "Confirmez votre inscription"
description: "Confirmez votre inscription à la newsletter."
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
      <h1>Confirmation de votre inscription…</h1>
    </div>
    <div class="nlc-state" id="nlc-done" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Vous êtes inscrit·e</h1>
      <p class="page-lede">Merci d'avoir confirmé ! Vous êtes inscrit·e avec l'adresse&nbsp;:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Un e-mail de bienvenue est en route, dans la minute. S'il n'apparaît pas, regardez dans vos courriers indésirables.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/fr/blog/">Lire les derniers articles</a></div>
    </div>
    <div class="nlc-state" id="nlc-already" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Déjà confirmé</h1>
      <p class="page-lede">Ce lien a déjà été utilisé. Vous êtes inscrit·e avec l'adresse&nbsp;:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Il n'y a rien d'autre à faire.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/fr/blog/">Lire les derniers articles</a></div>
    </div>
    <div class="nlc-state" id="nlc-expired" hidden>
      <div class="nlc-icon warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h1>Ce lien a expiré</h1>
      <p class="page-lede">Les liens de confirmation sont valables 48 heures, et celui-ci est périmé. Appuyez sur le bouton et je vous en envoie un nouveau.</p>
      <div class="nlc-actions"><button type="button" class="btn-primary" id="nlc-renew">Envoyer un nouveau lien</button><a class="nlc-link" href="/fr/blog/">Retour au blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-renewed" hidden>
      <div class="nlc-icon wait"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h1>Consultez votre boîte mail</h1>
      <p class="page-lede">Un nouveau lien vient d'être envoyé à&nbsp;:</p>
      <p class="nlc-email"><span data-nlc-email></span></p>
      <p class="nlc-note">Il est valable 48 heures.</p>
    </div>
    <div class="nlc-state" id="nlc-failed" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
      <h1>Ce lien ne fonctionne pas</h1>
      <p class="page-lede">Il n'est pas valide. Inscrivez-vous à nouveau depuis n'importe quel article et je vous en enverrai un nouveau.</p>
      <div class="nlc-actions"><a class="nlc-link" href="/fr/blog/">Retour au blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-error" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div>
      <h1>Un problème est survenu</h1>
      <p class="page-lede">Le problème vient de mon côté. Rechargez cette page dans un instant : le lien reste valable 48 heures.</p>
    </div>
      <noscript><div class="nlc-state"><div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div><p class="page-lede">La confirmation nécessite JavaScript. Activez-le puis ouvrez à nouveau le lien du message.</p></div></noscript>
    </div>
  </section>
</div>
