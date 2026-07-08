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

// Fade-up on scroll (Intersection Observer)
const fadeEls = document.querySelectorAll('.fade-up');
if (fadeEls.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  fadeEls.forEach(el => observer.observe(el));
}

/* ── Contact page (only runs when the contact form is present) ── */
if (document.getElementById('contact-form')) {
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
    document.getElementById('custom-subject-wrap').style.display = this.value === 'other' ? 'block' : 'none';
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
      { id: 'firstName', errorId: 'firstName-error', msg: 'First name must be at least 3 characters.', check: v => v.length >= 3 },
      { id: 'lastName', errorId: 'lastName-error', msg: 'Last name must be at least 3 characters.', check: v => v.length >= 3 },
      { id: 'email', errorId: 'email-error', msg: 'Please enter a valid email.', check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
      { id: 'subject', errorId: 'subject-error', msg: 'Please select a subject.', check: v => v !== '' },
      { id: 'message', errorId: 'message-error', msg: 'Message must be at least 50 characters (max 500).', check: v => v.length >= 50 && v.length <= 500 },
    ];

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
      const res = await fetch('https://loconsoleapik19unsn0-contact.functions.fnc.fr-par.scw.cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('firstName').value + ' ' + document.getElementById('lastName').value,
          email: document.getElementById('email').value,
          phone: phone,
          subject: document.getElementById('subject').value,
          message: document.getElementById('message').value,
        })
      });

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
      btn.textContent = 'Send Message';
      btn.disabled = false;
      alert('Failed to send message. Please try again or email me directly at lorenzo@loconsole.eu');
    }
  });
}
