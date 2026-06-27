# Photo Gallery

The homepage gallery auto-discovers photos from `content/gallery/<city-slug>/` at build time — just drop image files into a city's folder and they show up, no JSON editing required. `data/gallery_photos.json` is optional and only used to override the caption/alt text of specific photos.

## How it's organised

```
data/
  gallery_cities.json        → the city filter tabs (name, slug, flag)
  gallery_photos.json        → optional caption/alt_text overrides, keyed by image_url

content/gallery/
  _index.md                  → headless section index (never rendered as a page)
  paris/index.md             → one page bundle per city, photos co-located alongside index.md
  paris/1.jpg 2.jpg …
  bari/index.md
  bari/1.jpg 2.jpg …
```

Each city folder is a Hugo page bundle (same pattern as a blog post), but its `index.md` front matter sets `build: { render: never, list: never }`. That means Hugo never generates an HTML page for it and never lists it anywhere (no `/gallery/` page on the site, nothing in the sitemap) — but it still publishes the photo files themselves to `/gallery/<city-slug>/<file>`, which is the URL the homepage gallery and `data/gallery_photos.json` reference.

The folder name must match a `slug` in `gallery_cities.json` — that's how the filter tabs know which photos to show. A city listed without any photos shows a friendly "Photos coming soon" placeholder.

## Adding a new city

1. Add a line to `data/gallery_cities.json`:

   ```json
   { "name": "Barcelona", "slug": "barcelona", "flag": "🇪🇸" }
   ```

2. Create `content/gallery/barcelona/index.md` with:

   ```yaml
   ---
   title: "Barcelona"
   build:
     render: never
     list: never
   ---
   ```

## Adding photos for a city

Drop the files into `content/gallery/<city-slug>/` alongside that city's `index.md` (e.g. `content/gallery/barcelona/1.jpg`). Any common image extension works (`.jpg`, `.jpeg`, `.png`). Numbering them `1.jpg`, `2.jpg`, … controls the display order; files without a leading number are shown after the numbered ones. No template changes needed — the photos appear automatically on the next build.

## Captions and alt text (optional)

To give a specific photo a caption or custom alt text, add an entry to `data/gallery_photos.json` keyed by its `image_url`:

```json
{ "city": "barcelona", "image_url": "/gallery/barcelona/1.jpg", "caption": "Sagrada Família", "alt_text": "Detailed description for accessibility and SEO" }
```

Photos without a matching entry get a generic alt text and no caption.
