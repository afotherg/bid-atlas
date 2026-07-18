import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMachineBoundaryRepairs,
  arcgisItemId,
  arcgisLayerId,
  automaticCandidateDecision,
  hasBlockingStatusLanguage,
  normalizeDistrictName,
  resolveArcgisFeatureLayer,
  resolveArcgisWebMap,
  selectDistrictBoundary,
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
  assert.match(automaticCandidateDecision({ ...eligible, publication_recommendation: "manual_review" }).reason, /draft human review/);
});

test("targeted source repairs require cited high-confidence machine boundaries", () => {
  const districts = [{ ...eligible, boundary_source_url: "", boundary_source_type: "none", publication_recommendation: "manual_review", confidence: "medium" }];
  const repair = {
    name: eligible.name,
    boundary_source_url: "https://example.gov/arcgis/rest/services/bid/FeatureServer/0",
    boundary_source_type: "arcgis_feature_layer",
    boundary_title: "Current BID boundary",
    confidence: "high",
    notes: "Official polygon layer",
  };
  assert.equal(applyMachineBoundaryRepairs(districts, [repair], []), 0);
  assert.equal(applyMachineBoundaryRepairs(districts, [repair], [repair.boundary_source_url]), 1);
  assert.equal(districts[0].publication_recommendation, "auto_import");
  assert.equal(districts[0].confidence, "high");
});

test("proposed and inactive language blocks automatic import", () => {
  assert.match(automaticCandidateDecision({ ...eligible, boundary_title: "Proposed Business Improvement District Area" }).reason, /proposed or inactive/);
  assert.match(automaticCandidateDecision({ ...eligible, notes: "The former district was dissolved" }).reason, /proposed or inactive/);
  assert.equal(automaticCandidateDecision({ ...eligible, notes: "Active district. A separate Hilltop proposal was excluded as not formed." }).eligible, true);
});

test("ArcGIS Web Map helpers identify BID layers and item IDs", () => {
  assert.equal(arcgisItemId("https://www.arcgis.com/home/item.html?id=fe3d74f158e6495c9e201d1ca330a30c"), "fe3d74f158e6495c9e201d1ca330a30c");
  assert.equal(arcgisItemId("https://hub.arcgis.com/datasets/08107965cf3840668023f710e30796c3_0"), "08107965cf3840668023f710e30796c3");
  assert.equal(arcgisLayerId("https://hub.arcgis.com/datasets/08107965cf3840668023f710e30796c3_0"), 0);
  const layers = selectArcgisBidLayers([
    { title: "Parcels", url: "https://example.gov/parcels" },
    { title: "Group", layers: [{ title: "Business Improvement District Boundary", url: "https://example.gov/bid" }] },
  ]);
  assert.deepEqual(layers.map((layer) => layer.url), ["https://example.gov/bid"]);
});

test("ArcGIS Hub datasets resolve through item metadata to a feature layer", async () => {
  const fetcher = async (url) => {
    assert.match(String(url), /sharing\/rest\/content\/items\/08107965cf3840668023f710e30796c3/);
    return {
      ok: true,
      json: async () => ({
        type: "Feature Service",
        url: "https://services.arcgis.com/example/arcgis/rest/services/OED_Business_Improvement_Areas/FeatureServer",
      }),
    };
  };
  const resolved = await resolveArcgisFeatureLayer("https://hub.arcgis.com/datasets/08107965cf3840668023f710e30796c3_0", fetcher);
  assert.equal(resolved.layerUrl, "https://services.arcgis.com/example/arcgis/rest/services/OED_Business_Improvement_Areas/FeatureServer/0");
});

test("ArcGIS item pages resolve the only polygon layer in their feature service", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => String(url).includes("sharing/rest")
      ? { type: "Feature Service", url: "https://services.arcgis.com/example/FeatureServer" }
      : { layers: [{ id: 0, name: "Business Improvement District", geometryType: "esriGeometryPolygon" }] },
  });
  const resolved = await resolveArcgisFeatureLayer("https://example.hub.arcgis.com/items/6d150d6f1b964a78b933aa4e4aaa038e", fetcher);
  assert.equal(resolved.layerUrl, "https://services.arcgis.com/example/FeatureServer/0");
});

test("ArcGIS Hub slug pages resolve an embedded item ID", async () => {
  const fetcher = async (url) => {
    if (String(url).includes("data.example.arcgis.com")) return {
      ok: true,
      text: async () => '<meta name="twitter:image" content="https://www.arcgis.com/sharing/rest/content/items/1d233cde6a5943ad88e5e39c18c7f1a5_0/info/thumbnail/map.png">',
    };
    return {
      ok: true,
      json: async () => String(url).includes("sharing/rest")
        ? { type: "Feature Service", url: "https://services.arcgis.com/example/FeatureServer" }
        : { layers: [{ id: 0, name: "BIA", geometryType: "esriGeometryPolygon" }] },
    };
  };
  const resolved = await resolveArcgisFeatureLayer("https://data.example.arcgis.com/datasets/example::business-improvement-area", fetcher);
  assert.equal(resolved.layerUrl, "https://services.arcgis.com/example/FeatureServer/0");
});

test("shared layers select one district and merge multipart polygons", () => {
  const polygon = (name, x) => ({
    type: "Feature",
    properties: { NAME: name },
    geometry: { type: "Polygon", coordinates: [[[x, 47], [x + 0.01, 47], [x, 47.01], [x, 47]]] },
  });
  const collection = { type: "FeatureCollection", features: [
    polygon("Ballard BIA", -122.4),
    polygon("Pioneer Square BIA", -122.3),
    polygon("Ballard BIA", -122.39),
  ] };
  const selected = selectDistrictBoundary(collection, "Ballard Business Improvement Area");
  assert.equal(selected.features.length, 1);
  assert.equal(selected.features[0].geometry.type, "MultiPolygon");
  assert.equal(selected.features[0].geometry.coordinates.length, 2);
  assert.throws(() => selectDistrictBoundary(collection, "Unknown Business Improvement Area"), /no feature matching/);
  assert.equal(normalizeDistrictName("East Sprague Parking and Business Improvement Area (East Sprague BID)"), "east sprague");
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
