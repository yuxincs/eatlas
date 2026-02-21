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
- `restaurants.json` (content data)

Build output is emitted to `dist/`.

## Quick Start (Local)

Install dependencies and build with Bun:

```bash
bun install
bun run build
```

Serve the built site:

```bash
bun run serve
```

Open `http://localhost:8080`.

## Build Process

- JS is transpiled with `esbuild`.
- CSS is processed with `PostCSS` + `autoprefixer`.
- Both use `browserslist` targets set to `defaults`.

## Deployment Notes

1. Run `bun run build`.
2. Upload `dist/` to your static host.
3. Ensure `restaurants.json` is available at the same relative path as `index.html` (or change `DATA_FILE_PATH` in `app.js` to another URL).
4. Verify map tiles and attribution render correctly in production.

## Data Customization (`restaurants.json`)

All guide content is driven by `restaurants.json`.

### Top-level fields

- `title` (string): Header title shown in the list panel.
- `restaurants` (array): List of restaurant objects.

### Restaurant fields

- `id` (string, recommended): Stable unique ID.
- `name` (string): Display name.
- `category` (string): Main category used by filters.
- `subCategory` (string, optional): Secondary category shown in list and sorting.
- `lat` (number): Latitude.
- `lng` (number): Longitude.
- `address` (string, optional): Address shown in popup.
- `rating` (number, optional): 1-5 star rating.
- `priceLower` (integer, optional): Lower bound of average price per person.
- `priceHigher` (integer, optional): Upper bound of average price per person.
- `specialRecommendation` (boolean or string, optional):
  - `false` or missing: no ribbon
  - `true`: default recommendation ribbon
  - string: custom ribbon label
- `comment` (string, optional): Notes shown in popup.
- `mapsUrl` (string, optional): "Open in Google Maps" link.
- `reservationUrl` (string, optional): "Reserve Table" link.
- `photos` (array, optional):
  - String URL entries
  - Or objects like `{ "url": "...", "caption": "..." }`

### Sorting behavior

The list is sorted by:

1. Recommendation status
2. Rating (high to low)
3. Category
4. Sub-category
5. Name

## Map Attribution

- Base map: OpenStreetMap data with CARTO Positron tiles.
- Keep attribution visible to comply with provider requirements.

## License

This project is licensed under the Apache License 2.0 (Apache-2.0).
