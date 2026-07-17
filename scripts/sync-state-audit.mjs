import { readFile } from "node:fs/promises";
import { loadAudit, saveAudit } from "./state-audit-lib.mjs";

const sources = JSON.parse(await readFile("data/sources.json", "utf8"));
const districts = JSON.parse(await readFile("public/data/bids.geojson", "utf8"));
const sourceCounts = Map.groupBy(sources, (source) => source.state);
const recordCounts = Map.groupBy(districts.features ?? [], (feature) => feature.properties?.state);
const rows = await loadAudit();

for (const row of rows) {
  row.map_source_count = String(sourceCounts.get(row.state_code)?.length ?? 0);
  row.map_record_count = String(recordCounts.get(row.state_code)?.length ?? 0);
}

await saveAudit(rows);
console.log(`Synchronized map counts for ${rows.length} state-audit rows.`);
