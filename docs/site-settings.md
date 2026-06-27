# Site Settings

Most site-wide settings live in `hugo.toml` under `[params]` and `[menu]`:

| Key | What it controls |
|-----|-------------------|
| `title` | Site title (used in `<title>`, footer, structured data) |
| `params.description` | Default meta description |
| `params.email` | Contact email address |
| `params.linkedin` / `params.mastodon` / `params.telegram` / `params.appleMusic` | Social links |
| `params.resumeUrl` | Path to the downloadable CV (served from `assets/`, e.g. `/cv-fr.pdf`) |
| `params.quote` / `params.quoteAuthor` / `params.quoteArticle` | Quote shown on the homepage and the article it links to |
| `params.litlyxProjectId` / `params.litlyxBrokerHost` | Self-hosted Litlyx analytics config (only loads outside the dev server) |
| `menu.main` | Navigation items and their order |

The homepage hero image is `assets/hero.webp` (referenced directly in templates, not via a config param).

Static pages — `About`, `Now`, `Contact`, `Privacy Policy` — are plain Markdown files in `content/` with raw HTML in the body (Hugo's unsafe HTML rendering is enabled for this). There's no per-page layout for them; they render through the generic `layouts/_default/single.html`, which just outputs `.Content`.
