import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadAudit, parseCsv, stringifyCsv } from "../scripts/state-audit-lib.mjs";

const audit = await loadAudit(new URL("../data/state-audit.csv", import.meta.url));
const sources = JSON.parse(await readFile(new URL("../data/sources.json", import.meta.url), "utf8"));
const districts = JSON.parse(await readFile(new URL("../public/data/bids.geojson", import.meta.url), "utf8"));

test("state audit contains every state plus the District of Columbia exactly once", () => {
  assert.equal(audit.length, 51);
  assert.equal(new Set(audit.map((row) => row.state_code)).size, 51);
  assert.ok(audit.some((row) => row.state_code === "DC"));
});

test("state audit map counts reconcile with configured sources and published records", () => {
  for (const row of audit) {
    assert.equal(Number(row.map_source_count), sources.filter((source) => source.state === row.state_code).length, `${row.state_code} source count`);
    assert.equal(Number(row.map_record_count), districts.features.filter((feature) => feature.properties?.state === row.state_code).length, `${row.state_code} record count`);
  }
});

test("state audit preserves quoted fields through a CSV round trip", () => {
  assert.deepEqual(parseCsv(stringifyCsv(audit)), audit);
});
