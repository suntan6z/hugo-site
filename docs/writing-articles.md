# Writing Articles

Each article is a page bundle — a folder under `content/blog/` containing an `index.md` and any images it uses:

```bash
hugo new blog/my-article-slug/index.md
```

This uses `archetypes/blog.md` and starts the article as `draft: true`. Edit the frontmatter, write the body in Markdown, then set `draft: false` to publish.

## Frontmatter

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

**Valid `category` values** (these match the filter buttons on `/blog`): `Technology`, `Cybersecurity`, `Personal`, `Erasmus+`. Using `"Erasmus+"` also triggers the EU partner strip (see below).

## The lead / thumbnail image

Put the main image as the **first Markdown image in the body** — the blog listing, the homepage's "Latest Articles" grid (when `featured_image` is set), and the social-share preview (`og:image`/`twitter:image`) all use it as a fallback thumbnail:

```markdown
![Descriptive alt text](my-image.jpg)
```

Since the article is a page bundle, just drop `my-image.jpg` in the same folder as `index.md` and reference it by filename — no need for a leading slash.

Optionally, set the thumbnail explicitly in frontmatter instead — any path Hugo can resolve works, including a filename in the same bundle:

```yaml
featured_image: "my-image.jpg"
```

This is **required** if you want the article to show a thumbnail in the homepage "Latest Articles" grid — that grid only honors `featured_image`, it doesn't fall back to the first body image like the blog listing does.

## Erasmus+ articles — extra frontmatter

Articles with `category: "Erasmus+"` show a partner strip (partner logo + EU co-funded badge) at the top of the article. Add:

```yaml
partner_name: "Les Schini's"
partner_url: "https://www.lesschinis.com"
partner_logo_url: "partnerlogo.png"          # filename of a logo placed in this article's own bundle
project_url: "https://youthincontact.wixsite.com/project"   # optional — shows a "Project website" link
eu_funding_text: "Co-funded by the European Union under the Erasmus+ programme."
```

Place the partner's logo file directly in the article's bundle folder alongside `index.md` (e.g. `content/blog/my-slug/partnerlogo.png`) and reference it by filename in `partner_logo_url`. The generic EU-funding badge itself is shared across all Erasmus+ articles and lives at `assets/eufunded.png` — you don't need to add that one yourself.
