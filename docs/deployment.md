# Deployment

**Push to `main` and you're done.** [StaticHost.eu](https://www.statichost.eu/) watches this GitHub repo, runs `hugo --minify` on its own servers, and serves the result. There is no CI in this repo.

```bash
git add -A
git commit -m "Describe your change"
git push
```

> ⚠️ **Do not commit the `public/` or `resources/` folders.** Both are in `.gitignore` on purpose — StaticHost regenerates them on every deploy. Tracking them causes build conflicts. The git repo holds **source only**.
