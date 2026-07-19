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

test("Santa Monica publishes its eight operational business and property assessment districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "santa-monica-business-improvement-districts");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 5);
  for (const name of [
    "Main Street",
    "Montana Avenue",
    "Pico Boulevard",
    "Central Business District",
    "Downtown Santa Monica Mall Operations & Maintenance District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -118, `${district.properties.name} is outside Santa Monica longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${district.properties.name} is outside Santa Monica latitude`);
  }
  const propertyDistricts = collection.features.filter((feature) => feature.properties.sourceId === "santa-monica-property-based-assessment-districts");
  const propertyNames = new Set(propertyDistricts.map((feature) => feature.properties.name));
  assert.equal(propertyDistricts.length, 3);
  for (const name of [
    "Downtown Santa Monica Property-Based Assessment District",
    "Colorado Avenue Overlay Zone",
    "Lincoln Boulevard Property-Based Assessment District",
  ]) assert.ok(propertyNames.has(name), `missing ${name}`);
  for (const district of propertyDistricts) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.properties.expires, "2028");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -118, `${district.properties.name} is outside Santa Monica longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${district.properties.name} is outside Santa Monica latitude`);
  }
});

test("Downtown Fresno publishes its renewed property and business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "downtown-fresno-property-business-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Downtown Fresno Property and Business Improvement District");
  assert.equal(district.properties.established, "2010");
  assert.equal(district.properties.expires, "2032");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -121 && longitude < -118, "district is outside Fresno longitude");
  assert.ok(latitude > 36 && latitude < 38, "district is outside Fresno latitude");
});

test("Downtown Napa publishes its renewed property and business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "downtown-napa-property-business-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Downtown Napa Property and Business Improvement District");
  assert.equal(district.properties.established, "2005");
  assert.equal(district.properties.expires, "2032");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -123 && longitude < -121, "district is outside Napa longitude");
  assert.ok(latitude > 37 && latitude < 39, "district is outside Napa latitude");
});

test("Downtown Merced publishes its active property-based improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "downtown-merced-property-based-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Downtown Merced Property-Based Improvement District");
  assert.equal(district.properties.established, "2023");
  assert.equal(district.properties.expires, "2028");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -122 && longitude < -119, "district is outside Merced longitude");
  assert.ok(latitude > 36 && latitude < 38, "district is outside Merced latitude");
});

test("Palm Springs publishes its active small-hotel tourism business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "palm-springs-small-hotel-tourism-business-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.established, "2016");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -118 && longitude < -115, "district is outside Palm Springs longitude");
  assert.ok(latitude > 32 && latitude < 35, "district is outside Palm Springs latitude");
});

test("Riverside publishes its three active business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "riverside-business-improvement-districts");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 3);
  for (const [name, established] of [
    ["Downtown Parking and Business Improvement Area", "1985"],
    ["Arlington Business Improvement District", "2002"],
    ["Auto Center Business Improvement District", "2011"],
  ]) {
    assert.ok(names.has(name), `missing ${name}`);
    const district = districts.find((feature) => feature.properties.name === name);
    assert.equal(district.properties.established, established);
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -116, `${name} is outside Riverside longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${name} is outside Riverside latitude`);
  }
});

test("Stockton publishes its three current improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Stockton" && feature.properties.state === "CA");
  const expected = new Map([
    ["Downtown Stockton Property and Business Improvement District", ["1997", "2026"]],
    ["Miracle Mile Community Improvement District", ["2023", "2042"]],
    ["Stockton Tourism Business Improvement District", ["2010", "2035"]],
  ]);
  assert.equal(districts.length, 3);
  for (const district of districts) {
    const term = expected.get(district.properties.name);
    assert.ok(term, `unexpected Stockton district ${district.properties.name}`);
    assert.equal(district.properties.established, term[0]);
    assert.equal(district.properties.expires, term[1]);
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -123 && longitude < -120, `${district.properties.name} is outside Stockton longitude`);
    assert.ok(latitude > 37 && latitude < 39, `${district.properties.name} is outside Stockton latitude`);
  }
});

test("Ontario publishes its downtown and regional tourism improvement districts", () => {
  const expected = new Map([
    ["Downtown Ontario Community Benefit District", ["2019", "2034"]],
    ["Greater Ontario Tourism Marketing District", ["2013", "2028"]],
  ]);
  const districts = collection.features.filter((feature) => expected.has(feature.properties.name));
  assert.equal(districts.length, 2);
  for (const district of districts) {
    const term = expected.get(district.properties.name);
    assert.equal(district.properties.established, term[0]);
    assert.equal(district.properties.expires, term[1]);
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -116, `${district.properties.name} is outside Ontario-area longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${district.properties.name} is outside Ontario-area latitude`);
  }
});

test("Apple Valley publishes its renewed Village property and business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "apple-valley-village-property-business-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Apple Valley Village Property and Business Improvement District");
  assert.equal(district.properties.established, "2007");
  assert.equal(district.properties.expires, "2032");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -119 && longitude < -116, "district is outside Apple Valley longitude");
  assert.ok(latitude > 33 && latitude < 36, "district is outside Apple Valley latitude");
});

test("Glendora publishes its current Village business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "glendora-village-business-improvement-district");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Glendora Village Business Improvement District");
  assert.equal(district.properties.established, "2009");
  assert.equal(district.properties.status, "Active");
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -119 && longitude < -116, "district is outside Glendora longitude");
  assert.ok(latitude > 33 && latitude < 35, "district is outside Glendora latitude");
});

test("Oakland publishes its ten current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.sourceId === "oakland-business-improvement-districts");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 10);
  for (const name of [
    "Chinatown",
    "Downtown Oakland Community Benefit District",
    "Jack London Improvement District",
    "Lake Merritt-Uptown Community Benefit District",
    "Montclair",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -123 && longitude < -121, `${district.properties.name} is outside Oakland longitude`);
    assert.ok(latitude > 37 && latitude < 39, `${district.properties.name} is outside Oakland latitude`);
  }
});

test("San Jose publishes eleven distinct active improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "San Jose" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 11);
  for (const name of [
    "Downtown San Jose Property-Based Improvement District",
    "Japantown Business Improvement District",
    "Monterey Corridor Business Improvement District",
    "The Alameda Community Benefit Improvement District",
    "Tully Road Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -123 && longitude < -121, `${district.properties.name} is outside San Jose longitude`);
    assert.ok(latitude > 36 && latitude < 38, `${district.properties.name} is outside San Jose latitude`);
  }
});

test("Long Beach publishes eight current non-tourism BID boundaries", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Long Beach" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 8);
  for (const name of [
    "Belmont Shore Parking and Business Improvement Area",
    "Bixby Knolls Parking and Business Improvement Area",
    "Downtown Long Beach Parking and Business Improvement Area",
    "Downtown Long Beach Property-Based Improvement District",
    "Fourth Street Parking and Business Improvement Area",
    "Midtown Property and Business Improvement District",
    "Uptown Property and Business Improvement District",
    "Zaferia Parking and Business Improvement Area",
  ]) assert.ok(names.has(name), `missing ${name}`);
  assert.ok(!districts.some((feature) => feature.properties.name.includes("Magnolia")));
  for (const district of districts) {
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -117, `${district.properties.name} is outside Long Beach longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${district.properties.name} is outside Long Beach latitude`);
  }
});

test("West Hollywood publishes its three current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "West Hollywood" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 3);
  for (const name of [
    "Sunset Strip Business Improvement District",
    "West Hollywood Design District Business Improvement District",
    "West Hollywood Tourism Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -118, `${district.properties.name} is outside West Hollywood longitude`);
    assert.ok(latitude > 34 && latitude < 35, `${district.properties.name} is outside West Hollywood latitude`);
  }
  const tourism = districts.find((feature) => feature.properties.sourceId === "west-hollywood-tourism-improvement-district");
  assert.ok(tourism, "missing citywide tourism district");
  assert.ok(tourism.properties.bounds[0] < -118.39);
  assert.ok(tourism.properties.bounds[2] > -118.35);
});

test("Sacramento publishes its 23 official PBID, BID, and BIA boundaries", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Sacramento" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 23);
  for (const name of [
    "16th Street PBID",
    "Downtown Sacramento Management District PBID",
    "Florin Road PBID",
    "Midtown Sacramento PBID",
    "R Street PBID",
    "Sacramento Tourism Infrastructure District 2018-04",
    "Sacramento Tourism Marketing District No. 2024-01",
  ]) assert.ok(names.has(name), `missing ${name}`);
  assert.equal(districts.filter((feature) => feature.properties.sourceId === "sacramento-property-business-improvement-districts").length, 13);
  assert.equal(districts.filter((feature) => feature.properties.sourceId === "sacramento-business-improvement-districts-areas").length, 10);
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -122 && longitude < -121, `${district.properties.name} is outside Sacramento longitude`);
    assert.ok(latitude > 38 && latitude < 39, `${district.properties.name} is outside Sacramento latitude`);
  }
  assert.equal(districts.find((feature) => feature.properties.name === "Downtown Sacramento Management District PBID").geometry.type, "MultiPolygon");
  assert.equal(districts.find((feature) => feature.properties.name === "Sacramento Tourism Marketing District No. 2024-01").geometry.type, "MultiPolygon");
});

test("Berkeley publishes its six current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Berkeley" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 6);
  for (const name of [
    "Berkeley Tourism Business Improvement District",
    "Downtown Berkeley Property-Based Business Improvement District",
    "Elmwood Business Improvement District",
    "North Shattuck Property-Based Business Improvement District",
    "Solano Avenue Business Improvement District",
    "Telegraph Property-Based Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -123 && longitude < -122, `${district.properties.name} is outside Berkeley longitude`);
    assert.ok(latitude > 37 && latitude < 38, `${district.properties.name} is outside Berkeley latitude`);
  }
  const tourism = districts.find((feature) => feature.properties.sourceId === "berkeley-tourism-business-improvement-district");
  assert.ok(tourism, "missing citywide tourism district");
  assert.ok(tourism.properties.bounds[0] < -122.36);
  assert.ok(tourism.properties.bounds[2] > -122.24);
  assert.equal(districts.find((feature) => feature.properties.name === "Solano Avenue Business Improvement District").geometry.type, "MultiPolygon");
});

test("Pasadena publishes its four current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Pasadena" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 4);
  for (const name of [
    "Old Pasadena Management District Property-Based Business Improvement District",
    "Pasadena Tourism Business Improvement District",
    "Playhouse Village Property and Business Improvement District",
    "South Lake Avenue Property and Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -117, `${district.properties.name} is outside Pasadena longitude`);
    assert.ok(latitude > 33 && latitude < 35, `${district.properties.name} is outside Pasadena latitude`);
  }
  const tourism = districts.find((feature) => feature.properties.sourceId === "pasadena-tourism-business-improvement-district");
  assert.ok(tourism, "missing citywide tourism district");
  assert.ok(tourism.properties.bounds[2] - tourism.properties.bounds[0] > 0.1);
});

test("Anaheim publishes its current tourism improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Anaheim" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Anaheim Tourism Improvement District");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.geometry.type, "MultiPolygon");
  assert.equal(district.geometry.coordinates.length, 2);
  assert.ok(district.properties.bounds[0] < -117.92);
  assert.ok(district.properties.bounds[2] > -117.88);
  assert.ok(district.properties.bounds[1] > 33 && district.properties.bounds[3] < 34);
});

test("Garden Grove publishes its current tourism improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Garden Grove" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Garden Grove Tourism Improvement District");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.properties.established, "2010");
  assert.equal(district.geometry.type, "Polygon");
  assert.ok(district.properties.bounds[0] < -117.92);
  assert.ok(district.properties.bounds[2] > -117.91);
  assert.ok(district.properties.bounds[1] > 33 && district.properties.bounds[3] < 34);
});

test("Costa Mesa publishes its current citywide tourism business improvement area", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Costa Mesa" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Costa Mesa Tourism and Promotion Business Improvement Area");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.properties.established, "1995");
  assert.equal(district.properties.area, "Citywide");
  assert.ok(district.properties.bounds[2] - district.properties.bounds[0] > 0.08);
  assert.ok(district.properties.bounds[1] > 33 && district.properties.bounds[3] < 34);
});

test("Newport Beach excludes its expired and disestablished business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Newport Beach" && feature.properties.state === "CA");
  assert.equal(districts.length, 0);
});

test("Dana Point publishes its current citywide tourism business improvement district", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Dana Point" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Dana Point Tourism Business Improvement District");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.properties.established, "2009");
  assert.equal(district.properties.area, "Citywide lodging businesses with 20 or more rooms");
  assert.ok(district.properties.bounds[2] - district.properties.bounds[0] > 0.08);
  assert.ok(district.properties.bounds[1] > 33 && district.properties.bounds[3] < 34);
});

test("Huntington Beach publishes its downtown and tourism business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Huntington Beach" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 2);
  assert.ok(names.has("Huntington Beach Downtown Business Improvement District"));
  assert.ok(names.has("Huntington Beach Tourism Business Improvement District"));
  const downtown = districts.find((feature) => feature.properties.sourceId === "huntington-beach-downtown-business-improvement-district");
  assert.equal(downtown.geometry.type, "MultiPolygon");
  assert.equal(downtown.geometry.coordinates.length, 9);
  const tourism = districts.find((feature) => feature.properties.sourceId === "huntington-beach-tourism-business-improvement-district");
  assert.equal(tourism.properties.established, "2014");
  assert.equal(tourism.properties.expires, "2028-06-30");
  assert.ok(tourism.properties.bounds[2] - tourism.properties.bounds[0] > 0.14);
});

test("Laguna Beach publishes its renewed citywide tourism marketing district", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Laguna Beach" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Laguna Beach Tourism Marketing District");
  assert.equal(district.properties.established, "2001");
  assert.equal(district.properties.expires, "2035-06-30");
  assert.equal(district.properties.area, "Citywide lodging businesses, including hotels and vacation rentals");
  assert.ok(district.properties.bounds[2] - district.properties.bounds[0] > 0.07);
  assert.ok(district.properties.bounds[1] > 33 && district.properties.bounds[3] < 34);
});

test("Manhattan Beach publishes its two current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Manhattan Beach" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 2);
  assert.ok(names.has("Downtown Manhattan Beach Business Improvement District"));
  assert.ok(names.has("North Manhattan Beach Business Improvement District"));
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    assert.equal(district.geometry.type, "Polygon");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -119 && longitude < -118, `${district.properties.name} is outside Manhattan Beach longitude`);
    assert.ok(latitude > 33 && latitude < 34, `${district.properties.name} is outside Manhattan Beach latitude`);
  }
});

test("Burlingame publishes its two current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Burlingame" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 2);
  assert.ok(names.has("Broadway Area Business Improvement District"));
  assert.ok(names.has("Burlingame Avenue Area Business Improvement District"));
  for (const district of districts) {
    assert.equal(district.properties.status, "Active");
    const [longitude, latitude] = district.properties.center;
    assert.ok(longitude > -123 && longitude < -122, `${district.properties.name} is outside Burlingame longitude`);
    assert.ok(latitude > 37 && latitude < 38, `${district.properties.name} is outside Burlingame latitude`);
  }
});

test("San Mateo publishes its current downtown business improvement area", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "San Mateo" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Downtown San Mateo Business Improvement Area");
  assert.equal(district.properties.established, "1986");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.geometry.type, "Polygon");
  assert.ok(district.properties.bounds[2] - district.properties.bounds[0] > 0.01);
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -123 && longitude < -122, "San Mateo district has an unexpected longitude");
  assert.ok(latitude > 37 && latitude < 38, "San Mateo district has an unexpected latitude");
});

test("Redwood City publishes its current downtown community benefit district", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Redwood City" && feature.properties.state === "CA");
  assert.equal(districts.length, 1);
  const [district] = districts;
  assert.equal(district.properties.name, "Downtown Redwood City Community Benefit Improvement District");
  assert.equal(district.properties.established, "2015");
  assert.equal(district.properties.expires, "2029-12-31");
  assert.equal(district.properties.status, "Active");
  assert.equal(district.geometry.type, "Polygon");
  assert.ok(district.properties.bounds[2] - district.properties.bounds[0] > 0.01);
  const [longitude, latitude] = district.properties.center;
  assert.ok(longitude > -123 && longitude < -122, "Redwood City district has an unexpected longitude");
  assert.ok(latitude > 37 && latitude < 38, "Redwood City district has an unexpected latitude");
});

test("Santa Cruz publishes its three current business improvement districts", () => {
  const districts = collection.features.filter((feature) => feature.properties.city === "Santa Cruz" && feature.properties.state === "CA");
  const names = new Set(districts.map((feature) => feature.properties.name));
  assert.equal(districts.length, 3);
  for (const name of [
    "Downtown Santa Cruz Parking and Business Improvement Area",
    "Cooperative Retail Management Business Real Property Improvement District",
    "Midtown Santa Cruz Business Improvement District",
  ]) assert.ok(names.has(name), `missing ${name}`);
  const district = districts.find((feature) => feature.properties.name === "Midtown Santa Cruz Business Improvement District");
  assert.equal(district.properties.established, "2026");
  assert.equal(districts.find((feature) => feature.properties.name.startsWith("Downtown Santa Cruz")).properties.established, "1990");
  assert.equal(districts.find((feature) => feature.properties.name.startsWith("Cooperative Retail")).properties.established, "1994");
  for (const current of districts) {
    assert.equal(current.properties.status, "Active");
    const [longitude, latitude] = current.properties.center;
    assert.ok(longitude > -123 && longitude < -121, `${current.properties.name} has an unexpected longitude`);
    assert.ok(latitude > 36 && latitude < 38, `${current.properties.name} has an unexpected latitude`);
  }
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

test("Nevada publishes the verified Downtown Reno BID", () => {
  const districts = collection.features.filter((feature) => feature.properties.state === "NV");
  assert.equal(districts.length, 1);
  assert.equal(districts[0].properties.name, "Downtown Reno Business Improvement District");
  assert.equal(districts[0].properties.city, "Reno");
  const [longitude, latitude] = districts[0].properties.center;
  assert.ok(longitude > -120 && longitude < -119);
  assert.ok(latitude > 39 && latitude < 40);
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
