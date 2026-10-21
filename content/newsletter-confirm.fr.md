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
        <div style="margin-bottom:0.75rem"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary);flex-shrink:0" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
        <h1>Inscription à la <span class="text-gradient">newsletter</span></h1>
        <div aria-live="polite">
          <p class="page-lede" id="nlc-working">Confirmation de votre inscription…</p>
          <p class="page-lede" id="nlc-done" hidden>Vous êtes inscrit·e. Merci d'avoir confirmé ! Un e-mail de bienvenue est en route.</p>
          <p class="page-lede" id="nlc-already" hidden>Ce lien a déjà été utilisé et vous êtes bien inscrit·e. Il n'y a rien d'autre à faire.</p>
          <div id="nlc-expired" hidden>
            <p class="page-lede">Ce lien est trop ancien. Les liens de confirmation sont valables 48 heures, et celui-ci a expiré. Appuyez sur le bouton et je vous en envoie un nouveau.</p>
            <p style="margin-top:1.25rem"><button type="button" class="btn-primary" id="nlc-renew">Envoyer un nouveau lien</button></p>
          </div>
          <p class="page-lede" id="nlc-renewed" hidden>Un nouveau lien vient d'être envoyé dans votre boîte mail. Il est valable 48 heures.</p>
          <p class="page-lede" id="nlc-failed" hidden>Ce lien de confirmation a expiré ou n'est pas valide. Inscrivez-vous à nouveau depuis n'importe quel article et je vous en enverrai un nouveau.</p>
          <p class="page-lede" id="nlc-error" hidden>Un problème est survenu de mon côté. Rechargez cette page dans un instant : le lien reste valable 48 heures.</p>
          <p class="page-lede" id="nlc-hint" hidden style="font-size:0.95rem">L'e-mail de bienvenue arrive dans la minute. S'il n'apparaît pas, regardez dans vos courriers indésirables.</p>
        </div>
        <noscript><p class="page-lede">La confirmation nécessite JavaScript. Activez-le puis ouvrez à nouveau le lien du message.</p></noscript>
        <p style="margin-top:1.5rem"><a class="btn-primary" href="/fr/blog/">Lire les derniers articles</a></p>
      </div>
    </div>
  </section>
</div>
