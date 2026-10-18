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
      <div class="content-col">
        <h1>Inscription à la <span class="text-gradient">newsletter</span></h1>
        <div aria-live="polite">
          <p class="page-lede" id="nlc-working">Confirmation de votre inscription…</p>
          <p class="page-lede" id="nlc-done" hidden>Vous êtes inscrit·e. Merci d'avoir confirmé ! Un e-mail de bienvenue est en route.</p>
          <p class="page-lede" id="nlc-failed" hidden>Ce lien de confirmation a expiré ou n'est pas valide. Inscrivez-vous à nouveau depuis n'importe quel article et je vous en enverrai un nouveau.</p>
          <p class="page-lede" id="nlc-error" hidden>Un problème est survenu de mon côté. Rechargez cette page dans un instant : le lien reste valable 48 heures.</p>
        </div>
        <noscript><p class="page-lede">La confirmation nécessite JavaScript. Activez-le puis ouvrez à nouveau le lien du message.</p></noscript>
        <p style="margin-top:1.5rem"><a class="btn-primary" href="/fr/blog/">Lire les derniers articles</a></p>
      </div>
    </div>
  </section>
</div>
