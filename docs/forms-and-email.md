# Forms & Email

Both forms on the site submit via JavaScript `fetch()` calls to a **Scaleway Function** (`functions/`), which relays the request to **Resend** for actual email delivery / subscriber storage. Scaleway is a French cloud provider — chosen deliberately over Cloudflare/AWS/etc. so the relay layer stays under EU jurisdiction, consistent with the rest of the site's EU-hosted services (StaticHost.eu, self-hosted Litlyx). The functions themselves are stateless — they don't persist submissions — but the newsletter route deliberately does persist subscribers, inside a **Resend Audience**, since that's what makes sending real newsletter campaigns possible later (composed and sent from the Resend dashboard).

- **Contact form** — markup lives in `content/contact.md`; the submit handler (`POST` to the `contact` function's URL) is in `static/js/main.js`, handled server-side by `functions/contact.js`.
- **Newsletter signup** — markup and submit handler (`POST` to the `newsletter` function's URL) are both in `layouts/blog/single.html`, handled server-side by `functions/newsletter.js`.

`functions/` is a separate deployable unit from the Hugo site: StaticHost only ever runs `hugo --minify` (per `statichost.yml`) and never touches it. Deploy with `functions/deploy.sh` (requires the `scw` CLI configured, plus `RESEND_API_KEY`/`RESEND_AUDIENCE_ID` env vars — see `functions/.env.example`). It also runs automatically via `.github/workflows/deploy-functions.yml` on pushes to `main` that touch `functions/**`.

The two functions have **no npm dependencies at all** — they use Node 22's built-in `fetch` and nothing else, so there's no `node_modules` to audit or ship. `functions/dev-server.js` is a tiny (also dependency-free) local test harness: `node dev-server.js contact 8787` or `npm run dev:contact` / `npm run dev:newsletter`, then `curl` it directly.

The Resend API key and the Resend Audience ID are set as **namespace-level secrets** on Scaleway (via `deploy.sh`, which calls `scw function namespace create/update`) — they never appear in this repo or in the shipped frontend JS. This is a meaningful difference from the old Supabase setup: previously the Supabase anon key was public-by-design in the client JS (that's how Supabase Edge Functions are meant to be called), while the actual Resend key was hidden inside the Supabase function. Now there's no equivalent public key needed at all — the frontend calls the function with no `Authorization` header, and Scaleway is the only place that ever sees the Resend key.

Each function gets its own auto-generated HTTPS URL on first deploy (of the form `https://<name>-<slug>.functions.fnc.<region>.scw.cloud`) — there's no custom domain involved, which avoids having to point `loconsole.eu`'s DNS at Scaleway. After running `deploy.sh`, paste the two printed URLs into `static/js/main.js` (contact) and `layouts/blog/single.html` (newsletter). If you deploy to a region other than the CLI default (`fr-par`), also update the `connect-src` wildcard in `static/_headers` (currently `https://*.functions.fnc.fr-par.scw.cloud`) to match.

To change the backend logic (e.g. swap Resend for another provider, or adjust validation), edit `functions/contact.js` / `newsletter.js` and re-run `functions/deploy.sh` (or push to `main`, which triggers the same via CI).

If you add any new external endpoint here, also update the CSP `connect-src` directive in `static/_headers` or the request will be blocked in production.
