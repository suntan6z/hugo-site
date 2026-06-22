# Lorenzo Loconsole — Hugo Site

Personal website built with [Hugo](https://gohugo.io/), hosted on [StaticHost.eu](https://www.statichost.eu).
Live at **[lorenzo.loconsole.eu](https://lorenzo.loconsole.eu)**.

---

## Local development

```bash
# Install Hugo — requires v0.158.0+ (the site uses `locale` and `hugo.Data`)
brew install hugo

# Run the dev server with live reload
hugo server

# Open http://localhost:1313
```

A production build is generated with `hugo --minify`, but you normally don't run this
by hand — see deployment below.

---

## Deployment

**Push to `main` and you're done.** StaticHost.eu watches the GitHub repo, runs
`hugo --minify` on its own servers, and serves the result.

```bash
git add -A
git commit -m "Describe your change"
git push
```

> ⚠️ **Do not commit the `public/` folder.** It is in `.gitignore` on purpose —
> StaticHost regenerates it on every deploy. Tracking it causes build conflicts.
> The git repo holds **source only** (content, layouts, static assets, config).

---

## Adding a blog article

Each article is a folder under `content/blog/` containing an `index.md`:

```bash
hugo new blog/my-article-slug/index.md
```

This uses `archetypes/blog.md` and starts the article as `draft: true`. Edit the
frontmatter, write the body in Markdown, then set `draft: false` to publish.

### Frontmatter

```yaml
---
title: "My Article Title"
date: 2026-06-21
slug: "my-article-slug"
category: "Technology"        # see valid categories below
description: "One-sentence summary — used for SEO, the blog listing, and social cards."
draft: false
---
```

**Valid `category` values** (these match the filter buttons on `/blog`):
`Technology`, `Cybersecurity`, `Personal`, `Erasmus+`.
Using `"Erasmus+"` also triggers the EU partner strip (see below).

### The lead / thumbnail image

Put the main image as the **first Markdown image in the body** — the blog listing
automatically uses it as the thumbnail:

```markdown
![Descriptive alt text](/images/blog/my-image.jpg)
```

Optionally, you can instead set it explicitly in frontmatter. This is **required**
if you want the article to show a thumbnail in the homepage "Latest articles" grid:

```yaml
featured_image: "/images/blog/my-image.jpg"
```

Store article images in `static/images/` and reference them as `/images/...`.

### Erasmus+ articles — extra frontmatter

Articles with `category: "Erasmus+"` show a partner strip (partner logo + EU
co-funded badge) at the top of the article. Add:

```yaml
partner_name: "Les Schini's"
partner_url: "https://www.lesschinis.com"
partner_logo_url: "/images/erasmus/lesschinislogo.png"
project_url: "https://youthincontact.wixsite.com/project"   # optional — shows a "Project website" link
eu_funding_text: "Co-funded by the European Union under the Erasmus+ programme."
```

Partner logos live in `static/images/erasmus/`.

---

## The photo gallery

The homepage gallery is driven entirely by **two JSON files** plus image folders.

### How it's organised

```
data/
  gallery_cities.json        → the city filter tabs (name, slug, flag)
  gallery_photos.json        → one entry per photo (city, image_url, caption, alt_text)

static/gallery/
  paris/   1.jpg 2.jpg …      → photo files, one folder per city
  bari/    1.jpg 2.jpg …
```

The `city` value in a photo entry must match a `slug` in `gallery_cities.json` —
that's how the filter tabs know which photos to show. A city listed without any
photos shows a friendly "Photos coming soon" placeholder.

### Adding photos for a city

1. **Drop the files** into `static/gallery/<city-slug>/`, named `1.jpg`, `2.jpg`, …
   (e.g. `static/gallery/barcelona/1.jpg`).

2. **Make sure the city exists** in `data/gallery_cities.json`. If it's new, add a line:

   ```json
   { "name": "Barcelona", "slug": "barcelona", "flag": "🇪🇸" }
   ```

3. **Add each photo** to `data/gallery_photos.json`:

   ```json
   { "city": "barcelona", "image_url": "/gallery/barcelona/1.jpg", "caption": "Sagrada Família", "alt_text": "Detailed description for accessibility and SEO" },
   { "city": "barcelona", "image_url": "/gallery/barcelona/2.jpg", "caption": "Gothic Quarter",   "alt_text": "…" }
   ```

That's it — no template changes needed.

---

## Updating site-wide settings

Edit `hugo.toml`:

| Key | What it controls |
|-----|-----------------|
| `title` | Site title (used in `<title>`, footer, structured data) |
| `params.description` | Default meta description |
| `params.email` | Email address shown on the Contact page |
| `params.linkedin` / `params.mastodon` / `params.telegram` / `params.appleMusic` | Footer social links |
| `params.heroPhoto` | Path to the homepage hero image |
| `params.resumeUrl` | Path to the downloadable CV |
| `params.quote` / `params.quoteAuthor` / `params.quoteArticle` | Quote shown on the homepage and the article it links to |
| `menu.main` | Navigation items and their order |

Static pages (`About`, `Now`, `Contact`, `Privacy Policy`) are edited via their
Markdown files in `content/` and their layouts in `layouts/_default/`.

---

## Forms

Both forms POST to Supabase Edge Functions (the anon key in the markup is public by
design and safe to expose):

- **Contact form** — `layouts/_default/contact.html`
- **Newsletter signup** — `layouts/blog/single.html`

To change the backend, update the `fetch(...)` URL and `Authorization` header in
those files.

---

## Project structure

```
hugo.toml                  → site config (title, social links, params, menu)

content/
  about.md, now.md, contact.md, privacy-policy.md   → static pages
  blog/<slug>/index.md     → one folder per article

data/
  gallery_cities.json      → gallery city tabs
  gallery_photos.json      → gallery photo entries

static/
  css/main.css             → all styles
  js/main.js               → mobile menu, fade-in animations, hero tilt
  hero-portrait.png        → homepage hero photo
  cv-fr.pdf                → downloadable CV (params.resumeUrl)
  favicon.ico, favicon.svg → favicons
  apple-touch.png          → iOS home-screen icon
  logo.svg                 → brand logo (navbar)
  gallery/<city>/*.jpg     → gallery photos
  images/
    404page.png            → illustration on the 404 page
    contact-chill.gif      → animation on the Contact page
    erasmus/               → Erasmus+ partner logos + EU badge
    blog/                  → article images (create this folder when you add your first)

layouts/
  index.html               → homepage (hero, quote, gallery, latest articles)
  404.html                 → custom 404 page
  _default/
    baseof.html            → base template + all SEO/meta/structured data
    about.html, now.html, contact.html, privacy-policy.html
    rss.xml                → custom RSS feed
  blog/
    list.html              → blog index (/blog) with category filters
    single.html            → individual article (share buttons, newsletter, partner strip)
  partials/
    header.html            → navigation + search modal
    footer.html            → footer with social links
```

---

## SEO notes

- `baseof.html` outputs canonical URLs, Open Graph + Twitter cards, JSON-LD
  structured data (`Person`/`WebSite` on the homepage, `BlogPosting` on articles),
  and favicon links.
- Sitemap is at `/sitemap.xml`, RSS at `/blog/feed.xml`, robots at `/robots.txt`.
- After deploying, submit the sitemap in
  [Google Search Console](https://search.google.com/search-console).
