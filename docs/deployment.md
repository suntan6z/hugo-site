# Deployment

**Push to `main` and you're done.** [StaticHost.eu](https://www.statichost.eu/) watches this GitHub repo, runs `hugo --minify` on its own servers, and serves the result. There is no CI for the Hugo build itself — StaticHost builds it. The only CI in this repo is the Scaleway Functions deploy workflow (`.github/workflows/deploy-functions.yml`), which redeploys the contact/newsletter backend on pushes that touch `functions/**` and never touches the Hugo site.

```bash
git add -A
git commit -m "Describe your change"
git push
```

> ⚠️ **Do not commit the `public/` or `resources/` folders.** Both are in `.gitignore` on purpose — StaticHost regenerates them on every deploy. Tracking them causes build conflicts. The git repo holds **source only**.
