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
    <div class="nlc-state" id="nlc-working">
      <div class="nlc-icon wait"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h1>Confirming your subscription…</h1>
    </div>
    <div class="nlc-state" id="nlc-done" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>You're subscribed</h1>
      <p class="page-lede">Thank you for confirming! A welcome email is on its way.</p>
      <p class="nlc-note">It arrives within a minute. If you don't see it, check your spam folder.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/en/blog/">Read the latest articles</a></div>
    </div>
    <div class="nlc-state" id="nlc-already" hidden>
      <div class="nlc-icon ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Already confirmed</h1>
      <p class="page-lede">This link has already been used, and you are subscribed. There is nothing more to do.</p>
      <div class="nlc-actions"><a class="btn-primary" href="/en/blog/">Read the latest articles</a></div>
    </div>
    <div class="nlc-state" id="nlc-expired" hidden>
      <div class="nlc-icon warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h1>This link has expired</h1>
      <p class="page-lede">Confirmation links work for 48 hours, and this one has run out. Press the button and I'll send you a new one.</p>
      <div class="nlc-actions"><button type="button" class="btn-primary" id="nlc-renew">Send me a new link</button><a class="nlc-link" href="/en/blog/">Back to the blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-renewed" hidden>
      <div class="nlc-icon wait"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h1>Check your inbox</h1>
      <p class="page-lede">A new link is on its way. It works for 48 hours.</p>
    </div>
    <div class="nlc-state" id="nlc-failed" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
      <h1>This link doesn't work</h1>
      <p class="page-lede">It is not valid. Subscribe again from any article and I'll send you a new one.</p>
      <div class="nlc-actions"><a class="nlc-link" href="/en/blog/">Back to the blog</a></div>
    </div>
    <div class="nlc-state" id="nlc-error" hidden>
      <div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div>
      <h1>Something went wrong</h1>
      <p class="page-lede">The problem is on my side. Reload this page in a moment: the link stays valid for 48 hours.</p>
    </div>
      <noscript><div class="nlc-state"><div class="nlc-icon bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg></div><p class="page-lede">Confirming needs JavaScript. Please enable it and open the link in the email again.</p></div></noscript>
    </div>
  </section>
</div>
