# SEO

- `layouts/_default/baseof.html` outputs canonical URLs, Open Graph + Twitter cards, and JSON-LD structured data (`Person`/`WebSite` on the homepage, `BlogPosting` on articles).
- The social-share image (`og:image`/`twitter:image`) uses an article's `featured_image` or its first body image when available, falling back to the site hero photo otherwise. See [Writing Articles](writing-articles.md).
- Sitemap is at `/sitemap.xml`, RSS at `/blog/feed.xml`, robots at `/robots.txt` — all custom output formats configured in `hugo.toml` (`[outputs]`, `[outputFormats]`).
- After deploying, submit the sitemap in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters).
