# Local Development

```bash
# Install Hugo — the site is pinned to v0.163.3 extended (see statichost.yml);
# it needs at least the extended edition and the APIs added around v0.156–0.158
# (`locale`, `hugo.Data`), so match the pinned version to avoid build drift.
brew install hugo

# Run the dev server with live reload
hugo server

# Open http://localhost:1313
```

A production build is generated with `hugo --minify`, but you normally don't run this by hand — see [Deployment](deployment.md).

There are no tests, linters, or a build toolchain beyond Hugo itself.
