const proposedPattern = /\b(proposed|proposal|draft|study area|potential|candidate)\b/i;
const inactivePattern = /\b(dissolved|expired|historical|inactive|terminated|repealed)\b/i;
const bidPattern = /\b(business improvement district|bid)\b/i;

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function hasBlockingStatusLanguage(...values) {
  const text = values.filter(Boolean).join(" ");
  return proposedPattern.test(text) || inactivePattern.test(text);
}

export function flattenArcgisLayers(layers = []) {
  const flattened = [];
  for (const layer of layers) {
    if (layer.layers?.length) flattened.push(...flattenArcgisLayers(layer.layers));
    else flattened.push(layer);
  }
  return flattened;
}

export function arcgisItemId(value) {
  const match = String(value ?? "").match(/[?&]id=([a-f0-9]{32})/i) ?? String(value ?? "").match(/\/items\/([a-f0-9]{32})/i);
  return match?.[1] ?? "";
}

export function selectArcgisBidLayers(layers = []) {
  return flattenArcgisLayers(layers).filter((layer) => bidPattern.test(layer.title ?? "") && layer.url);
}

export function automaticCandidateDecision(candidate) {
  if (candidate.active_status !== "verified_active") return { eligible: false, reason: `status is ${candidate.active_status}` };
  if (candidate.confidence !== "high") return { eligible: false, reason: `confidence is ${candidate.confidence}` };
  if (candidate.publication_recommendation !== "auto_import") return { eligible: false, reason: `recommendation is ${candidate.publication_recommendation}` };
  if (!new Set(["arcgis_feature_layer", "arcgis_web_map", "geojson"]).has(candidate.boundary_source_type)) {
    return { eligible: false, reason: `boundary type ${candidate.boundary_source_type} requires manual work` };
  }
  if (!normalizeUrl(candidate.status_url)) return { eligible: false, reason: "missing status evidence URL" };
  if (!normalizeUrl(candidate.boundary_source_url)) return { eligible: false, reason: "missing boundary URL" };
  if (hasBlockingStatusLanguage(candidate.name, candidate.boundary_title, candidate.notes)) return { eligible: false, reason: "candidate contains proposed or inactive language" };
  return { eligible: true, reason: "passed automatic publication gates" };
}

export function validateBoundaryCollection(collection) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) {
    throw new Error("Boundary source did not return a non-empty FeatureCollection.");
  }
  for (const [index, feature] of collection.features.entries()) {
    if (!new Set(["Polygon", "MultiPolygon"]).has(feature?.geometry?.type)) {
      throw new Error(`Boundary feature ${index + 1} is not a Polygon or MultiPolygon.`);
    }
  }
  return collection;
}

export function coordinateBounds(coordinates, bounds = [Infinity, Infinity, -Infinity, -Infinity]) {
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
}

export function validateStateBounds(collection, expectedBounds) {
  for (const feature of collection.features) {
    const [west, south, east, north] = coordinateBounds(feature.geometry.coordinates);
    const [stateWest, stateSouth, stateEast, stateNorth] = expectedBounds;
    if (west < stateWest || east > stateEast || south < stateSouth || north > stateNorth) {
      throw new Error(`Boundary lies outside the expected state bounds: ${[west, south, east, north].join(", ")}`);
    }
  }
}

export async function resolveArcgisWebMap(url, fetcher = fetch) {
  const itemId = arcgisItemId(url);
  if (!itemId) throw new Error("ArcGIS Web Map URL does not contain a 32-character item ID.");
  const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}`;
  const [metadataResponse, dataResponse] = await Promise.all([
    fetcher(`${itemUrl}?f=json`),
    fetcher(`${itemUrl}/data?f=json`),
  ]);
  if (!metadataResponse.ok) throw new Error(`ArcGIS item metadata returned HTTP ${metadataResponse.status}.`);
  if (!dataResponse.ok) throw new Error(`ArcGIS item data returned HTTP ${dataResponse.status}.`);
  const metadata = await metadataResponse.json();
  const data = await dataResponse.json();
  if (metadata.type !== "Web Map") throw new Error(`ArcGIS item is ${metadata.type ?? "unknown"}, not a Web Map.`);
  const layers = selectArcgisBidLayers(data.operationalLayers);
  if (!layers.length) throw new Error("ArcGIS Web Map has no BID-named feature layer.");
  return { itemId, metadata, layers };
}

export async function fetchArcgisGeojson(layerUrl, fetcher = fetch) {
  const query = new URL(`${String(layerUrl).replace(/\/+$/, "")}/query`);
  query.searchParams.set("where", "1=1");
  query.searchParams.set("outFields", "*");
  query.searchParams.set("returnGeometry", "true");
  query.searchParams.set("outSR", "4326");
  query.searchParams.set("f", "geojson");
  const response = await fetcher(query, { headers: { "user-agent": "BID-Atlas-Boundary-Agent/1.0" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`ArcGIS layer query returned HTTP ${response.status}.`);
  return validateBoundaryCollection(await response.json());
}
