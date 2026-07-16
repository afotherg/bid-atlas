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
