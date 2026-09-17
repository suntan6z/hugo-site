# Site Settings

## Interface strings

Every visible string that is not article text — button labels, section headings, the newsletter box, the search modal — lives in `i18n/{en,fr,it}.toml`. Edit them in the portal under **Strings**: it shows all three languages side by side and refuses to save unless a key exists in every one, which is the failure mode worth guarding (a key missing from `it.toml` renders as an empty string on the Italian site, silently).

By hand: add the key to all three files. Keys are case-sensitive.

## `hugo.toml`

In the portal, **Settings** edits the homepage quote (and the article it links to), each language's description, the social links, the homepage photo and the CV file — rewriting only the lines that change. Everything else below is edited by hand.

Site-wide settings live under `[params]` and `[menu]`:

| Key | What it controls |
|-----|-------------------|
| `title` | Site title (used in `<title>`, footer, structured data) |
| `params.description` | Default meta description |
| `params.email` | Contact email address |
| `params.linkedin` / `params.mastodon` / `params.telegram` / `params.appleMusic` | Social links |
| `params.resumeUrl` | Path to the downloadable CV (served from `static/`, e.g. `/cv-fr.pdf`) |
| `params.quote` / `params.quoteAuthor` / `params.quoteArticle` | Quote shown on the homepage and the article it links to |
| `params.litlyxProjectId` / `params.litlyxBrokerHost` | Self-hosted Litlyx analytics config (only loads outside the dev server) |
| `menu.main` | Navigation items and their order |

Per-language settings — the meta description, the homepage quote and the nav menu — live under `[languages.<lang>]` instead, not in the shared `[params]`.

The homepage hero image is `assets/img/hero.webp` plus `hero.jpeg` (the fallback and social-preview source), referenced directly in templates, not via a config param. Replace both together — the portal's Settings does.

Static pages — `About`, `Now`, `Contact`, `Privacy Policy` — are plain Markdown files in `content/` with raw HTML in the body (Hugo's unsafe HTML rendering is enabled for this). There's no per-page layout for them; they render through the generic `layouts/_default/single.html`, which just outputs `.Content`. The portal edits them under **Pages**, as HTML with a live preview and history. On Contact, keep every element `id`: `static/js/main.js` finds the form's fields by id, and a page missing one fails to send.
