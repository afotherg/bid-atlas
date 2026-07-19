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

test("Los Angeles publishes its 38 current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "los-angeles-bids");
  assert.equal(districts.length, 38);
  assert.ok(districts.some((feature) => feature.properties.name === "Arts District Los Angeles"));
  assert.ok(districts.some((feature) => feature.properties.name === "Historic Downtown"));
  assert.ok(!districts.some((feature) => feature.properties.name.includes("Brentwood Village")));
  assert.ok(!districts.some((feature) => feature.properties.name.includes("Central Avenue")));
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

test("Florida publishes the five active statewide-registry business improvement districts", () => {
  const florida = collection.features.filter((feature) => feature.properties.state === "FL");
  const names = new Set(florida.map((feature) => feature.properties.name));
  assert.equal(florida.length, 5);
  for (const name of [
    "Coconut Grove Business Improvement District",
    "Wynwood Business Improvement District",
    "Lincoln Road Business Improvement District",
    "Washington Avenue Business Improvement District",
    "41st Street Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  assert.deepEqual(new Set(florida.map((feature) => feature.properties.city)), new Set(["Miami", "Miami Beach"]));
  for (const district of florida) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.sourceId, "florida-verified-business-improvement-districts");
  }
});

test("Georgia publishes its three verified city business improvement districts", () => {
  const georgia = collection.features.filter((feature) => feature.properties.state === "GA");
  assert.equal(georgia.length, 3);
  assert.deepEqual(new Set(georgia.map((feature) => feature.properties.city)), new Set(["Rome", "Columbus", "Macon"]));
  for (const district of georgia) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.sourceId, "georgia-verified-business-improvement-districts");
  }
});

test("Hawaii publishes its five verified business improvement districts", () => {
  const hawaii = collection.features.filter((feature) => feature.properties.state === "HI");
  const names = new Set(hawaii.map((feature) => feature.properties.name));
  assert.equal(hawaii.length, 5);
  for (const name of [
    "Waikīkī Business Improvement District",
    "Downtown Honolulu Business Improvement District",
    "Waikīkī Beach Special Improvement District",
    "Waikīkī Transportation Management Special Improvement District",
    "Kailua Village Business Improvement District No. 1",
  ]) assert.ok(names.has(name), `missing ${name}`);
  assert.deepEqual(new Set(hawaii.map((feature) => feature.properties.city)), new Set(["Honolulu", "Kailua-Kona"]));
  for (const district of hawaii) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.sourceId, "hawaii-verified-business-improvement-districts");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -159 && longitude < -155, `${district.properties.name} is outside Hawaii longitude`);
    assert.ok(latitude > 18 && latitude < 22, `${district.properties.name} is outside Hawaii latitude`);
  }
});

test("Idaho publishes its three verified business improvement districts", () => {
  const idaho = collection.features.filter((feature) => feature.properties.state === "ID");
  const names = new Set(idaho.map((feature) => feature.properties.name));
  assert.equal(idaho.length, 3);
  for (const name of [
    "Downtown Boise Business Improvement District",
    "Nampa Business Improvement District No. 2",
    "Idaho Falls Downtown Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of idaho) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.sourceId, "idaho-verified-business-improvement-districts");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -118 && longitude < -111, `${district.properties.name} is outside Idaho longitude`);
    assert.ok(latitude > 41 && latitude < 50, `${district.properties.name} is outside Idaho latitude`);
  }
});
