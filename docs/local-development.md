# Local Development

```bash
# Install Hugo — requires v0.158.0+ (the site uses `locale` and `hugo.Data`)
brew install hugo

# Run the dev server with live reload
hugo server

# Open http://localhost:1313
```

A production build is generated with `hugo --minify`, but you normally don't run this by hand — see [Deployment](deployment.md).

There are no tests, linters, or a build toolchain beyond Hugo itself.
