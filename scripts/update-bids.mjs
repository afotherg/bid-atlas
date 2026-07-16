import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import proj4 from "proj4";

proj4.defs("EPSG:2230", "+proj=lcc +lat_0=32.1666666666667 +lon_0=-116.25 +lat_1=33.8833333333333 +lat_2=32.7833333333333 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs +type=crs");

const root = process.cwd();
const sourcePath = path.join(root, "data/sources.json");
const outputPath = path.join(root, "public/data/bids.geojson");
const manifestPath = path.join(root, "public/data/manifest.json");
const reportPath = path.join(root, "data/last-change-report.json");
const checkedAt = new Date().toISOString();

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
};

const sources = await readJson(sourcePath, []);
const previous = await readJson(outputPath, { type: "FeatureCollection", features: [] });
const previousBySource = Map.groupBy(previous.features ?? [], (f) => f.properties?.sourceId);

const valueFor = (properties, keys = []) => {
  for (const key of keys) {
    const raw = properties?.[key];
    const value = raw && typeof raw === "object" ? raw.url : raw;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
};

const coordinateBounds = (coordinates, bounds = [Infinity, Infinity, -Infinity, -Infinity]) => {
  if (!Array.isArray(coordinates)) return bounds;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    bounds[0] = Math.min(bounds[0], coordinates[0]);
    bounds[1] = Math.min(bounds[1], coordinates[1]);
    bounds[2] = Math.max(bounds[2], coordinates[0]);
    bounds[3] = Math.max(bounds[3], coordinates[1]);
    return bounds;
  }
  for (const coordinate of coordinates) coordinateBounds(coordinate, bounds);
  return bounds;
};

const transformCoordinates = (coordinates, sourceCrs) => {
  if (!sourceCrs || sourceCrs === "EPSG:4326") return coordinates;
  if (!Array.isArray(coordinates)) return coordinates;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return proj4(sourceCrs, "EPSG:4326", coordinates);
  }
  return coordinates.map((coordinate) => transformCoordinates(coordinate, sourceCrs));
};

const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const slug = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function normalize(source, feature) {
  if (!feature?.geometry) return null;
  const p = feature.properties ?? {};
  const name = source.fixedName ?? valueFor(p, source.fields.name);
  if (!name) return null;
  const override = source.overrides?.[name] ?? {};
  const geometry = { ...feature.geometry, coordinates: transformCoordinates(feature.geometry.coordinates, source.sourceCrs) };
  const bounds = coordinateBounds(geometry.coordinates);
  if (!bounds.every(Number.isFinite)) return null;
  const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const id = `${source.state.toLowerCase()}-${slug(source.city)}-${slug(name)}`;
  const properties = {
    id,
    name,
    city: source.city,
    state: source.state,
    area: valueFor(p, source.fields.area),
    website: override.website ?? valueFor(p, source.fields.website),
    established: valueFor(p, source.fields.established),
    expires: valueFor(p, source.fields.expires),
    annualRevenue: valueFor(p, source.fields.annualRevenue),
    reportUrl: valueFor(p, source.fields.reportUrl),
    status: valueFor(p, source.fields.status) ?? "Active",
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.landingPage,
    publisher: source.publisher,
    checkedAt,
    center,
    bounds,
    geometryType: geometry.type,
  };
  properties.recordHash = digest({ geometry, properties: { ...properties, checkedAt: undefined, recordHash: undefined } });
  return { type: "Feature", id, properties, geometry };
}

const sourceResults = [];
const allFeatures = [];
for (const source of sources) {
  try {
    const response = await fetch(source.url, { headers: { "user-agent": "BID-Atlas-Updater/1.0" }, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const features = (body.features ?? []).map((feature) => normalize(source, feature)).filter(Boolean);
    if (!features.length) throw new Error("No usable geographic features returned");
    allFeatures.push(...features);
    sourceResults.push({ id: source.id, name: source.name, status: "ok", records: features.length, checkedAt });
  } catch (error) {
    const retained = previousBySource.get(source.id) ?? [];
    allFeatures.push(...retained);
    sourceResults.push({ id: source.id, name: source.name, status: "error", records: retained.length, checkedAt, error: String(error.message ?? error), retainedPrevious: true });
  }
}

const unique = new Map();
for (const feature of allFeatures) {
  const prior = unique.get(feature.properties.id);
  if (!prior) { unique.set(feature.properties.id, feature); continue; }
  const polygonParts = (geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  const parts = [...polygonParts(prior.geometry), ...polygonParts(feature.geometry)];
  if (parts.length) {
    prior.geometry = { type: "MultiPolygon", coordinates: parts };
    prior.properties.geometryType = "MultiPolygon";
    prior.properties.bounds = coordinateBounds(prior.geometry.coordinates);
    const [west, south, east, north] = prior.properties.bounds;
    prior.properties.center = [(west + east) / 2, (south + north) / 2];
    prior.properties.recordHash = digest({ geometry: prior.geometry, properties: { ...prior.properties, checkedAt: undefined, recordHash: undefined } });
  }
}
const features = [...unique.values()].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
const oldHashes = new Map((previous.features ?? []).map((f) => [f.properties?.id, f.properties?.recordHash]));
const nextHashes = new Map(features.map((f) => [f.properties.id, f.properties.recordHash]));
const added = features.filter((f) => !oldHashes.has(f.properties.id)).map((f) => f.properties.id);
const removed = [...oldHashes.keys()].filter((id) => !nextHashes.has(id));
const modified = features.filter((f) => oldHashes.has(f.properties.id) && oldHashes.get(f.properties.id) !== f.properties.recordHash).map((f) => f.properties.id);
const states = [...new Set(features.map((f) => f.properties.state))].sort();
const cities = [...new Set(features.map((f) => `${f.properties.city}, ${f.properties.state}`))].sort();
const collection = { type: "FeatureCollection", generatedAt: checkedAt, features };
const manifest = {
  generatedAt: checkedAt,
  records: features.length,
  states,
  cities,
  sources: sourceResults,
  coverage: { verifiedJurisdictions: cities.length, configuredSources: sources.length, nationalRegistryAvailable: false },
  changeSummary: { added: added.length, modified: modified.length, removed: removed.length },
};
const report = { checkedAt, summary: manifest.changeSummary, added, modified, removed, sources: sourceResults };

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}.tmp`, `${JSON.stringify(collection)}\n`);
await rename(`${outputPath}.tmp`, outputPath);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`BID Atlas: ${features.length} districts; +${added.length} ~${modified.length} -${removed.length}; ${sourceResults.filter((s) => s.status === "ok").length}/${sources.length} sources healthy.`);
if (sourceResults.some((source) => source.status === "error")) process.exitCode = 2;
