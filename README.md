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

`npm run admin:update` downloads every configured official GIS feed in `data/sources.json`, loads any legislation-derived boundary files, normalizes fields, fingerprints record attributes and geometry, and writes:

- `public/data/bids.geojson` — map-ready normalized districts
- `public/data/manifest.json` — coverage, freshness, source health, and counts
- `data/last-change-report.json` — additions, removals, and modifications

If a feed fails, the updater retains that source's last good records and marks the source unhealthy. It never silently publishes an empty source.

For districts whose authoritative boundaries are published only in legislation, a source can use a repository GeoJSON `file` plus `monitorUrls`. The updater hashes the official legal pages on every run and marks the source for review if the legislation changes, while retaining the last verified geometry until an administrator updates it. Baltimore uses this approach for the Waterfront and York Corridor districts; its other four districts refresh directly from City GIS services.

`npm run admin:discover` searches the federal Data.gov catalog for candidate BID/CBD resources and writes `data/candidate-sources.json`. Candidates require human verification before they are added to `data/sources.json`; this prevents unrelated special districts from entering the public map.

The included GitHub Actions workflow runs discovery and refresh daily, commits verified changes, and can also be run manually. Add authoritative feeds as they are verified. There is currently no authoritative nationwide U.S. registry, so the UI reports exact covered jurisdictions rather than claiming false completeness.

## GitHub Pages deployment

The combined GitHub Actions workflow publishes `dist/pages` on every push to `main`, on the daily refresh schedule, and when started manually. Scheduled refresh commits are deployed in the same workflow run; they do not rely on a second workflow being triggered by the Actions bot.

The workflow publishes to the configured custom domain, `bid-atlas.fothergill.com`, and includes the required `CNAME` artifact. GitHub Pages must use **Settings → Pages → Build and deployment → Source: GitHub Actions**. DNS should expose a CNAME from `bid-atlas.fothergill.com` to `afotherg.github.io`; when Cloudflare is used, set the record to DNS-only until GitHub finishes domain and HTTPS verification.

## Adding a source

Add a record to `data/sources.json` with an official GeoJSON URL, publisher, jurisdiction, landing page, and field aliases. For a legislation-derived boundary, supply a local GeoJSON `file` and the official `monitorUrls` instead. Run `npm run admin:update`, inspect `data/last-change-report.json`, then review the affected map boundaries.
