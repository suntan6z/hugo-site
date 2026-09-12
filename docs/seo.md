# SEO

## Before publishing

The portal checks every article before it can go public: description length, title length, alt text on every image, `featured_image`, the slug matching its folder, internal links pointing at articles that exist, and a date that is not in the future. Problems that would damage the published page **block publishing**; the rest are suggestions and never block. Ticking *Draft* skips the checks entirely — work in progress is meant to be incomplete.

After a deploy goes live, the dashboard submits the changed URLs to **IndexNow** (Bing and friends). It waits for the rebuild deliberately: submitting at publish time would point crawlers at a URL that still 404s. **Search** in the portal shows what Bing reports for the site.

## How the markup is produced

- `layouts/_default/baseof.html` outputs canonical URLs, Open Graph + Twitter cards, and JSON-LD structured data (`Person`/`WebSite` on the homepage, `BlogPosting` on articles).
- The social-share image (`og:image`/`twitter:image`) uses an article's `featured_image` or its first body image when available, falling back to the site hero photo otherwise. See [Writing Articles](writing-articles.md).
- Sitemap is at `/sitemap.xml`, RSS at `/blog/feed.xml`, robots at `/robots.txt` — all custom output formats configured in `hugo.toml` (`[outputs]`, `[outputFormats]`).
- After deploying, submit the sitemap in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters).
