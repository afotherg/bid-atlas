# BID Atlas

A source-led U.S. Business Improvement District directory with interactive boundaries, record drill-down, official provenance, and automated change detection.

## Run locally

```bash
npm install
npm run admin:update
npm run dev
```

Copy `.env.example` to `.env.local` and add a browser-restricted Google Maps JavaScript API key to use Google Maps. Without a key, the application uses an OpenStreetMap preview so the directory remains functional.

## Data administration

`npm run admin:update` downloads every configured official GIS feed in `data/sources.json`, normalizes fields, fingerprints record attributes and geometry, and writes:

- `public/data/bids.geojson` — map-ready normalized districts
- `public/data/manifest.json` — coverage, freshness, source health, and counts
- `data/last-change-report.json` — additions, removals, and modifications

If a feed fails, the updater retains that source's last good records and marks the source unhealthy. It never silently publishes an empty source.

`npm run admin:discover` searches the federal Data.gov catalog for candidate BID/CBD resources and writes `data/candidate-sources.json`. Candidates require human verification before they are added to `data/sources.json`; this prevents unrelated special districts from entering the public map.

The included GitHub Actions workflow runs discovery and refresh daily, commits verified changes, and can also be run manually. Add authoritative feeds as they are verified. There is currently no authoritative nationwide U.S. registry, so the UI reports exact covered jurisdictions rather than claiming false completeness.

## Adding a source

Add a record to `data/sources.json` with an official GeoJSON URL, publisher, jurisdiction, landing page, and field aliases. Run `npm run admin:update`, inspect `data/last-change-report.json`, then review the affected map boundaries.
