# Writing Articles

## In the portal (the normal way)

[admin.loconsole.eu](https://admin.loconsole.eu) → **Articles** → **New article**. Give it a title, date, category and one-sentence description; it is created as a draft, so nothing is public yet.

Then, in the editor:

- **Write** in Markdown, with **Split** or **Preview** showing the article rendered in the site's own stylesheet — fonts, colours and layout as readers will see them. The preview is close but not identical; the live site is the reference.
- **Your work is saved as you type** — first in the browser, then to your account a few seconds later. Neither is a commit, so it costs nothing. Come back later, from any device, and the editor offers to restore it.
- **Images**: drop them in and they are resized, converted to WebP and stripped of EXIF (including GPS) in your browser before upload. Give each one alt text. They are committed together with the text, never separately.
- **French and Italian** have their own tabs. **Draft from English** fills a tab with a DeepL translation for you to correct — file names, links and formatting are protected from the translator. Nothing is saved until you save it.
- **Review changes** shows the exact commit — every file, every changed line — before you make it.
- **Publish** runs the pre-publish checks (see [SEO](seo.md)). Problems that would damage the published page block it; suggestions never do. Save keeps it as a draft.

The dashboard then tracks the rebuild: *Publishing… → Live*.

**Changing the address** of an article — the editor's *Change the web address* — moves the whole bundle, updates every language, repoints links from other articles, and leaves a redirect at the old address so existing links and newsletters keep working. Leave that redirect on unless you know the old URL was never shared.

**Deleting** asks you to type the slug, and removes every language file and image. Recoverable only from git history.

## By hand

The portal writes exactly what follows, so both stay compatible.

```bash
hugo new blog/my-article-slug/index.md
```

This uses `archetypes/blog.md` and starts the article as `draft: true`. Each article is a page bundle — a folder under `content/blog/` holding `index.md` and the images it uses.

### Front matter

```yaml
---
title: "My Article Title"
date: 2026-06-21
slug: "my-article-slug"
category: "Technology"        # see valid values below
draft: false
description: "One-sentence summary — used for SEO, the blog listing, and social cards."
---
```

Keep that key order: the whole corpus, the archetype and the portal's serializer all agree on it, and the portal edits front matter line by line rather than rewriting it, so hand-written files keep their exact formatting and comments.

**Valid `category` values** (they match the filter buttons on `/blog`): `Technology`, `Cybersecurity`, `Personal`, `Erasmus+`. Keep the English value whatever the file's language — the visible label is translated separately. `Erasmus+` also triggers the partner strip (below).

### The lead / thumbnail image

Put the main image as the **first Markdown image in the body**; it becomes the thumbnail on the homepage and the blog listing, the social-share preview and the newsletter picture:

```markdown
![Descriptive alt text](my-image.jpg)
```

The article is a page bundle, so drop `my-image.jpg` next to `index.md` and reference it by filename — no leading slash.

To use a different image than the first one, click **Use as thumbnail** under it in the editor's Images panel, or set it by hand:

```yaml
featured_image: "my-image.jpg"
```

Only needed when the first image is not the one you want. An article with no image at all simply has no thumbnail.

### Translations

Add `index.fr.md` / `index.it.md` in the same folder. Images are shared across languages — never duplicate them. A missing translation is fine: Hugo generates a "not yet translated" page automatically, so an empty stub is worse than no file at all.

### Erasmus+ articles — extra front matter

Articles with `category: "Erasmus+"` show a partner strip (partner logo + EU co-funded badge) at the top. Add:

```yaml
partner_name: "Les Schini's"
partner_url: "https://www.lesschinis.com"
partner_logo_url: "partnerlogo.png"          # a logo file in this article's own bundle
project_url: "https://youthincontact.wixsite.com/project"   # optional — shows a "Project website" link
eu_funding_text: "Co-funded by the European Union under the Erasmus+ programme."
```

Place the partner's logo in the article's own folder next to `index.md`. The generic EU badge is shared across all Erasmus+ articles and lives at `static/img/eufunded.png` — you never add that one yourself.
