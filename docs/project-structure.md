# Project Structure

```
hugo.toml                  → site config (title, social links, params, menu)

content/
  about.md, now.md, contact.md, privacy-policy.md   → static pages (raw HTML in Markdown)
  blog/
    _index.md              → /blog section settings
    <slug>/index.md        → one page bundle per article, images co-located
  gallery/
    _index.md              → headless section index (build: render/list: never)
    <city-slug>/index.md   → one headless page bundle per city, photos co-located

data/
  gallery_cities.json      → gallery city tabs
  gallery_photos.json      → optional caption/alt_text overrides for gallery photos

assets/                    → mounted to BOTH the `assets` and `static` Hugo targets — there is
                              no separate `static/` folder. Files here are served verbatim at
                              the site root (e.g. `assets/css/main.css` → `/css/main.css`) AND
                              available to Hugo Pipes (`resources.Get`, `resources.Match`).
  css/main.css             → all styles
  js/main.js               → mobile menu, fade-in animations, search, contact form submit
  js/litlyx.js             → self-hosted analytics snippet
  hero.webp / hero.jpeg    → homepage hero photo (processed via resources.Get/.Resize)
  logo.svg                 → brand logo (navbar + footer)
  cv-fr.pdf                → downloadable CV (params.resumeUrl)
  favicon.svg, apple-touch.png
  404page.png              → illustration on the 404 page
  contact-chill.gif        → animation on the Contact page
  eufunded.png             → shared EU-funding badge for Erasmus+ articles
  _headers                 → security headers (CSP, etc.), read by StaticHost

layouts/
  index.html               → homepage (hero, quote, gallery, latest articles)
  404.html                 → custom 404 page
  robots.txt, sitemap.xml  → custom output formats
  _default/
    baseof.html            → base template + all SEO/meta/structured data
    single.html            → generic page template (just outputs .Content) — used by
                              about/now/contact/privacy-policy
    rss.xml                → custom RSS feed
    _markup/render-image.html → Markdown image render hook (intrinsic width/height, lazy loading)
  blog/
    list.html              → blog index (/blog) with category filters
    single.html             → individual article (share buttons, newsletter form, partner strip)
  partials/
    header.html            → navigation + search modal
    footer.html             → footer with social links
    theme-toggle.html       → dark/light mode switch
```

See [Site Settings](site-settings.md), [Writing Articles](writing-articles.md), [Photo Gallery](photo-gallery.md), and [Forms & Email](forms-and-email.md) for what to actually edit in each area.
