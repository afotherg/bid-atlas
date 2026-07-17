import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const collection = JSON.parse(await readFile(new URL("../public/data/bids.geojson", import.meta.url), "utf8"));

test("all published boundaries use WGS84 longitude and latitude", () => {
  for (const feature of collection.features) {
    const [west, south, east, north] = feature.properties.bounds;
    assert.ok(west >= -180 && east <= 180, `${feature.properties.id} has invalid longitude bounds`);
    assert.ok(south >= -90 && north <= 90, `${feature.properties.id} has invalid latitude bounds`);
  }
});

test("Downtown San Diego resolves to San Diego", () => {
  const district = collection.features.find((feature) => feature.properties.city === "San Diego" && feature.properties.name === "Downtown");
  assert.ok(district);
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -118 && longitude < -116);
  assert.ok(latitude > 32 && latitude < 34);
  assert.equal(district.properties.website, "https://downtownsandiego.org/city-center-district/");
});

test("Baltimore publishes its six neighborhood special benefits districts", () => {
  const baltimore = collection.features.filter((feature) => feature.properties.city === "Baltimore" && feature.properties.state === "MD");
  const names = new Set(baltimore.map((feature) => feature.properties.name));
  assert.equal(baltimore.length, 6);
  for (const name of [
    "Downtown Management District",
    "Charles Village Community Benefits District",
    "Midtown Community Benefits District",
    "Waterfront Management District",
    "York Corridor Business Improvement District",
    "Port Covington Community Benefits District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of baltimore) {
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -77 && longitude < -76, `${district.properties.name} is outside Baltimore longitude`);
    assert.ok(latitude > 39 && latitude < 40, `${district.properties.name} is outside Baltimore latitude`);
  }
});

test("Denver publishes its twelve active business improvement districts", () => {
  const denver = collection.features.filter((feature) => feature.properties.city === "Denver" && feature.properties.state === "CO");
  const names = new Set(denver.map((feature) => feature.properties.name));
  assert.equal(denver.length, 12);
  assert.ok(names.has("Downtown Denver Business Improvement District"));
  assert.ok(names.has("RiNo Business Improvement District"));
  for (const district of denver) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.sourceId, "denver-business-improvement-districts");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -106 && longitude < -104, `${district.properties.name} is outside Denver longitude`);
    assert.ok(latitude > 39 && latitude < 41, `${district.properties.name} is outside Denver latitude`);
  }
});
