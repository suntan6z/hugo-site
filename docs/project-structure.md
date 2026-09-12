# Project Structure

Three deployable things live side by side in this repo, each with its own way of shipping (see [Deployment](deployment.md)):

```
the Hugo site        content/ layouts/ static/ assets/ data/ i18n/ archetypes/ hugo.toml statichost.yml
the admin portal     admin/
the form functions   functions/
```

Hugo ignores `admin/` and `functions/` — they are not content, so they never affect the build.

## The site

```
hugo.toml                  → site config: params, languages, menus, output formats
statichost.yml             → the exact Hugo image production builds with

content/
  about.md, now.md, contact.md, privacy-policy.md   → static pages (+ .fr/.it siblings)
  blog/<slug>/index.md     → one page bundle per article, images co-located
  gallery/<city>/index.md  → headless bundle per city, photos co-located
  redirects/               → meta-refresh stubs pinned to exact old URLs (written by the
                             portal when an article is renamed; never rendered as pages)

data/
  gallery_cities.json      → the gallery filter tabs
  gallery_photos.json      → caption / alt text per photo

i18n/{en,fr,it}.toml       → every interface string, one key per line, in all three files

assets/                    → Hugo Pipes sources only (processed: resources.Get, .Resize)
  img/hero.webp, hero.jpeg → homepage hero, WebP + JPEG fallback

static/                    → copied verbatim to the site root
  css/main.css             → all site CSS, and the source of the portal's look
  js/main.js               → contact form and small interactions (the search modal's
                             own script lives in layouts/partials/header.html)
  fonts/                   → self-hosted Fraunces + DM Sans
  _headers                 → security headers, incl. the CSP
  404.html                 → also bounces prefix-less paths to /en/<path>

layouts/
  _default/baseof.html     → <head>: canonical, Open Graph, JSON-LD, hreflang
  _default/_markup/        → render hooks (images get real dimensions here)
  blog/single.html, list.html
  redirect/single.html     → the meta-refresh page for content/redirects/
  index.html               → homepage: hero, gallery, latest articles
  index.buildinfo.json     → the manifest the portal polls to know what is live
  partials/

archetypes/blog.md         → template for `hugo new blog/<slug>/index.md`
```

## The admin portal (`admin/`)

A SvelteKit app; full picture in [CLAUDE.md](../CLAUDE.md) and [`admin/DEPLOY.md`](../admin/DEPLOY.md).

```
admin/
  src/routes/              → pages (dashboard, posts, gallery, newsletter, strings,
                             analytics, activity, settings) and the JSON endpoints
  src/lib/client/          → browser-side image processing, passkeys
  src/lib/server/
    langs.ts, diff.ts, cache.ts, env.ts   → site-wide values and utilities
    content/               → reading and writing articles, galleries, strings
    auth/                  → passkeys, sessions, the access allow-list
    store/                 → object storage (drafts, audit, settings)
    github/                → the GitHub App, for committing
    integrations/          → Bing, Resend, DeepL, IndexNow, build status
    seo/                   → the pre-publish checks
  test/                    → unit tests named after the module they cover
  test/integration/        → boots the built app and drives it over HTTP
```

The rule worth knowing: the logic lives in **pure modules** with no environment or network, each paired with a thin one that does the I/O. That is what lets the test suite run the interesting parts with no keys and no build.

## The form functions (`functions/`)

Dependency-free Node handlers for the contact form and newsletter signup, deployed by `functions/deploy.sh` — see [Forms & Email](forms-and-email.md).

## Not in git

`public/` and `resources/` are build output, `admin/node_modules`, `admin/build`, `admin/.state` and `admin/.env` are local. The repo holds source only.
