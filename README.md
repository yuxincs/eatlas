# Eatlas

Eatlas is a map-first food guide web app where we curate standout places to eat with ratings, notes, and quick reservation links, such that it can be easily shared with friends and families.

Disclaimer: this project is mostly vibe-coded by codex 5.3 xhigh.

## Deployable Static Site

This project is a fully static single-page app:

- No backend required
- No database required
- Deployable to any static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel static output, S3, etc.)

Source files stay vanilla:

- `index.html`
- `styles.css`
- `app.js`
- `data/` (modular content source)

Build output is emitted to `dist/`, including a generated/minified `dist/index.json`.

## Quick Start (Local)

Install dependencies and build with npm:

```bash
npm install
npm run build
```

Serve the built site:

```bash
npm run serve
```

Open `http://localhost:8080`.

## Build Process

- JS is transpiled and minified with `esbuild`.
- CSS is processed and minified with `PostCSS`, `autoprefixer`, and `cssnano`.
- HTML and generated JSON are minified.
- Local JS/CSS output filenames are content-hashed for cache-safe static hosting.
- Both use `browserslist` targets set to `defaults`.
- Source content is collected from `data/` and compiled into `dist/index.json`.
- Item images under `data/<item-id>/images/` are copied to `dist/data/<item-id>/images/`.

## Deployment Notes

1. Run `npm run build`.
2. Upload `dist/` to your static host.
3. Ensure `index.json` is available at the same relative path as `index.html` (default app behavior).
4. Verify map tiles and attribution render correctly in production.

## Data Customization (`data/`)

All guide content is driven by the `data/` directory.

### Structure

- `data/meta.json`
  - Guide-level metadata.
  - `title` controls the guide title.
  - `categoryConfig` controls category/sub-category icons and category colors.
- `data/<item-id>/info.json`
  - Metadata for one restaurant.
- `data/<item-id>/images/`
  - Optional local image files for that restaurant.

The build step reads all `data/*/info.json` entries and emits one combined `dist/index.json`:
- Top-level `title`
- Top-level `restaurants` array

### Restaurant fields

- `id` (string, required): Must match the folder name `<item-id>`.
- `name` (string): Display name.
- `category` (string): Main category used by filters.
- `subCategory` (string, optional): Secondary category shown in list and sorting.
- `lat` (number): Latitude.
- `lng` (number): Longitude.
- `address` (string, optional): Address shown in popup.
- `rating` (number, optional): 1-5 star rating.
- `priceLower` (integer, optional): Lower bound of average price per person.
- `priceHigher` (integer, optional): Upper bound of average price per person.
- `specialRecommendation` (boolean, optional):
  - `false` or missing: no ribbon
  - `true`: shows the recommendation ribbon
- `comment` (string, optional): Notes shown in popup.
- `mapsUrl` (string, optional): "Open in Google Maps" link.
- `reservationUrl` (string, optional): "Reserve Table" link.
- `photos` (array, optional):
  - Remote URL strings (left unchanged), or
  - Local image paths relative to `data/<item-id>/images/` (rewritten to `data/<item-id>/images/...` in output), or
  - Objects like `{ "url": "...", "caption": "..." }`

If `photos` is omitted and local images exist, build auto-populates `photos` from files in `images/`.

### Sorting behavior

The list is sorted by:

1. Recommendation status
2. Rating (high to low)
3. Category
4. Sub-category
5. Name

## Map Attribution

- Base map: OpenStreetMap Shortbread vector tiles, drawn by MapLibre GL JS through its Leaflet adapter. No API key or backend is required; WebGL is required in the browser.
- `basemap.json` contains the tile source, font endpoint, and custom light-gray style. The build copies it into `dist/`. Edit it to adjust colors and labels or change providers; replacement tiles must use the same schema, or the style must be adapted.
- MapLibre GL JS 5.6.1 and the Leaflet adapter 0.0.22 are pinned CDN imports in `index.html`. Leaflet still manages markers, popups, and interactions. Noto Sans label glyphs come from `demotiles.maplibre.org`.
- `addBaseMapTiles()` adapts the older Leaflet adapter to MapLibre 5 using the public `jumpTo()` camera API. Direct writes to MapLibre's internal transform no longer move the map; preserve this compatibility override when changing the integration.
- Tile usage follows the [OpenStreetMap vector tile policy](https://operations.osmfoundation.org/policies/vector/): keep attribution visible, allow browser caching and the Referer header, and do not add bulk downloads or offline prefetching. The community service has no availability guarantee. Native vector tiles end at zoom 14 and are rendered at higher zooms; monitor OSM's schema version changes when maintaining the source URL.
- Keep attribution visible to comply with provider requirements.

## License

This project is licensed under the Apache License 2.0 (Apache-2.0).
