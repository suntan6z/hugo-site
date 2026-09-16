# Deploying the admin portal

Live at `https://admin.loconsole.eu`, on a Scaleway Serverless Container in
`fr-par`. Separate from the Hugo site: StaticHost never sees this, and this
never touches StaticHost.

## Resources

| Thing | Name |
|---|---|
| Container namespace | `loconsole-admin` |
| Container | `admin` (port 8080, min-scale 0, max-scale 3, 1 GB / 250 mCPU) |
| Endpoint | `https://loconsoleadmin46c00049-admin.functions.fnc.fr-par.scw.cloud` |
| Registry namespace | `loconsole-admin` (private) |
| Object Storage bucket | `loconsole-admin-state` (private) |
| GitHub App | `loconsole-admin-portal`, `contents:write` + `metadata:read`, `suntan6z/hugo-site` only |
| IAM application | `loconsole-admin-portal` — the container's storage key, Object Storage objects only |

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
| `DEEPL_API_KEY` | "Draft from English" in the FR/IT tabs | deepl.com → API plans → *DeepL API Free* → Account → API keys. Free keys end in `:fx`. Settings shows the month's allowance and what is left of it |
| `CRON_TOKEN` | Scheduled publishing, and sending its newsletter once the site is live | `openssl rand -hex 32`. `create-container.sh` gives it to the container and to the Scaleway cron trigger that presents it, so it lives nowhere else. Without it there is no trigger and the endpoint answers 404 to everyone; scheduled articles then wait until you open the portal |

## Scheduled publishing

A Scaleway cron trigger on the container, `scheduled-publish`, calls
`POST /api/cron` at `:00` and `:10` past every hour (UTC).
`create-container.sh` creates, updates or removes it, depending on whether
`CRON_TOKEN` is set. That endpoint is the one route that answers without a
session. It is gated on `CRON_TOKEN`, takes no parameters, and only performs
work scheduled from inside the portal. A wrong or missing token gets a 404, so
it does not even admit to existing.

```bash
scw container trigger list container-id=<id> region=fr-par
```

Things worth knowing:

- **Articles go live on the hour.** The editor's picker offers whole hours,
  so the time you pick is the time the article is published. (A time between
  hours still works: the next pass, `:00` or `:10`, picks it up.) The container
  scales to zero after 15 idle minutes, and checking every quarter hour would
  keep it awake (and billed) around the clock.
- **The newsletter is sent on the `:10` pass, not with the publish**, once
  `/en/build-info.json` shows the article is actually live. Otherwise the link
  in the email 404s for every subscriber until StaticHost finishes. A build
  slower than ten minutes pushes the email to the next hour.
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
