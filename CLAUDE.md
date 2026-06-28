# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal website for Lorenzo Loconsole, built with **Hugo v0.163.3 extended** (pinned exactly — see Deployment). Hand-written templates and CSS — no external Hugo theme. Live at [lorenzo.loconsole.eu](https://lorenzo.loconsole.eu).

## Commands

```bash
hugo server          # dev server with live reload at http://localhost:1313
hugo --minify        # production build (rarely run by hand — see Deployment)
```

There are no tests, linters, or a build toolchain beyond Hugo itself.

## Deployment

Hosted on **StaticHost.eu**, which watches the GitHub repo: push to `main` and StaticHost runs the build on its own servers and serves the result. There is no CI in this repo.

**The Hugo version StaticHost uses is pinned explicitly in [`statichost.yml`](statichost.yml)** (repo root), not in StaticHost's dashboard. That file's presence makes StaticHost ignore its own dashboard "Hugo/Version/Build flags/Public directory" fields entirely — they become inert once `statichost.yml` exists. This was deliberate: StaticHost's dashboard version field is "hidden state" that isn't visible in the repo and silently drifted out of sync with local dev once (StaticHost defaulted to Hugo 0.150.0 while local dev was on 0.163.3, which broke the build the moment a template used an API introduced after 0.150 — `hugo.Sites`/`hugo.Data`/`.Language.Label`/`locale`+`label` config keys, all added in Hugo 0.156–0.158). Keeping the version in `statichost.yml` means it travels with the repo and is visible in `git blame`.

**Image tag note:** `hugomods/hugo` (the Docker image family `statichost.yml` references) only publishes its convenient bare `ci-X.Y.Z` alias for a curated subset of releases — it did **not** have one for 0.163.3 at the time of writing. The full ingredient-tag (e.g. `debian-git-0.163.3`, used in `statichost.yml`) exists for every release instead. Per hugomods' own docs (docker.hugomods.com/docs/tags/): tags **without** a `std`/`reg` prefix are the Hugo **extended** edition (needed here for `.Resize` to webp on the hero image, matching the local `+extended` Hugo binary); `std`/`reg`-prefixed tags are the **non-extended** standard edition — don't swap these casually. When bumping the pinned version, search https://hub.docker.com/r/hugomods/hugo/tags for a matching `git-<version>` tag (no `std`/`reg` prefix) rather than assuming one exists.

A local `hugo server`/`hugo build` succeeding does not, by itself, guarantee the StaticHost build succeeds — `statichost.yml` narrows that gap by pinning the exact same version, but the Docker *image* itself isn't something this repo can test without Docker installed locally.

**Never commit `public/` or `resources/`** — both are git-ignored. StaticHost regenerates them on every deploy; tracking them causes build conflicts. The repo holds **source only**.

## Architecture — the non-obvious parts

**`static/` and `assets/` follow Hugo's default convention** — no custom `[module.mounts]`. `static/` holds everything copied verbatim to the site root: CSS (`/css/main.css`), JS, fonts, `/cv-fr.pdf`, `/_headers`, the root `/404.html`, and most images under `/img/...`. `assets/` holds only the handful of files actually processed through Hugo Pipes — currently just `assets/img/hero.webp` (and its unprocessed source `hero.jpeg`, kept for reference), resized via `resources.Get "img/hero.webp"` + `.Resize` for the homepage hero and `og:image`. Reference root-copied files by their served path (e.g. `/img/logo.svg`); only reach for `resources.Get`/`resources.Match` when a file actually needs Pipes processing — otherwise it belongs in `static/`.

**Blog posts are page bundles.** Each article is `content/blog/<slug>/index.md` with its images in the same folder. Because the section is `blog`, these render through `layouts/blog/single.html` (article) and `layouts/blog/list.html` (the `/blog` index). The bundle's images are page resources, which the image render hook (below) uses to emit real dimensions.

**Gallery photos are headless page bundles, not assets.** Each city is `content/gallery/<city-slug>/index.md` (plus `content/gallery/_index.md` for the section) with its photos co-located as page resources — same pattern as blog bundles, but every one of these has `build: { render: never, list: never }` in front matter, so Hugo never generates an HTML page for them or lists them anywhere (no `/gallery/` page, nothing in the sitemap). The photo *files* still get published to `/gallery/<city-slug>/<file>` as normal page resources. `layouts/index.html` reads `data/gallery_cities.json` for the list of slugs and calls `.Site.GetPage "/gallery/<slug>"` directly (`GetPage` works on headless pages even though `.Pages` traversal would skip them since `list: never`), then iterates `.Resources.ByType "image"`; display order comes from the numeric prefix of each filename. The folder name must still match a `slug` in `data/gallery_cities.json` (those drive the filter pills). `data/gallery_photos.json` is optional and only overrides `caption`/`alt_text`, keyed by the photo's served `image_url`. The photo array is serialized to JSON and the whole gallery (pills, strip, lightbox) is rendered client-side.

**Thumbnail / social-card image resolution is duplicated in three templates** — keep them consistent when changing the rule. The shared logic: use `.Params.featured_image` if set, else fall back to the first `<img src>` in the rendered `.Content` (via `findRE`), resolving relative paths against the page's `RelPermalink`.
- `layouts/blog/list.html` — thumbnail on the `/blog` grid (has the full featured_image-or-first-image fallback).
- `layouts/_default/baseof.html` — `og:image` / `twitter:image` for link previews (same fallback; falls back to `static/img/logo-og.png` — the logo composited onto the site's cream background at 1200×630 — for the homepage and image-less pages).
- `layouts/index.html` — homepage "Latest Articles" grid, which only honors `.Params.featured_image` (no body-image fallback), so an article with no `featured_image` shows no thumbnail there.

**Image render hook** (`layouts/_default/_markup/render-image.html`) rewrites every Markdown image: page-bundle images are resolved as page resources to emit intrinsic `width`/`height` (prevents CLS) plus `loading="lazy"`; external/root-relative images fall back to a plain lazy `<img>`. `markup.goldmark.renderer.unsafe = true` is on so raw HTML in articles is allowed.

**Categories are not real taxonomy.** `hugo.toml` sets `disableKinds = ["taxonomy", "term"]`, so `/categories/` pages are never generated. `category` front matter is just a label that the client-side JS filter on `/blog` uses. Valid values: `Technology`, `Cybersecurity`, `Personal`, `Erasmus+` — keep these exact English values in front matter regardless of the file's language; the visible label is localized via `layouts/partials/category-label.html` (see Multilingual). `Erasmus+` additionally triggers a partner strip in `layouts/blog/single.html`, which needs extra front matter (`partner_name`, `partner_url`, `partner_logo_url`, optional `project_url`, `eu_funding_text`).

**SEO/meta is centralized** in `layouts/_default/baseof.html`: canonical URL, Open Graph + Twitter cards, and JSON-LD (`Person`/`WebSite` on the homepage, `BlogPosting` on articles). Sitemap, RSS (`/blog/feed.xml`), and robots are custom output formats configured in `hugo.toml` (`[outputs]`, `[outputFormats]`).

**Forms POST to Supabase Edge Functions** (contact form in `layouts/_default/contact.html`, newsletter signup in `layouts/blog/single.html`). The Supabase anon key in the markup is public by design. To change the backend, edit the `fetch(...)` URL and `Authorization` header in those files.

**`legacy-redirect` content type forces redirects at old pre-`/en/` URLs.** 15 content files (`content/legacy-about.md`, `legacy-contact.md`, `legacy-now.md`, `legacy-privacy-policy.md`, `legacy-blog-index.md`, and `legacy-blog-<slug>.md` for each of the 10 blog posts that existed before the `/en/` migration) each set `type: "legacy-redirect"`, a `url:` front matter override (bypasses language-prefixing, forcing the page to that exact bare path), and `redirect_to:`. `layouts/legacy-redirect/single.html` renders a tiny meta-refresh + JS redirect to `redirect_to`. This exists because StaticHost's deploy doesn't prune files no longer in a build's output — without these, the old bare URLs kept serving stale pre-migration HTML at 200 instead of 404ing (which would let `static/404.html`'s generic redirect handle them). `build.list: false` keeps them out of the sitemap and the client-side search index. This is a closed, one-time list tied to URLs that already existed — a *new* blog post never had a bare-path file to begin with, so it doesn't need one of these; `static/404.html` already covers it.

**Security headers live in `static/_headers`** (served by StaticHost). The CSP `connect-src` whitelists the Supabase project and the analytics hosts — **if you add any external fetch/connection, update the CSP there** or it will be blocked in production. Analytics (Litlyx) only loads when `not hugo.IsServer`, so it never runs in the dev server.

## Multilingual (EN / FR / IT)

The site is trilingual — **English (default), French, Italian** — using Hugo's native multilingual mode with **translation by filename**. Config lives in the `[languages]` block of `hugo.toml`.

- **URLs:** `defaultContentLanguageInSubdir = true`, so every language sits under its own prefix, including English (`/en/blog/...`), French (`/fr/...`), and Italian (`/it/...`). This is required for Hugo's automatic `sitemapindex.xml` — when English instead lived at the root, its own per-language `sitemap.xml` collided with the auto-generated index at that same root path. Root `/` is a meta-refresh redirect to `/en/`; `static/404.html` and the `legacy-redirect` content type (see below) handle old pre-`/en/` links.
- **Per-language vs shared config:** language-varying settings (just `description`) live under `[languages.<lang>.params]`; the nav menu lives under `[languages.<lang>.menus.main]` using `pageRef` (so links auto-prefix the language). Everything else, including `quote` (a direct Snowden quote, deliberately not translated), stays in the shared top-level `[params]`. Each language also sets `locale` and `label` (these replaced the deprecated `languageCode`/`languageName`).
- **Translating a page = one Markdown file per language, same folder.** English keeps its plain name; add `.fr.`/`.it.` siblings. Blog post: `content/blog/<slug>/index.md` + `index.fr.md` + `index.it.md`. Standalone page: `content/about.md` + `about.fr.md` + `about.it.md`. Section index: `_index.md` + `_index.fr.md` + `_index.it.md`. Co-located **images are shared** across all language versions of a bundle — never duplicate them. Hugo auto-links same-folder/same-basename files as translations. A missing translation simply doesn't render in that language (the switcher falls back to that language's home, and a `pageRef` menu entry pointing at an untranslated page renders an empty `href`).
- **Gallery needs per-language stubs.** Because `layouts/index.html` resolves each city via the *current* language's `.Site.GetPage "/gallery/<slug>"`, every city bundle (and `gallery/_index.md`) has `index.fr.md` / `index.it.md` stubs — identical front matter, since the photos and `data/*.json` are language-neutral and shared. Add the same two stubs whenever you add a new gallery city, or the strip is empty on `/fr/` and `/it/`.
- **UI strings live in `i18n/{en,fr,it}.toml`**, referenced with `{{ i18n "key" }}`. Keys are **case-sensitive**; add every new key to all three files. Client-side JS strings (search modal in `header.html`, gallery in `index.html`, newsletter in `blog/single.html`) are injected into a `window.I18N` object via `(dict … | jsonify | safeJS)` — **the `safeJS` is required**; without it Go's html/template double-encodes the JSON into a string and `Object.assign` spreads it character-by-character.
- **Category labels are localized, category *keys* are not.** `.Params.category` stays the canonical English value (`Technology`, `Erasmus+`, …) used by the JS filter; the visible label is rendered through `layouts/partials/category-label.html`, which maps the value to `i18n "cat_<value>"`. Filter pills keep English `data-category`/onclick args and only translate the button text.
- **Dates** use `{{ .Date | time.Format ":date_long" }}` (article) or `":date_medium"` (cards, search) so they localize via each language's `locale`. Never hardcode a `"Jan 2, 2006"` layout.
- **SEO** (`baseof.html`): `<html lang>`, `og:locale` (+ `og:locale:alternate`), JSON-LD `inLanguage`, and `hreflang` alternates (incl. `x-default` → English) are all derived by looping `.AllTranslations`. The language switcher (`header.html`) links each language to the current page's translation, falling back to that language's home via `.Site.Home.AllTranslations`.
- **English-only by design:** the `404.html` copy and the contact-form validation strings in `static/js/main.js` are not translated.

## Adding content

New article: `hugo new blog/my-slug/index.md` (uses `archetypes/blog.md`, starts `draft: true`). Set the lead image as the first Markdown image in the body (becomes the thumbnail and social card), or set `featured_image` in front matter — the latter is required for the article to show a thumbnail in the homepage grid. To translate it, add `index.fr.md` / `index.it.md` in the same bundle (see Multilingual). Site-wide settings: title, social links, hero photo and résumé URL are in `hugo.toml` under the shared `[params]`; the homepage quote, meta description and nav menu are **per-language** under `[languages.<lang>]`.
