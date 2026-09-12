# Documentation

Practical guides for running this site. The top-level [README](../README.md) explains what the project *is* — start here for anything hands-on.

**Most day-to-day work happens in the admin portal at [admin.loconsole.eu](https://admin.loconsole.eu)**, not in a code editor: writing and translating articles, adding gallery photos, editing interface strings, sending the newsletter. These guides cover the portal first and the underlying files second, because the files are still the truth — the portal just writes them for you.

- [Local Development](local-development.md) — run the site, and the portal, on your Mac
- [Writing Articles](writing-articles.md) — in the portal, and by hand
- [Photo Gallery](photo-gallery.md) — cities, photos, captions and alt text
- [Site Settings](site-settings.md) — `hugo.toml`, interface strings, static pages
- [Forms & Email](forms-and-email.md) — contact form, newsletter signup, broadcasts
- [Project Structure](project-structure.md) — map of the repo
- [SEO](seo.md) — meta tags, sitemap, pre-publish checks, IndexNow
- [Deployment](deployment.md) — what ships where, and how to tell it worked

The portal's own ops doc lives next to the portal, not here: [`admin/DEPLOY.md`](../admin/DEPLOY.md) — secrets, optional integration keys, the expiry to diarise, and the lockout ladder. [CLAUDE.md](../CLAUDE.md) is the architectural reference, written for whoever (or whatever) is editing the code.
