# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal website for Lorenzo Loconsole, built with **Hugo** (requires v0.158.0+; `locale` and `hugo.Data` are used). Hand-written templates and CSS — no external Hugo theme. Live at [lorenzo.loconsole.eu](https://lorenzo.loconsole.eu).

## Commands

```bash
hugo server          # dev server with live reload at http://localhost:1313
hugo --minify        # production build (rarely run by hand — see Deployment)
```

There are no tests, linters, or a build toolchain beyond Hugo itself.

## Deployment

Hosted on **StaticHost.eu**, which watches the GitHub repo: push to `main` and StaticHost runs `hugo --minify` on its own servers and serves the result. There is no CI in this repo.

**Never commit `public/` or `resources/`** — both are git-ignored. StaticHost regenerates them on every deploy; tracking them causes build conflicts. The repo holds **source only**.

## Architecture — the non-obvious parts

**`static/` has been merged into `assets/`.** There is no `static/` directory. `hugo.toml` mounts the single `assets/` folder to *both* the `assets` and `static` targets, so the same folder serves Hugo Pipes resources (`resources.Get`, e.g. the hero image processed through `.Resize`) **and** files copied verbatim to the site root (CSS at `/css/main.css`, JS, fonts, images under `/img/...`, `/cv-fr.pdf`). When the README's "Project structure" section says `static/css/main.css`, the real path is `assets/css/main.css`. Reference root-copied files by their served path (e.g. `/img/logo.svg`, `/cv-fr.pdf`), and `resources.Get`/`resources.Match` paths are relative to `assets/` (e.g. `resources.Get "img/hero.webp"`). All site images live under `assets/img/`.

**Blog posts are page bundles.** Each article is `content/blog/<slug>/index.md` with its images in the same folder. Because the section is `blog`, these render through `layouts/blog/single.html` (article) and `layouts/blog/list.html` (the `/blog` index). The bundle's images are page resources, which the image render hook (below) uses to emit real dimensions.

**Gallery photos are headless page bundles, not assets.** Each city is `content/gallery/<city-slug>/index.md` (plus `content/gallery/_index.md` for the section) with its photos co-located as page resources — same pattern as blog bundles, but every one of these has `build: { render: never, list: never }` in front matter, so Hugo never generates an HTML page for them or lists them anywhere (no `/gallery/` page, nothing in the sitemap). The photo *files* still get published to `/gallery/<city-slug>/<file>` as normal page resources. `layouts/index.html` reads `data/gallery_cities.json` for the list of slugs and calls `.Site.GetPage "/gallery/<slug>"` directly (`GetPage` works on headless pages even though `.Pages` traversal would skip them since `list: never`), then iterates `.Resources.ByType "image"`; display order comes from the numeric prefix of each filename. The folder name must still match a `slug` in `data/gallery_cities.json` (those drive the filter pills). `data/gallery_photos.json` is optional and only overrides `caption`/`alt_text`, keyed by the photo's served `image_url`. The photo array is serialized to JSON and the whole gallery (pills, strip, lightbox) is rendered client-side.

**Thumbnail / social-card image resolution is duplicated in three templates** — keep them consistent when changing the rule. The shared logic: use `.Params.featured_image` if set, else fall back to the first `<img src>` in the rendered `.Content` (via `findRE`), resolving relative paths against the page's `RelPermalink`.
- `layouts/blog/list.html` — thumbnail on the `/blog` grid (has the full featured_image-or-first-image fallback).
- `layouts/_default/baseof.html` — `og:image` / `twitter:image` for link previews (same fallback; falls back to the site hero for the homepage and image-less pages).
- `layouts/index.html` — homepage "Latest Articles" grid, which only honors `.Params.featured_image` (no body-image fallback), so an article with no `featured_image` shows no thumbnail there.

**Image render hook** (`layouts/_default/_markup/render-image.html`) rewrites every Markdown image: page-bundle images are resolved as page resources to emit intrinsic `width`/`height` (prevents CLS) plus `loading="lazy"`; external/root-relative images fall back to a plain lazy `<img>`. `markup.goldmark.renderer.unsafe = true` is on so raw HTML in articles is allowed.

**Categories are not real taxonomy.** `hugo.toml` sets `disableKinds = ["taxonomy", "term"]`, so `/categories/` pages are never generated. `category` front matter is just a label that the client-side JS filter on `/blog` uses. Valid values: `Technology`, `Cybersecurity`, `Personal`, `Erasmus+` — keep these exact English values in front matter regardless of the file's language; the visible label is localized via `layouts/partials/category-label.html` (see Multilingual). `Erasmus+` additionally triggers a partner strip in `layouts/blog/single.html`, which needs extra front matter (`partner_name`, `partner_url`, `partner_logo_url`, optional `project_url`, `eu_funding_text`).

**SEO/meta is centralized** in `layouts/_default/baseof.html`: canonical URL, Open Graph + Twitter cards, and JSON-LD (`Person`/`WebSite` on the homepage, `BlogPosting` on articles). Sitemap, RSS (`/blog/feed.xml`), and robots are custom output formats configured in `hugo.toml` (`[outputs]`, `[outputFormats]`).

**Forms POST to Supabase Edge Functions** (contact form in `layouts/_default/contact.html`, newsletter signup in `layouts/blog/single.html`). The Supabase anon key in the markup is public by design. To change the backend, edit the `fetch(...)` URL and `Authorization` header in those files.

**Security headers live in `assets/_headers`** (served by StaticHost). The CSP `connect-src` whitelists the Supabase project and the analytics hosts — **if you add any external fetch/connection, update the CSP there** or it will be blocked in production. Analytics (Litlyx) only loads when `not hugo.IsServer`, so it never runs in the dev server.

## Multilingual (EN / FR / IT)

The site is trilingual — **English (default), French, Italian** — using Hugo's native multilingual mode with **translation by filename**. Config lives in the `[languages]` block of `hugo.toml`.

- **URLs:** `defaultContentLanguageInSubdir = false`, so English stays at the root (`/blog/...`) while French is under `/fr/...` and Italian under `/it/...`. Don't reintroduce an `/en/` prefix — it would break existing English URLs and their SEO.
- **Per-language vs shared config:** language-varying settings (`description`, `quote`) live under `[languages.<lang>.params]`; the nav menu lives under `[languages.<lang>.menus.main]` using `pageRef` (so links auto-prefix the language). Everything else stays in the shared top-level `[params]`. Each language also sets `locale` and `label` (these replaced the deprecated `languageCode`/`languageName`).
- **Translating a page = one Markdown file per language, same folder.** English keeps its plain name; add `.fr.`/`.it.` siblings. Blog post: `content/blog/<slug>/index.md` + `index.fr.md` + `index.it.md`. Standalone page: `content/about.md` + `about.fr.md` + `about.it.md`. Section index: `_index.md` + `_index.fr.md` + `_index.it.md`. Co-located **images are shared** across all language versions of a bundle — never duplicate them. Hugo auto-links same-folder/same-basename files as translations. A missing translation simply doesn't render in that language (the switcher falls back to that language's home, and a `pageRef` menu entry pointing at an untranslated page renders an empty `href`).
- **Gallery needs per-language stubs.** Because `layouts/index.html` resolves each city via the *current* language's `.Site.GetPage "/gallery/<slug>"`, every city bundle (and `gallery/_index.md`) has `index.fr.md` / `index.it.md` stubs — identical front matter, since the photos and `data/*.json` are language-neutral and shared. Add the same two stubs whenever you add a new gallery city, or the strip is empty on `/fr/` and `/it/`.
- **UI strings live in `i18n/{en,fr,it}.toml`**, referenced with `{{ i18n "key" }}`. Keys are **case-sensitive**; add every new key to all three files. Client-side JS strings (search modal in `header.html`, gallery in `index.html`, newsletter in `blog/single.html`) are injected into a `window.I18N` object via `(dict … | jsonify | safeJS)` — **the `safeJS` is required**; without it Go's html/template double-encodes the JSON into a string and `Object.assign` spreads it character-by-character.
- **Category labels are localized, category *keys* are not.** `.Params.category` stays the canonical English value (`Technology`, `Erasmus+`, …) used by the JS filter; the visible label is rendered through `layouts/partials/category-label.html`, which maps the value to `i18n "cat_<value>"`. Filter pills keep English `data-category`/onclick args and only translate the button text.
- **Dates** use `{{ .Date | time.Format ":date_long" }}` (article) or `":date_medium"` (cards, search) so they localize via each language's `locale`. Never hardcode a `"Jan 2, 2006"` layout.
- **SEO** (`baseof.html`): `<html lang>`, `og:locale` (+ `og:locale:alternate`), JSON-LD `inLanguage`, and `hreflang` alternates (incl. `x-default` → English) are all derived by looping `.AllTranslations`. The language switcher (`header.html`) links each language to the current page's translation, falling back to that language's home via `.Site.Home.AllTranslations`.
- **English-only by design:** the `404.html` copy and the contact-form validation strings in `assets/js/main.js` are not translated.

## Adding content

New article: `hugo new blog/my-slug/index.md` (uses `archetypes/blog.md`, starts `draft: true`). Set the lead image as the first Markdown image in the body (becomes the thumbnail and social card), or set `featured_image` in front matter — the latter is required for the article to show a thumbnail in the homepage grid. To translate it, add `index.fr.md` / `index.it.md` in the same bundle (see Multilingual). Site-wide settings: title, social links, hero photo and résumé URL are in `hugo.toml` under the shared `[params]`; the homepage quote, meta description and nav menu are **per-language** under `[languages.<lang>]`.
