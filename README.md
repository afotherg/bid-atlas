# BID Atlas

A source-led U.S. Business Improvement District directory with interactive boundaries, record drill-down, official provenance, and automated change detection.

For the complete operational workflow—including state research, human review, source promotion, daily refresh, failure handling, and GitHub Pages deployment—see [BID Atlas data operations](docs/data-operations.md).

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

### Intelligent audit assistant

The weekly `state-audit.yml` workflow uses [grok-4.5 with xAI's native web search](https://docs.x.ai/developers/tools/web-search) and structured output. In one grounded research call per state it searches for enabling law, official registries, and official GIS boundaries. The model may only cite URLs returned by the API's web-search citations; the script filters unsupported URLs after generation.

The assistant is intentionally a researcher rather than a publisher. It writes evidence-rich JSON proposals and opens one pull request per state, with only that state's proposal and audit-ledger row. A person must check the citations and CSV diff before merging. It never adds a district or boundary to the public map automatically.

Configure repository Actions secret `LLM_API_KEY`. The model and full Responses-compatible endpoint remain configurable through repository variables:

- `LLM_MODEL` defaults to `grok-4.5`;
- `LLM_API_URL` defaults to `https://api.x.ai/v1/responses`;
- `LLM_API_KEY` has no default and is always supplied as a secret.

Optional runtime controls are `LLM_MAX_TOKENS` (default `4000`), `LLM_TIMEOUT_MS` (default `300000`), and `LLM_REASONING_EFFORT` (unset by default because provider support varies).

Native web search requires a Responses-compatible endpoint. Without `LLM_API_KEY` the weekly job exits successfully with a setup notice. For a local run:

```bash
npm run admin:audit:research -- --states=AL,AK --limit=2
npm run admin:audit:apply -- --state=AL,AK
npm run admin:audit:sync
```

The apply command is explicit so an administrator can inspect `data/audit-proposals/*.json` first. The CSV remains the reviewed source of truth; proposal files are an audit trail.

## GitHub Pages deployment

The combined GitHub Actions workflow publishes `dist/pages` on every push to `main`, on the daily refresh schedule, and when started manually. Scheduled refresh commits are deployed in the same workflow run; they do not rely on a second workflow being triggered by the Actions bot.

The workflow publishes to the configured custom domain, `bid-atlas.fothergill.com`, and includes the required `CNAME` artifact. GitHub Pages must use **Settings → Pages → Build and deployment → Source: GitHub Actions**. DNS should expose a CNAME from `bid-atlas.fothergill.com` to `afotherg.github.io`; when Cloudflare is used, set the record to DNS-only until GitHub finishes domain and HTTPS verification.

## Adding a source

Add a record to `data/sources.json` with an official GeoJSON URL, publisher, jurisdiction, landing page, and field aliases. For a legislation-derived boundary, supply a local GeoJSON `file` and the official `monitorUrls` instead. Run `npm run admin:update`, inspect `data/last-change-report.json`, then review the affected map boundaries.
