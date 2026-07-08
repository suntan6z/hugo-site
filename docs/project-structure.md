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

assets/                    → Hugo Pipes sources only — files here are processed by a template
                              (`resources.Get`, `.Resize`, …) rather than served as-is.
  img/hero.webp            → homepage hero photo, modern browsers (resources.Get/.Resize)
  img/hero.jpeg            → same photo, JPEG: <picture> fallback for non-WebP browsers,
                              and source for the og:image/JSON-LD JPEG

static/                    → copied verbatim to the site root, no processing.
  css/main.css             → all styles
  js/main.js               → mobile menu, fade-in animations, search, contact form submit
  js/litlyx.js             → self-hosted analytics snippet
  cv-fr.pdf                → downloadable CV (params.resumeUrl)
  _headers                 → security headers (CSP, etc.), read by StaticHost
  404.html                 → root-level 404 StaticHost requires; redirects bare/unprefixed
                              paths (e.g. /about) to their /en/ equivalent
  img/                     → all other site images
    logo.svg               → brand logo (navbar + footer)
    logo-og.png             → logo rasterized at 1200×630 on the site's cream background;
                              fallback social-card image (baseof.html) for pages with no
                              featured/content image. Hugo can't rasterize SVG itself, so
                              this is a one-off manual export, not Pipes-generated — re-export
                              it by hand if logo.svg ever changes.
    favicon.svg/.png/.ico  → site favicon (svg + png + ico for max compatibility)
    apple-touch.png        → iOS home-screen icon (180×180, opaque cream bg)
    404page.png            → illustration on the 404 page
    contact-chill.gif      → animation on the Contact page
    eufunded.png           → shared EU-funding badge for Erasmus+ articles

functions/                 → Scaleway Functions (contact + newsletter API), deployed independently
                              of the Hugo build via functions/deploy.sh — see forms-and-email.md

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
