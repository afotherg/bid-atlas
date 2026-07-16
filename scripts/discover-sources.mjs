import { writeFile } from "node:fs/promises";

const endpoint = new URL("https://api.gsa.gov/technology/datagov/v4/search");
endpoint.searchParams.set("q", '"business improvement district" OR "community benefit district"');
endpoint.searchParams.set("limit", "100");
const response = await fetch(endpoint, {
  headers: { "user-agent": "BID-Atlas-Discovery/1.0", "X-Api-Key": process.env.DATA_GOV_API_KEY || "DEMO_KEY" },
  signal: AbortSignal.timeout(45_000),
});
if (!response.ok) throw new Error(`data.gov discovery failed: HTTP ${response.status}`);
const payload = await response.json();
const candidates = (payload.results ?? []).flatMap((result) => {
  const dataset = result.dcat ?? result;
  return (dataset.distribution ?? [])
    .filter((resource) => /geojson|json|arcgis|csv/i.test(`${resource.format} ${resource.mediaType} ${resource.accessURL}`))
    .map((resource) => ({
      dataset: dataset.title,
      publisher: dataset.publisher?.name ?? result.publisher ?? null,
      modified: dataset.modified ?? null,
      landingPage: dataset.landingPage ?? result.identifier ?? null,
      format: resource.format,
      url: resource.downloadURL ?? resource.accessURL,
    }));
}).filter((candidate) => candidate.url).sort((a, b) => a.dataset.localeCompare(b.dataset));
await writeFile("data/candidate-sources.json", `${JSON.stringify({ discoveredAt: new Date().toISOString(), reviewRequired: true, candidates }, null, 2)}\n`);
console.log(`Found ${candidates.length} candidate resources for administrator review.`);
