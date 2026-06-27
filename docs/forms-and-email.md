# Forms & Email

Both forms on the site submit via JavaScript `fetch()` calls to **Supabase Edge Functions**, which relay the request to **Resend** for actual email delivery. Supabase doesn't persistently store the message content — it's a transit layer only.

- **Contact form** — markup lives in `content/contact.md`; the submit handler (calling the `send-contact-email` Edge Function) is in `assets/js/main.js`.
- **Newsletter signup** — markup and submit handler (calling the `subscribe-newsletter` Edge Function) are both in `layouts/blog/single.html`.

The Supabase anon key embedded in the JS is public by design — that's how Supabase Edge Functions are meant to be called from the browser.

To change the backend (e.g. swap Supabase projects or endpoints), update the `fetch(...)` URL and `Authorization` header in `assets/js/main.js` (contact form) and `layouts/blog/single.html` (newsletter).

If you add any new external endpoint here, also update the CSP `connect-src` directive in `assets/_headers` or the request will be blocked in production.
