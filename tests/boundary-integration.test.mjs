import assert from "node:assert/strict";
import test from "node:test";
import {
  arcgisItemId,
  automaticCandidateDecision,
  hasBlockingStatusLanguage,
  resolveArcgisWebMap,
  selectArcgisBidLayers,
  validateBoundaryCollection,
  validateStateBounds,
} from "../scripts/boundary-integration-lib.mjs";

const eligible = {
  name: "Example Business Improvement District",
  city: "Example",
  active_status: "verified_active",
  status_url: "https://example.gov/bid",
  boundary_source_url: "https://example.gov/arcgis/rest/services/bid/FeatureServer/0",
  boundary_source_type: "arcgis_feature_layer",
  boundary_title: "Business Improvement District",
  publication_recommendation: "auto_import",
  confidence: "high",
  notes: "Current municipal boundary",
};

test("only verified machine-readable boundaries pass automatic publication gates", () => {
  assert.deepEqual(automaticCandidateDecision(eligible), { eligible: true, reason: "passed automatic publication gates" });
  assert.equal(automaticCandidateDecision({ ...eligible, active_status: "likely_active" }).eligible, false);
  assert.equal(automaticCandidateDecision({ ...eligible, boundary_source_type: "pdf_map" }).eligible, false);
  assert.equal(automaticCandidateDecision({ ...eligible, publication_recommendation: "manual_review" }).eligible, false);
});

test("proposed and inactive language blocks automatic import", () => {
  assert.match(automaticCandidateDecision({ ...eligible, boundary_title: "Proposed Business Improvement District Area" }).reason, /proposed or inactive/);
  assert.match(automaticCandidateDecision({ ...eligible, notes: "The former district was dissolved" }).reason, /proposed or inactive/);
});

test("ArcGIS Web Map helpers identify BID layers and item IDs", () => {
  assert.equal(arcgisItemId("https://www.arcgis.com/home/item.html?id=fe3d74f158e6495c9e201d1ca330a30c"), "fe3d74f158e6495c9e201d1ca330a30c");
  const layers = selectArcgisBidLayers([
    { title: "Parcels", url: "https://example.gov/parcels" },
    { title: "Group", layers: [{ title: "Business Improvement District Boundary", url: "https://example.gov/bid" }] },
  ]);
  assert.deepEqual(layers.map((layer) => layer.url), ["https://example.gov/bid"]);
});

test("ArcGIS Web Map resolution exposes proposed child layers to the deterministic blocker", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/data?")
      ? { operationalLayers: [{ title: "Proposed Business Improvement District Area", url: "https://example.gov/FeatureServer/4" }] }
      : { type: "Web Map", title: "Public BID Map" },
  });
  const resolved = await resolveArcgisWebMap("https://www.arcgis.com/home/item.html?id=fe3d74f158e6495c9e201d1ca330a30c", fetcher);
  assert.equal(resolved.layers.length, 1);
  assert.equal(hasBlockingStatusLanguage(resolved.layers[0].title), true);
});

test("boundary validation accepts polygons and enforces state bounds", () => {
  const collection = validateBoundaryCollection({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-71.2, 42.3], [-71.1, 42.3], [-71.1, 42.4], [-71.2, 42.3]]] } }],
  });
  assert.doesNotThrow(() => validateStateBounds(collection, [-73.6, 41.1, -69.8, 43]));
  assert.throws(() => validateStateBounds(collection, [-73, 41.1, -72, 43]), /outside the expected state bounds/);
  assert.throws(() => validateBoundaryCollection({ type: "FeatureCollection", features: [] }), /non-empty/);
});
