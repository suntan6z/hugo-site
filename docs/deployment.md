# Deployment

Three separate things ship from this repo, by three separate routes. Nothing here deploys anything by hand.

| What | How it ships | Triggered by |
|---|---|---|
| **The site** | [StaticHost.eu](https://www.statichost.eu/) watches `main`, runs `hugo --minify` on its own servers and serves the result | any push to `main` |
| **The admin portal** (`admin/`) | GitHub Actions builds a Docker image and points the Scaleway container at it | pushes touching `admin/**` |
| **The form functions** (`functions/`) | GitHub Actions runs `functions/deploy.sh` | pushes touching `functions/**` |

So: **push to `main` and you're done.** Publishing from the portal is a push too — it commits to `main` on your behalf, which StaticHost then builds like any other.

```bash
git add -A
git commit -m "Describe your change"
git push
```

## Telling whether it worked

- **The portal's dashboard** is the quickest answer: it polls `/en/build-info.json` and shows *Publishing… / Live / Not rebuilt*, with the Hugo version that built what is currently live.
- **`.github/workflows/hugo-build.yml`** builds the site in CI on every push, using the exact image pinned in [`statichost.yml`](../statichost.yml). It deploys nothing — it exists so a template that needs a newer Hugo fails there, with a readable log, instead of silently on StaticHost.
- The portal's own deploy workflow reads the container's image back afterwards and fails if it did not change.

## The Hugo version is pinned in the repo

[`statichost.yml`](../statichost.yml) names the exact Docker image StaticHost builds with. Its presence makes StaticHost ignore the version field in its dashboard entirely. Local Hugo (Homebrew) runs ahead of that pin — that is expected, and the CI build above is what keeps the gap honest. When bumping it, check a matching tag actually exists first; see CLAUDE.md for the tag rules.

> ⚠️ **Never commit `public/` or `resources/`.** Both are git-ignored on purpose — StaticHost regenerates them on every deploy, and tracking them causes build conflicts. The repo holds **source only**.
