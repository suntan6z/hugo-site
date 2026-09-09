# Deploying the admin portal

Live at `https://admin.loconsole.eu`, on a Scaleway Serverless Container in
`fr-par`. Separate from the Hugo site: StaticHost never sees this, and this
never touches StaticHost.

## Resources

| Thing | Name |
|---|---|
| Container namespace | `loconsole-admin` |
| Container | `admin` (port 8080, min-scale 0, max-scale 3, 512 MB / 250 mCPU) |
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
