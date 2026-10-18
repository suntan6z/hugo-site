---
title: "Confirm your subscription"
description: "Confirm your subscription to the newsletter."
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
        <h1>Newsletter <span class="text-gradient">subscription</span></h1>
        <div aria-live="polite">
          <p class="page-lede" id="nlc-working">Confirming your subscription…</p>
          <p class="page-lede" id="nlc-done" hidden>You are subscribed. Thank you for confirming! A welcome email is on its way.</p>
          <p class="page-lede" id="nlc-failed" hidden>This confirmation link has expired or isn't valid. Subscribe again from any article and I'll send you a new one.</p>
          <p class="page-lede" id="nlc-error" hidden>Something went wrong on my side. Please reload this page in a moment: the link stays valid for 48 hours.</p>
        </div>
        <noscript><p class="page-lede">Confirming needs JavaScript. Please enable it and open the link in the email again.</p></noscript>
        <p style="margin-top:1.5rem"><a class="btn-primary" href="/en/blog/">Read the latest articles</a></p>
      </div>
    </div>
  </section>
</div>
