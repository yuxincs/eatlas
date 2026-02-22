# AGENTS.md

## Purpose
This file captures working agreements for AI/code agents contributing to Eatlas.

## Product intent
- Build a map-first NYC food guide that is easy to share.
- Keep the app fully static and deployable without a backend.
- Prioritize fast load time, mobile usability, and straightforward data editing.

## Hard constraints
- Keep the stack vanilla: `index.html`, `styles.css`, `app.js`, `data/`, Bun scripts.
- Do not add frameworks or server dependencies unless explicitly requested.
- Keep map provider attribution visible (OpenStreetMap/CARTO).
- Do not reintroduce realtime user location or GPS permission prompts.
- Maintain compatibility with GitHub Pages static hosting.

## Repository map
- `index.html`: App shell, CDN imports (Bootstrap and Leaflet), and layout containers.
- `styles.css`: Visual system and responsive/mobile sheet behavior.
- `app.js`: App logic (loads generated `index.json`, markers, filters, list sorting, and selection state).
- `data/`: Modular content source (`data/meta.json`, `data/<item-id>/info.json`, `data/<item-id>/images/`).
- `scripts/build.mjs`: Build pipeline (JS/CSS transpilation + `index.json` generation + image copy).
- `.github/workflows/deploy-pages.yml`: Deployment flow (validates data, builds `dist/`, deploys Pages).

## Data contract (`data/`)
- Keep `data/meta.json` as a top-level object with `title`.
- Keep category display config in `data/meta.json` under `categoryConfig` (category icons/colors and sub-category icons).
- Each `data/<item-id>/info.json` should include stable `id`, `name`, `category`, and valid numeric `lat`/`lng`.
- `id` must match `<item-id>`.
- Optional fields currently supported: `subCategory`, `address`, `rating`, `priceLower`, `priceHigher`, `specialRecommendation` (boolean), `comment`, `mapsUrl`, `reservationUrl`, `photos`.
- Local photos live in `data/<item-id>/images/`; build rewrites local photo paths into generated `index.json`.

## Development workflow
- Run `bun run build` to regenerate `dist/`.
- Serve locally with `bun run serve` (or any static server pointed at `dist/`).
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
