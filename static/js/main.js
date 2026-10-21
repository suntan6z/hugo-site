// Dark mode toggle — the initial theme is set in <head> before paint to avoid flash
const themeToggles = document.querySelectorAll('.theme-icon-btn');
if (themeToggles.length) {
  const root = document.documentElement;
  let themeTimer;
  const syncAria = () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    themeToggles.forEach(btn => btn.setAttribute('aria-checked', isDark));
  };
  syncAria();
  themeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-transition');
      root.setAttribute('data-theme', next);
      syncAria();
      try { localStorage.setItem('theme', next); } catch (e) {}
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => root.classList.remove('theme-transition'), 500);
    });
  });
}

// Mobile nav toggle
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');
const iconMenu = document.getElementById('icon-menu');
const iconClose = document.getElementById('icon-close');

hamburger?.addEventListener('click', () => {
  const isOpen = mobileNav.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
  iconMenu.style.display = isOpen ? 'none' : 'block';
  iconClose.style.display = isOpen ? 'block' : 'none';
});

// Close mobile nav on link click
mobileNav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileNav.classList.remove('open');
    iconMenu.style.display = 'block';
    iconClose.style.display = 'none';
  });
});

// Fade-up on scroll. Only elements that start below the first screen are
// hidden and revealed: anything already in view at load is left alone, so the
// top of a page never shows up washed out while it fades in. Skipped entirely
// for visitors who ask for reduced motion.
const fadeEls = [...document.querySelectorAll('.fade-up')]
  .filter(el => el.getBoundingClientRect().top > window.innerHeight);
if (fadeEls.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      observer.unobserve(el);
      el.classList.replace('fade-pending', 'fade-revealing');
      // Drop the transition once done, so it doesn't override the element's
      // own (e.g. an article card's hover lift).
      const done = (e) => {
        if (e.target !== el) return; // a child's transition bubbling up
        el.classList.remove('fade-revealing');
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  fadeEls.forEach(el => { el.classList.add('fade-pending'); observer.observe(el); });
}

/* ── The site's two form handlers (Scaleway Functions, see functions/) ──
   Also named in static/_headers (connect-src): change them there too. */
const FORM_ENDPOINTS = {
  contact: 'https://loconsoleapik19unsn0-contact.functions.fnc.fr-par.scw.cloud',
  newsletter: 'https://loconsoleapik19unsn0-newsletter.functions.fnc.fr-par.scw.cloud',
};

/* ── ALTCHA: a small proof of work each form must solve before it is accepted ──
   Self-hosted widget (static/js/altcha/), checked by functions/lib/altcha.js.
   The widget is invisible and sits next to its form, not in it (inside, it would
   block submitting while it works). It starts when the form is first touched, and
   by the time the form is filled in the answer is usually ready. */
const formProofs = new WeakMap(); // widget -> the payload it last produced

function setUpProof(form, endpoint) {
  const widget = document.querySelector('altcha-widget[data-for="' + form.id + '"]');
  if (!widget) return null;
  widget.setAttribute('challenge', endpoint + '?challenge=1');
  widget.addEventListener('verified', (e) => formProofs.set(widget, e.detail.payload));
  widget.addEventListener('statechange', (e) => {
    if (['expired', 'unverified', 'error'].includes(e.detail.state)) formProofs.delete(widget);
  });
  // The widget file loads after this one; the worker must be known before it first solves.
  const ready = customElements.whenDefined('altcha-widget').then(() => {
    const algorithms = globalThis.$altcha && globalThis.$altcha.algorithms;
    if (algorithms && !algorithms.has('PBKDF2/SHA-256')) {
      algorithms.set('PBKDF2/SHA-256', () => new Worker('/js/altcha/pbkdf2.worker.js'));
    }
  });
  // Start working the first time anything in the form is touched.
  form.addEventListener('focusin', () => ready.then(() => startProof(widget)), { once: true });
  return widget;
}

/* One verification at a time: starting a second aborts the first. The widget's own
   state lags a moment behind a call to verify(), so track it here instead. */
const proofRunning = new WeakSet();

function startProof(widget) {
  if (formProofs.has(widget) || proofRunning.has(widget)) return;
  proofRunning.add(widget);
  Promise.resolve(widget.verify()).catch(() => {}).finally(() => proofRunning.delete(widget));
}

/** The widget's answer: the one it already has, else it works one out and we wait. '' if it cannot. */
function getProof(widget, timeoutMs = 60000) {
  if (!widget) return Promise.resolve('');
  const have = formProofs.get(widget);
  if (have) return Promise.resolve(have);
  return customElements.whenDefined('altcha-widget').then(() => new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer);
      widget.removeEventListener('verified', onVerified);
      widget.removeEventListener('statechange', onState);
      resolve(value);
    };
    const onVerified = (e) => finish(e.detail.payload);
    const onState = (e) => { if (e.detail.state === 'error') finish(''); };
    const timer = setTimeout(() => finish(''), timeoutMs);
    widget.addEventListener('verified', onVerified);
    widget.addEventListener('statechange', onState);
    startProof(widget);
  }));
}

/** An answer works once; clear it and let the widget start afresh. */
function spendProof(widget) {
  if (!widget) return;
  formProofs.delete(widget);
  if (typeof widget.reset === 'function') widget.reset();
}

/* A function that has been idle takes several seconds to wake. Asking for its
   challenge ahead of time (a few hundred bytes) means it is awake when needed. */
function wakeFunction(endpoint) {
  fetch(endpoint + '?challenge=1', { cache: 'no-store' }).catch(() => {});
}

/* ── Contact page (only runs when the contact form is present) ── */
if (document.getElementById('contact-form')) {
  const contactWidget = setUpProof(document.getElementById('contact-form'), FORM_ENDPOINTS.contact);
  if (contactWidget) wakeFunction(FORM_ENDPOINTS.contact);

  // Local time
  function updateTime() {
    const el = document.getElementById('local-time');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) + ' (Paris)';
  }
  updateTime();
  setInterval(updateTime, 1000);

  // Show custom subject field
  document.getElementById('subject')?.addEventListener('change', function () {
    const other = this.value === 'other';
    document.getElementById('custom-subject-wrap').style.display = other ? 'block' : 'none';
    if (!other) {
      // A subject picked after a failed send must not leave the old complaint showing.
      const err = document.getElementById('customSubject-error');
      if (err) err.style.display = 'none';
      document.getElementById('customSubject').style.borderColor = '';
    }
  });

  // Char counter
  document.getElementById('message')?.addEventListener('input', function () {
    document.getElementById('char-count').textContent = `${this.value.length} / 500`;
  });

  // Form validation + submit
  document.getElementById('contact-form')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    let valid = true;

    const fields = [
      // Any non-empty name: two-letter names (Li, Wu, Ng, Al…) are real names.
      { id: 'firstName', errorId: 'firstName-error', msg: 'Please enter your first name.', check: v => v.length >= 1 },
      { id: 'lastName', errorId: 'lastName-error', msg: 'Please enter your last name.', check: v => v.length >= 1 },
      { id: 'email', errorId: 'email-error', msg: 'Please enter a valid email.', check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
      { id: 'subject', errorId: 'subject-error', msg: 'Please select a subject.', check: v => v !== '' },
      { id: 'message', errorId: 'message-error', msg: 'Message must be at least 50 characters (max 500).', check: v => v.length >= 50 && v.length <= 500 },
    ];

    // "Other" asks for a description; the function puts it in the email's subject line.
    const isOther = document.getElementById('subject').value === 'other';
    if (isOther) {
      fields.push({ id: 'customSubject', errorId: 'customSubject-error', msg: 'Please describe your subject.', check: v => v.length >= 1 && v.length <= 120 });
    }

    fields.forEach(f => {
      const el = document.getElementById(f.id);
      const err = document.getElementById(f.errorId);
      if (!f.check(el.value.trim())) {
        err.textContent = f.msg;
        err.style.display = 'block';
        el.style.borderColor = 'var(--primary)';
        valid = false;
      } else {
        err.style.display = 'none';
        el.style.borderColor = '';
      }
    });

    if (!valid) return;

    const btn = document.getElementById('submit-btn');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    // Phone is optional; only prefix the dialling code when a number was entered
    const phoneNumber = document.getElementById('phone').value.trim();
    const phoneCountry = document.getElementById('phone-country')?.value || '';
    const phone = phoneNumber ? `${phoneCountry} ${phoneNumber}` : '';

    try {
      // Normally ready already; otherwise this is the second or so the visitor waits.
      const altcha = await getProof(contactWidget);
      const res = await fetch(FORM_ENDPOINTS.contact, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A function waking from idle can take a while; give up after a minute, not never.
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          altcha,
          // Picks the language of the confirmation email.
          lang: document.documentElement.lang.slice(0, 2),
          firstName: document.getElementById('firstName').value,
          lastName: document.getElementById('lastName').value,
          email: document.getElementById('email').value,
          phone: phone,
          subject: document.getElementById('subject').value,
          customSubject: isOther ? document.getElementById('customSubject').value : '',
          message: document.getElementById('message').value,
          // The honeypot. Optional here, so a translated page that lacks it still sends.
          website: document.getElementById('contact-website')?.value || '',
        })
      });

      spendProof(contactWidget);
      if (res.ok) {
        // Replace the whole form panel (heading, note, fields) with the confirmation
        document.getElementById('form-title').style.display = 'none';
        document.getElementById('form-note').style.display = 'none';
        document.getElementById('contact-form').style.display = 'none';
        document.getElementById('form-success').style.display = 'block';
      } else {
        throw new Error('Failed');
      }
    } catch {
      spendProof(contactWidget);
      btn.textContent = 'Send Message';
      btn.disabled = false;
      alert('Failed to send message. Please try again or email me directly at lorenzo@loconsole.eu');
    }
  });
}

/* ── Newsletter box (article pages) ──
   Subscribing only sends the confirmation email; the address joins the list
   when its owner uses the link in it (the confirmation page, below). */
if (document.getElementById('newsletter-form')) {
  const newsletterForm = document.getElementById('newsletter-form');
  const newsletterWidget = setUpProof(newsletterForm, FORM_ENDPOINTS.newsletter);

  // Wake the function when the box nears the screen rather than on every page view.
  if (newsletterWidget && 'IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        watcher.disconnect();
        wakeFunction(FORM_ENDPOINTS.newsletter);
      }
    }, { rootMargin: '400px' });
    watcher.observe(newsletterForm);
  }

  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('newsletter-btn');
    const err = document.getElementById('newsletter-error');
    err.hidden = true;
    btn.disabled = true;
    btn.childNodes[0].textContent = I18N.subscribing;
    try {
      const altcha = await getProof(newsletterWidget);
      const res = await fetch(FORM_ENDPOINTS.newsletter, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          email: document.getElementById('newsletter-email').value,
          // The language of the page is the language of the confirmation email.
          lang: document.documentElement.lang.slice(0, 2),
          altcha,
          website: document.getElementById('nl-website').value,
        }),
      });
      spendProof(newsletterWidget);
      if (!res.ok) throw new Error('Failed');
      newsletterForm.style.display = 'none';
      document.getElementById('newsletter-sent').style.display = 'flex';
    } catch {
      spendProof(newsletterWidget);
      btn.disabled = false;
      btn.childNodes[0].textContent = I18N.subscribe + ' ';
      err.hidden = false;
    }
  });
}

/* ── Newsletter confirmation page: where the link in the email lands ──
   The link is /<lang>/newsletter-confirm/#<token>. The token sits after the #
   so it never reaches a server log or the analytics, and the page uses it
   only once its own script has run, which a mail scanner that merely fetches
   the link does not do. */
if (document.getElementById('newsletter-confirm')) {
  const states = ['nlc-working', 'nlc-done', 'nlc-already', 'nlc-expired', 'nlc-renewed', 'nlc-failed', 'nlc-error'];
  const show = (id) => states.forEach((s) => { document.getElementById(s).hidden = s !== id; });
  // The address the answer is about, written into whichever card shows it (textContent: never markup).
  const showEmail = (email) => document.querySelectorAll('[data-nlc-email]').forEach((el) => { el.textContent = typeof email === 'string' ? email : ''; });
  const token = location.hash.slice(1);
  const call = (payload) => fetch(FORM_ENDPOINTS.newsletter, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify(payload),
  });

  if (!token) {
    show('nlc-failed'); // opened without a link
  } else {
    call({ confirm: token })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        // The link has done its job, or can never work: take it out of the address bar.
        // On a temporary failure it stays, so reloading the page tries again. An expired
        // one is kept in this page's memory only, to ask for a new one with.
        if (res.ok || res.status === 400) history.replaceState(null, '', location.pathname);
        if (res.ok) { showEmail(data.email); show(data.already ? 'nlc-already' : 'nlc-done'); }
        else if (res.status === 400) show(data.error === 'expired' ? 'nlc-expired' : 'nlc-failed');
        else show('nlc-error');
      })
      .catch(() => show('nlc-error'));

    // "Send me a new link": the old link proves which address it was for.
    const renew = document.getElementById('nlc-renew');
    renew?.addEventListener('click', () => {
      renew.disabled = true;
      call({ renew: token })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok) { showEmail(data.email); show(data.already ? 'nlc-already' : 'nlc-renewed'); }
          else if (res.status === 400) show('nlc-failed');
          else show('nlc-error');
        })
        .catch(() => show('nlc-error'))
        .finally(() => { renew.disabled = false; });
    });
  }
}

// RSS button: offer to open the feed in the reader app installed on the device.
// A page cannot tell which apps are installed, so it hands the feed to the
// system with the feed: scheme (the OS or browser asks "open in <app>?" if
// something handles it) and keeps every other way one click away: web readers,
// copying the address, and the raw feed. Without JavaScript the button is a
// plain link to the raw feed.
(() => {
  const trigger = document.querySelector('[data-rss-open]');
  const dialog = document.getElementById('rss-dialog');
  if (!trigger || !dialog || typeof dialog.showModal !== 'function') return;
  const $ = (id) => document.getElementById(id);
  // The feed is whichever language is ticked; the page's own is ticked first.
  const radios = dialog.querySelectorAll('input[name="rss-lang"]');
  const chosen = () => (dialog.querySelector('input[name="rss-lang"]:checked') || radios[0]).value;
  const point = () => {
    const feed = chosen();
    const enc = encodeURIComponent(feed);
    $('rss-open-app').href = 'feed:' + feed;
    $('rss-feedly').href = 'https://feedly.com/i/subscription/feed/' + enc;
    $('rss-inoreader').href = 'https://www.inoreader.com/?add_feed=' + enc;
    $('rss-newsblur').href = 'https://www.newsblur.com/?url=' + enc;
    $('rss-raw').href = feed;
  };
  radios.forEach((r) => r.addEventListener('change', () => { $('rss-hint').hidden = true; point(); }));
  point();

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    $('rss-hint').hidden = true;
    dialog.showModal();
  });
  $('rss-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // If the page is still in front a moment after the click, nothing took the link.
  $('rss-open-app').addEventListener('click', () => {
    let left = false;
    const gone = () => { left = true; };
    addEventListener('blur', gone, { once: true });
    document.addEventListener('visibilitychange', gone, { once: true });
    setTimeout(() => { if (!left) $('rss-hint').hidden = false; }, 1500);
  });

  $('rss-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    try {
      await navigator.clipboard.writeText(chosen());
      btn.textContent = btn.dataset.copied;
      setTimeout(() => { btn.textContent = label; }, 2000);
    } catch (err) {
      window.prompt(label, chosen());
    }
  });
})();
