# Lorenzo Loconsole — Hugo Site

Personal website built with [Hugo](https://gohugo.io/), hosted on [StaticHost.eu](https://www.statichost.eu).  
Converted from the original Lovable/React project.

---

## Local development

```bash
# Install Hugo (requires v0.147.0+)
brew install hugo

# Run the dev server
hugo server

# Open http://localhost:1313
```

## Build for production

```bash
hugo --minify
```

The output goes into `public/` — upload that folder to StaticHost.eu (or point their build pipeline at this repo with the command above).

---

## Before going live — checklist

- [ ] **Hero photo**: `static/hero-portait.png` is already in place. Replace it if you have a new one (keep the same filename, or update `heroPhoto` in `hugo.toml`).
- [ ] **CV/Résumé**: add `cvloconsole-fr.pdf` to `static/` so the résumé link works.
- [ ] **Contact form backend**: the contact form in `layouts/_default/contact.html` still has a `YOUR_SUPABASE_URL` placeholder. Replace it with your actual endpoint (Supabase, Resend, Formspree, or any other service).
- [ ] **Newsletter form**: same — `layouts/blog/single.html` has a `YOUR_SUPABASE_URL` placeholder for the newsletter subscription endpoint.
- [ ] **Gallery photos**: `data/gallery_photos.json` is currently a placeholder. Fill it in with your actual photo URLs.
- [ ] **Google Search Console**: once live, go to [search.google.com/search-console](https://search.google.com/search-console), verify ownership, and submit `/sitemap.xml`.

---

## Project structure

```
hugo.toml                  → site config (title, social links, params)

content/
  about.md                 → About page (layout handled by layouts/_default/about.html)
  now.md                   → Now page
  contact.md               → Contact page
  privacy-policy.md        → Privacy Policy page
  blog/
    <slug>/
      index.md             → one file per article (title, date, category, featured image, body)

data/
  gallery_cities.json      → city labels for the photo gallery
  gallery_photos.json      → photo URLs for the gallery (fill this in)

static/
  css/main.css             → all styles
  js/main.js               → interactions (mobile menu, gallery, etc.)
  hero-portait.png         → homepage hero photo
  img/
    404page.png            → illustrated character on the 404 page
    contact-chill.gif      → animated GIF on the Contact page
    erasmus/
      eufundedlogo.png     → EU co-funded badge for Erasmus+ articles

layouts/
  index.html               → homepage
  404.html                 → custom 404 page
  _default/
    baseof.html            → base template (wraps every page)
    about.html             → About page layout
    now.html               → Now page layout
    contact.html           → Contact page layout
    privacy-policy.html    → Privacy Policy layout
  blog/
    list.html              → blog index (/blog)
    single.html            → individual article
  partials/
    header.html            → navigation + search modal
    footer.html            → footer with social links
```

---

## Adding a blog article

Create a new folder under `content/blog/` with an `index.md` inside:

```bash
hugo new blog/my-article-slug/index.md
```

Minimal frontmatter:

```yaml
---
title: "My Article Title"
date: 2026-06-21
description: "One-sentence summary shown in the blog listing."
category: "Tech"          # shown as a tag; use "Erasmus+" to trigger the EU partner strip
featured_image: "/img/blog/my-image.jpg"
excerpt: "Longer teaser shown under the title on the article page."
---
```

### Erasmus+ articles — extra frontmatter

Articles with `category: "Erasmus+"` automatically show a partner strip at the bottom of the article. Add these fields:

```yaml
partner_name: "Association La Villa"
partner_url: "https://la-villa.org/"
partner_logo_url: "/img/partners/la-villa.png"
eu_funding_text: "Co-funded by the European Union under the Erasmus+ programme."
```

---

## Updating site-wide settings

Edit `hugo.toml` to change:

| Key | What it controls |
|-----|-----------------|
| `params.email` | Email address shown in the footer |
| `params.linkedin` | LinkedIn profile URL |
| `params.mastodon` | Mastodon profile URL |
| `params.telegram` | Telegram link |
| `params.appleMusic` | Apple Music profile URL |
| `params.heroPhoto` | Path to the homepage hero image |
| `params.resumeUrl` | Path to the downloadable CV |
| `params.quote` / `params.quoteAuthor` | Quote shown on the homepage |
| `menu.main` | Navigation items and their order |
