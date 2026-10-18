# Deploying the admin portal

Live at `https://admin.loconsole.eu`, on a Scaleway Serverless Container in
`fr-par`. Separate from the Hugo site: StaticHost never sees this, and this
never touches StaticHost.

## Resources

| Thing | Name |
|---|---|
| Container namespace | `loconsole-admin` |
| Container | `admin` (port 8080, min-scale 0, max-scale 1, 512 MB / 250 mCPU) |
| Endpoint | `https://loconsoleadmin46c00049-admin.functions.fnc.fr-par.scw.cloud` |
| Registry namespace | `loconsole-admin` (private) |
| Object Storage bucket | `loconsole-admin-state` (private) |
| GitHub App | `loconsole-admin-portal`, `contents:write` + `metadata:read`, `suntan6z/hugo-site` only |
| IAM application | `loconsole-admin-portal` — the container's storage key, Object Storage objects only |
| Billing budget | €1 a month, emailing the account address when reached (`scw billing budget list`) |

## What it costs

Everything Scaleway runs for this site — the portal container, its cron
trigger, registry and bucket, and the two form functions in `functions/` — is
meant to stay inside the free tier, which resets every month: 200,000 vCPU-s
and 400,000 GB-s for serverless containers. Only the container comes close.
It is billed for every second it is awake, and it stays awake 15 idle minutes
after each request, so what matters is **how often something wakes it**:

- the cron trigger, twice a morning (≈ 30 min/day);
- your own time in the portal (plus 15 minutes after you leave).

At 0.5 GB × 0.25 vCPU that leaves room for about 7 hours of portal use a day
before memory runs out of free tier. In September 2026 it ran at 1 GB with the
trigger twice an hour, was awake about 12 hours a day, and cost €0.86. Before
adding anything that calls the container on a timer, work it out against those
numbers. `max-scale 1` caps the worst case (someone hammering the URL) at one
instance: roughly €2 a month.

```bash
scw billing consumption list   # this month so far, per product
```

## Where secrets live

Three places, deliberately:

- **`admin/.env`** on your Mac — the source of truth. Gitignored, mode 600.
- **The Scaleway container's secret environment** — set once by
  `scripts/create-container.sh`, which reads `.env`.
- **GitHub Actions secrets** — only `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`,
  `SCW_DEFAULT_ORGANIZATION_ID`, `SCW_DEFAULT_PROJECT_ID` (already present for
  the Functions deploy). CI can push an image and swap it in; it never sees the
  GitHub App key, the session secret or the bootstrap token.

## Normal deploys

Push to `main` with anything under `admin/**`. `.github/workflows/deploy-admin.yml`
runs the test suite, builds the image, pushes it, and points the container at
the new tag. The front-matter round-trip suite runs against the real
`content/blog` and `content/gallery`, so a serializer regression fails the
deploy rather than shipping and silently breaking Hugo's FR/IT placeholder
pages.

## First-time setup, or after rotating a secret

CI cannot create the container, because that would mean giving GitHub the app
secrets. Do it from your Mac instead:

```bash
cd admin && ./scripts/create-container.sh
```

Safe to re-run — it updates the existing container rather than making a second
one. Run it whenever a value in `.env` changes.

## Gotchas found the hard way

- **`admin/.env` must not leak into the `scw` CLI's environment.** Sourcing it
  exports `SCW_ACCESS_KEY`/`SCW_SECRET_KEY` — the container's *storage-only*
  key — and the CLI prefers env vars over your config profile. Management calls
  then return an **empty list rather than an error**, which looks exactly like
  "the namespace doesn't exist". `create-container.sh` copies those aside and
  unsets them before any `scw` call.
- **Never run `create-container.sh` under `bash -x`.** It would echo the GitHub
  App private key and every secret. The script sets `set +x` defensively.
- **`memory-limit-bytes` only accepts G/GB units** in the CLI, despite the name.
- **`scw container container update` takes `image`, not `registry-image`, and has
  no `redeploy` flag at all.** Setting `image` is what triggers the deployment.
  Getting this wrong once cost four apparently-successful CI runs that left the
  container on an old image, and a production 500 when a rotated secret never
  reached it. The workflow now reads the container's image back and fails if it
  did not change.
- **Never filter this script's output through `grep` to hide secrets.** Doing so
  hides errors too — that is exactly how a failing update looked like a
  successful one. Redact with `sed` over the full output instead.
- The CLI argument is `image`, not `registry-image`, and secret env vars are a
  map (`secret-environment-variables.KEY=value`), not an indexed list.
- **WebAuthn is bound to `RP_ID=admin.loconsole.eu`.** Passkeys will not work on
  the raw `*.functions.fnc.fr-par.scw.cloud` endpoint — enrol only via the
  custom domain.

## Optional integrations

Each is off until its key is in `admin/.env`, then `./scripts/create-container.sh`
(the script lists which are set). CI deploys never touch these.

| Key | Enables | Where to get it |
|---|---|---|
| `BING_API_KEY` | Search stats on the dashboard | Bing Webmaster Tools → Settings → API access |
| `RESEND_API_KEY` | Newsletter broadcasts | Resend → API keys (full access, for broadcasts) |
| `RESEND_SEGMENT_FR`, `RESEND_SEGMENT_IT` (and `RESEND_SEGMENT_EN`, which defaults to the original list) | One mailing list per language: French and Italian subscribers, and the French and Italian emails | `node scripts/resend-setup.mjs` creates the two segments (`--check` only reads) and prints these lines. Set the same ids in `functions/.env` / the repository variables so the signup form files people on the right list |
| `DEEPL_API_KEY` | "Draft from English" in the FR/IT tabs | deepl.com → API plans → *DeepL API Free* → Account → API keys. Free keys end in `:fx`. Settings shows the month's allowance and what is left of it |
| `LITLYX_TOKEN` | The Visitors page, view counts in the article list, and the home screen's visitor line | The self-hosted dashboard has no API keys; it reads data for a **shareable link**. In Litlyx → Shareable links, create one for all domains and copy its id (after `/shared/`). If you give the link a password, also set `LITLYX_SHARE_PASSWORD`. `LITLYX_HOST` defaults to `https://litlyx.loconsole.eu` — the dashboard, not the `analytics.` collector the site reports to |
| `GSC_SERVICE_ACCOUNT_B64` + `GSC_SITE_URL` | The Google half of the Search page (queries, pages, sitemaps), and "Is it on Google?" in the article editor | Google Cloud: create a project, enable the **Google Search Console API**, create a **service account** and download its JSON key. In Search Console → Settings → Users and permissions, add the service account's email as a user (Restricted is enough; it only reads). `GSC_SERVICE_ACCOUNT_B64` is `base64 -i key.json \| tr -d '\n'`; `GSC_SITE_URL` is the property exactly as Search Console names it (`sc-domain:loconsole.eu`, or `https://lorenzo.loconsole.eu/`). A 403 on the Search page means the email has not been added as a user |
| `PAGESPEED_API_KEY` | Optional. "Check speed" in the article editor works without it at a low daily quota | Google Cloud → APIs → *PageSpeed Insights API* → Credentials |
| `ALERT_EMAIL` | Optional. An email when the daily health check finds something new wrong (needs `RESEND_API_KEY`) | Your own address. Without it the home screen is the only place the check shows |
| `CRON_TOKEN` | Scheduled publishing, and sending its newsletter once the site is live | `openssl rand -hex 32`. `create-container.sh` gives it to the container and to the Scaleway cron trigger that presents it, so it lives nowhere else. Without it there is no trigger and the endpoint answers 404 to everyone; scheduled articles then wait until you open the portal |

## Daily health check

The morning trigger also runs `runHealth` (`src/lib/server/integrations/uptime.ts`), at
most once every 20 hours. It looks at the home page, `/en/build-info.json`, the two form
functions (the CORS preflight a browser would send) and the TLS certificates of the site, the
portal and the Litlyx dashboard. A certificate within 14 days of its end counts as a
problem, and one within 30 days is mentioned on the home screen. The result is kept in
`state/health` (the last 60 runs) and shown on the home screen, which also has a "Check now"
button. With `ALERT_EMAIL` set, an email goes out when something is wrong that was not wrong
at the last look; the same fault is not repeated every morning.

**It is a daily look, not live monitoring**: it cannot see an outage that begins and ends
between two runs. More runs are not the answer: each wakes the container for about fifteen
minutes, and the bill is sensitive to exactly that (see "What it costs"). For five-minute
checks, point a free external pinger (UptimeRobot, Better Stack, a self-hosted Uptime Kuma)
at `https://lorenzo.loconsole.eu/en/`.

## Scheduled publishing

A Scaleway cron trigger on the container, `scheduled-publish`, calls
`POST /api/cron` at 9:00 and 9:30, Paris time (`Europe/Paris`), every day.
`create-container.sh` creates, updates or removes it, depending on whether
`CRON_TOKEN` is set. That endpoint is the one route that answers without a
session. It is gated on `CRON_TOKEN`, takes no parameters, and only performs
work scheduled from inside the portal. A wrong or missing token gets a 404, so
it does not even admit to existing.

```bash
scw container trigger list container-id=<id> region=fr-par
```

Things worth knowing:

- **The same trigger checks outside links, once a week.** Every `http(s)` link
  in the articles and pages gets a HEAD request (GET if HEAD is refused). A link
  counts as dead only after two checks at least a day apart both found it gone
  (404, 410, or a domain that no longer exists); 403s, rate limits and timeouts
  never count. Dead links appear in *Worth doing*. The home screen can also run
  the check on demand.

- **Articles go live at 9:00 Paris time, on a day after today.** The editor
  only asks for a day; `PUBLISH_HOUR` and `PUBLISH_TZ` in
  `src/lib/server/schedule/plan.ts` fix the hour, and must match the trigger's
  schedule and timezone in `create-container.sh`. To publish today, use Publish.
- **The newsletter goes out on the 9:30 pass**, once `/en/build-info.json`
  shows the article is actually live. Otherwise the link in the email 404s for
  every subscriber until StaticHost finishes. A build slower than half an hour
  pushes the email to the next morning (or to whenever you open the portal).
- **A newsletter can be held for a later morning on its own**, for an article that is already live: the Newsletter page stores it as a `published` item with `announceAt` (9:30 Paris on the chosen day) and the words the author wrote, and the 9:30 pass sends it. The Sent tab shows what happened to the latest five broadcasts (delivered, bounced, marked as spam, unsubscribed, and opened and clicked when Resend recorded any), read from Resend's per-recipient lists when the tab is opened. A webhook would wake the container on every event, so nothing is pushed. Opens and clicks exist only if tracking is switched on for the sending domain in Resend; the privacy policy says they are not tracked, so leave it off or amend the policy.

- **Rolling out the French and Italian lists, in this order.** (1) `node scripts/resend-setup.mjs --check` (read-only), then without `--check` to create the two segments; it prints the ids. (2) Create the welcome templates `newsletter-welcome-fr` and `newsletter-welcome-it` in Resend. (3) Put `RESEND_SEGMENT_FR/IT` in `admin/.env` and run `./scripts/create-container.sh`; set the same as repository variables (`gh variable set RESEND_SEGMENT_FR --body <id>`) so `deploy-functions.yml` passes them to the signup function. (4) Move any existing French or Italian subscribers to their list from Newsletter → Subscribers. Until (3) nothing changes: every signup joins English.
- **The newsletter uses Resend's Contacts and Segments, not the deprecated Audiences API.** Contacts are global at Resend and a mailing list is a segment. `RESEND_SEGMENT_EN` is the list that existed before there were languages (Resend's old "General" audience, now a segment; the code defaults to its id, and `RESEND_AUDIENCE_ID` is still read as a fallback name). `RESEND_SEGMENT_FR` / `RESEND_SEGMENT_IT` are the French and Italian lists once they exist; unset means that language has no list.
- **Opening the portal also runs anything due**, so a missed trigger delays
  publishing rather than losing it.
- Scheduling used to run from a GitHub Actions workflow. It was dropped
  because GitHub ran its 15-minute schedule only every few hours, and it needed
  a second copy of the token.

## Recovering from a lockout

In order of escalation:

1. Sign in with your second passkey (enrol one on your phone on day one).
2. Rotate `BOOTSTRAP_TOKEN` in `.env`, re-run `create-container.sh`, then open
   `https://admin.loconsole.eu/enroll?t=<new token>`.
3. Last resort: delete `auth/credentials.json` from the
   `loconsole-admin-state` bucket in the Scaleway console. The portal reverts to
   first-run enrolment, still gated on the bootstrap token.

Nothing in that ladder depends on email, GitHub, or this laptop.

## Expiry to diarise

The container's storage API key expires **2027-09-07**. Storage silently starts
failing after that. Create a new key for the `loconsole-admin-portal` IAM
application, update `.env`, re-run `create-container.sh`.

## IndexNow

`static/<INDEXNOW_KEY>.txt` contains the key and must stay in sync with
`INDEXNOW_KEY` in `admin/.env`. Rotating the key means writing a new file,
deleting the old one and re-running `create-container.sh` — the old file must
go, or both keys stay valid.

Publishing queues the affected URLs rather than submitting them: at publish
time StaticHost has not rebuilt, so the URL would still 404. The dashboard
submits the queue once it sees the deploy go live.
