# Local Development

You only need this for template, CSS or portal work — writing and publishing happen in the portal.

## The site

```bash
brew install hugo     # extended edition; see the version note below
hugo server           # http://localhost:1313, live reload
```

A production build is `hugo --minify`, but you rarely run it by hand — see [Deployment](deployment.md).

**On versions:** the site is built in production with the image pinned in [`statichost.yml`](../statichost.yml) (currently Hugo 0.165.0 extended). Homebrew will usually be a version or two ahead, and that is fine: `.github/workflows/hugo-build.yml` builds every push with the pinned image, so drift shows up as a failed check rather than a broken deploy. It must be the **extended** edition either way — the homepage hero is resized to WebP through Hugo Pipes.

There are no tests, linters or build tooling for the site itself.

## The admin portal

```bash
cd admin
npm install
npm run dev        # http://localhost:5180
```

The dev server runs in **local mode**: it reads and writes this working tree directly, instead of committing to GitHub. Saving an article really does change `content/` — check `git diff` before committing. Its own state (drafts, sessions) goes to `admin/.state/`.

Set `ALLOW_DEV_LOGIN=1` in `admin/.env` to skip the passkey locally; it is ignored unless the portal is in local mode, so it cannot affect the deployed container.

```bash
npm test                  # unit tests, incl. a front-matter round-trip over every real article
npm run test:integration  # boots the built app against a throwaway copy of the site
npm run check             # types — a Vite build does not fail on type errors
```

Secrets, deployment and recovery: [`admin/DEPLOY.md`](../admin/DEPLOY.md).
