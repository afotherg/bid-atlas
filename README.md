# BID Atlas

A source-led U.S. Business Improvement District directory with interactive boundaries, record drill-down, official provenance, and automated change detection.

For the complete operational workflow—including manual state research, source promotion, daily refresh, failure handling, and GitHub Pages deployment—see [BID Atlas data operations](docs/data-operations.md).

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

The scheduled GitHub Actions workflow runs discovery and refresh daily and commits verified changes. A separate deployment workflow publishes GitHub Pages after pushes to `main`, after the scheduled refresh completes, or when started manually. Add authoritative feeds as they are verified. There is currently no authoritative nationwide U.S. registry, so the UI reports exact covered jurisdictions rather than claiming false completeness.

## State-by-state audit

`data/state-audit.csv` is the national research ledger. It has one row for every state plus the District of Columbia and deliberately separates:

- research status and confidence;
- verified enabling authority and local terminology;
- availability of an authoritative statewide registry;
- current map source and record counts;
- geographic coverage status and the next research action.

An empty state is recorded as `not_started`, never as proof that no BID exists. The initial audit verifies enabling authority and current partial coverage for California, Connecticut, Maryland, New York, and the District of Columbia. It also records two discrepancies that need review: the D.C. registry says 12 BIDs while its boundary feed produces 13 records, and the May 2026 NYC report says 78 BIDs while the current layer contains 76.

Run `npm run admin:audit:sync` after changing map sources or district data to refresh the two map-count columns.

State research and boundary creation are currently manual. Record supported findings directly in `data/state-audit.csv`; add a district to the map only after verifying its active status and boundary against authoritative sources. The former experimental AI research and boundary-generation pipeline is preserved on the `codex/ai-bid-automation-archive` branch for possible future work.

## GitHub Pages deployment

The combined GitHub Actions workflow publishes `dist/pages` on every push to `main`, on the daily refresh schedule, and when started manually. Scheduled refresh commits are deployed in the same workflow run; they do not rely on a second workflow being triggered by the Actions bot.

The workflow publishes to the configured custom domain, `bid-atlas.fothergill.com`, and includes the required `CNAME` artifact. GitHub Pages must use **Settings → Pages → Build and deployment → Source: GitHub Actions**. DNS should expose a CNAME from `bid-atlas.fothergill.com` to `afotherg.github.io`; when Cloudflare is used, set the record to DNS-only until GitHub finishes domain and HTTPS verification.

## Adding a source

Add a record to `data/sources.json` with an official GeoJSON URL, publisher, jurisdiction, landing page, and field aliases. For a legislation-derived boundary, supply a local GeoJSON `file` and the official `monitorUrls` instead. Run `npm run admin:update`, inspect `data/last-change-report.json`, then review the affected map boundaries.
