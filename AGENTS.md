# AGENTS.md

## Purpose
This file captures working agreements for AI/code agents contributing to Eatlas.

## Product intent
- Build a map-first NYC food guide that is easy to share.
- Keep the app fully static and deployable without a backend or build step.
- Prioritize fast load time, mobile usability, and straightforward data editing.

## Hard constraints
- Keep the stack vanilla: `index.html`, `styles.css`, `app.js`, `restaurants.json`.
- Do not add Node tooling, bundlers, frameworks, or server dependencies unless explicitly requested.
- Keep map provider attribution visible (OpenStreetMap/CARTO).
- Do not reintroduce realtime user location or GPS permission prompts.
- Maintain compatibility with GitHub Pages static hosting.

## Repository map
- `index.html`: App shell, CDN imports (Bootstrap and Leaflet), and layout containers.
- `styles.css`: Visual system and responsive/mobile sheet behavior.
- `app.js`: App logic (data load, markers, filters, list sorting, and selection state).
- `restaurants.json`: Content source of truth (`{ "title": string, "restaurants": [] }`).
- `.github/workflows/deploy-pages.yml`: Deployment flow; may overwrite `restaurants.json` from repo variable `RESTAURANTS`, then validates with `jq`.

## Data contract (`restaurants.json`)
- Keep a top-level object with `title` and a `restaurants` array.
- Each restaurant should include stable `id`, `name`, `category`, and valid numeric `lat`/`lng`.
- Optional fields currently supported: `subCategory`, `address`, `rating`, `priceLower`, `priceHigher`, `specialRecommendation`, `comment`, `mapsUrl`, `reservationUrl`, `photos`.
- Preserve valid JSON formatting.

## Development workflow
- Serve locally with `python3 -m http.server 8080` (JSON fetch does not work via `file://`).
- Validate data changes with `jq -e . restaurants.json`.
- Prefer small, targeted edits that match existing style (constants + function declarations + defensive checks).

## UI and behavior guardrails
- Preserve map-first interaction and sidebar/filter workflow.
- Keep both desktop and mobile experiences working (breakpoint is currently `900px`).
- Preserve list sort behavior: recommendation, rating (desc), category, sub-category, name.
- Avoid regressions in overlay controls (sidebar, filter dock, map controls).

## Change checklist for agents
- Verify the app loads with no console errors.
- Verify markers render and popup/list selection stays in sync.
- Verify category filters work and restaurant count updates.
- Verify desktop sidebar toggle and mobile bottom-sheet interactions.
- Re-check deployment assumptions if editing workflow or static file structure.

## When unsure
- Prefer preserving the existing architecture over introducing new abstractions.
- Ask for explicit approval before scope expansion (new dependencies, backend, or major redesign).
