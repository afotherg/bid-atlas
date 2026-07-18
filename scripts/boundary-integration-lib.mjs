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
  return text.split(/[.;]/).some((clause) => {
    if (inactivePattern.test(clause)) return true;
    if (!proposedPattern.test(clause)) return false;
    return !/\b(?:excluded|not formed|failed|rejected|abandoned)\b/i.test(clause);
  });
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
  const text = String(value ?? "");
  const match = text.match(/[?&]id=([a-f0-9]{32})/i)
    ?? text.match(/\/items\/([a-f0-9]{32})(?:[/?#]|$)/i)
    ?? text.match(/\/datasets\/(?:[^/?#]*--)?([a-f0-9]{32})(?:_(\d+))?(?:[/?#]|$)/i);
  return match?.[1] ?? "";
}

export function arcgisLayerId(value) {
  const text = String(value ?? "");
  const serviceMatch = text.match(/\/(?:FeatureServer|MapServer)\/(\d+)(?:[/?#]|$)/i);
  if (serviceMatch) return Number(serviceMatch[1]);
  const datasetMatch = text.match(/\/datasets\/(?:[^/?#]*--)?[a-f0-9]{32}_(\d+)(?:[/?#]|$)/i);
  return datasetMatch ? Number(datasetMatch[1]) : null;
}

export function selectArcgisBidLayers(layers = []) {
  return flattenArcgisLayers(layers).filter((layer) => bidPattern.test(layer.title ?? "") && layer.url);
}

export function automaticCandidateDecision(candidate) {
  if (candidate.active_status !== "verified_active") return { eligible: false, reason: `status is ${candidate.active_status}` };
  if (candidate.confidence !== "high") return { eligible: false, reason: `confidence is ${candidate.confidence}` };
  if (candidate.publication_recommendation === "exclude") return { eligible: false, reason: "recommendation is exclude" };
  if (!new Set(["arcgis_feature_layer", "arcgis_web_map", "geojson"]).has(candidate.boundary_source_type)) {
    return { eligible: false, reason: `boundary type ${candidate.boundary_source_type} requires manual work` };
  }
  if (!new Set(["auto_import", "manual_review"]).has(candidate.publication_recommendation)) {
    return { eligible: false, reason: `recommendation is ${candidate.publication_recommendation}` };
  }
  if (!normalizeUrl(candidate.status_url)) return { eligible: false, reason: "missing status evidence URL" };
  if (!normalizeUrl(candidate.boundary_source_url)) return { eligible: false, reason: "missing boundary URL" };
  if (hasBlockingStatusLanguage(candidate.name, candidate.boundary_title, candidate.notes)) return { eligible: false, reason: "candidate contains proposed or inactive language" };
  return {
    eligible: true,
    reason: candidate.publication_recommendation === "manual_review"
      ? "verified machine-readable boundary accepted for draft human review"
      : "passed automatic publication gates",
  };
}

export function applyMachineBoundaryRepairs(districts, repairs, evidenceUrls) {
  const approved = new Set(evidenceUrls.map(normalizeUrl).filter(Boolean));
  let applied = 0;
  for (const repair of repairs) {
    const district = districts.find((candidate) => candidate.name === repair.name);
    if (!district || district.active_status !== "verified_active") continue;
    if (!new Set(["arcgis_feature_layer", "arcgis_web_map", "geojson"]).has(repair.boundary_source_type)) continue;
    if (repair.confidence !== "high" || !approved.has(normalizeUrl(repair.boundary_source_url))) continue;
    district.boundary_source_url = repair.boundary_source_url;
    district.boundary_source_type = repair.boundary_source_type;
    district.boundary_title = repair.boundary_title;
    district.publication_recommendation = "auto_import";
    district.confidence = "high";
    district.notes = [district.notes, repair.notes, "Machine-readable source recovered by targeted boundary search."].filter(Boolean).join(" ");
    applied += 1;
  }
  return applied;
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

async function arcgisServiceLayers(serviceUrl, fetcher) {
  const response = await fetcher(`${String(serviceUrl).replace(/\/+$/, "")}?f=json`, {
    headers: { "user-agent": "BID-Atlas-Boundary-Agent/1.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`ArcGIS service metadata returned HTTP ${response.status}.`);
  const metadata = await response.json();
  if (metadata.error) throw new Error(`ArcGIS service metadata failed: ${metadata.error.message ?? "unknown error"}.`);
  return (metadata.layers ?? []).filter((layer) => !layer.geometryType || layer.geometryType === "esriGeometryPolygon");
}

export async function resolveArcgisFeatureLayer(url, fetcher = fetch) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("ArcGIS boundary URL is invalid.");
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(new URL(normalized).pathname)) {
    return { itemId: "", metadata: null, layerUrl: normalized };
  }

  const itemId = arcgisItemId(normalized);
  let serviceUrl = /\/(?:FeatureServer|MapServer)$/i.test(new URL(normalized).pathname) ? normalized : "";
  let metadata = null;
  if (!itemId && !serviceUrl && (/(?:^|\.)arcgis\.com$/i.test(new URL(normalized).hostname) || /\/datasets\//i.test(new URL(normalized).pathname))) {
    const pageResponse = await fetcher(normalized, {
      headers: { "user-agent": "BID-Atlas-Boundary-Agent/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!pageResponse.ok) throw new Error(`ArcGIS Hub page returned HTTP ${pageResponse.status}.`);
    const html = await pageResponse.text();
    const embeddedItem = html.match(/<meta[^>]+(?:twitter:image|og:image)[^>]+content=["'][^"']*\/items\/([a-f0-9]{32})(?:_\d+)?/i)
      ?? html.match(/\/sharing\/rest\/content\/items\/([a-f0-9]{32})(?:_\d+)?/i);
    if (!embeddedItem) throw new Error("ArcGIS Hub page does not expose a resolvable item ID.");
    return resolveArcgisFeatureLayer(`https://www.arcgis.com/home/item.html?id=${embeddedItem[1]}`, fetcher);
  }
  if (itemId) {
    const response = await fetcher(`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`, {
      headers: { "user-agent": "BID-Atlas-Boundary-Agent/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`ArcGIS item metadata returned HTTP ${response.status}.`);
    metadata = await response.json();
    if (metadata.error) throw new Error(`ArcGIS item metadata failed: ${metadata.error.message ?? "unknown error"}.`);
    serviceUrl = normalizeUrl(metadata.url);
    if (!serviceUrl || !/\/(?:FeatureServer|MapServer)(?:\/\d+)?$/i.test(new URL(serviceUrl).pathname)) {
      throw new Error(`ArcGIS item is ${metadata.type ?? "unknown"} and does not reference a feature service.`);
    }
  }
  if (!serviceUrl) throw new Error("ArcGIS feature-layer URL is neither a REST service nor a resolvable ArcGIS item.");
  if (/\/(?:FeatureServer|MapServer)\/\d+$/i.test(new URL(serviceUrl).pathname)) {
    return { itemId, metadata, layerUrl: serviceUrl };
  }

  const requestedLayerId = arcgisLayerId(normalized);
  if (requestedLayerId !== null) return { itemId, metadata, layerUrl: `${serviceUrl}/${requestedLayerId}` };
  const layers = await arcgisServiceLayers(serviceUrl, fetcher);
  if (layers.length !== 1) {
    const titles = layers.map((layer) => `${layer.name ?? layer.title ?? "unnamed"} (${layer.id})`).join(", ");
    throw new Error(layers.length
      ? `ArcGIS service has multiple polygon layers; use a layer URL: ${titles}`
      : "ArcGIS service has no polygon layer.");
  }
  return { itemId, metadata, layerUrl: `${serviceUrl}/${layers[0].id}` };
}

export function normalizeDistrictName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bparking\s+(?:and|&)\s+business\s+improvement\s+(?:area|district)\b/g, " ")
    .replace(/\bbusiness\s+improvement\s+(?:area|district)\b/g, " ")
    .replace(/\b(?:pbia|bia|bid|stia)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function districtNamesMatch(left, right) {
  const first = normalizeDistrictName(left);
  const second = normalizeDistrictName(right);
  if (!first || !second) return false;
  if (first === second) return true;
  const [shorter, longer] = first.length < second.length ? [first, second] : [second, first];
  return shorter.length >= 4 && (` ${longer} `).includes(` ${shorter} `);
}

function featureDistrictLabels(feature) {
  return Object.entries(feature.properties ?? {})
    .filter(([key, value]) => typeof value === "string" && /(?:^|_)(?:name|title|district|bia|bid)(?:$|_)/i.test(key))
    .map(([, value]) => value);
}

export function mergeBoundaryFeatures(features) {
  if (features.length === 1) return features[0];
  const coordinates = features.flatMap((feature) => feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates);
  return {
    type: "Feature",
    properties: { ...(features[0]?.properties ?? {}) },
    geometry: { type: "MultiPolygon", coordinates },
  };
}

export function selectDistrictBoundary(collection, districtName) {
  validateBoundaryCollection(collection);
  const labeledFeatures = collection.features.filter((feature) => featureDistrictLabels(feature).length);
  const matches = labeledFeatures.filter((feature) => featureDistrictLabels(feature).some((label) => districtNamesMatch(label, districtName)));
  if (matches.length) return { type: "FeatureCollection", features: [mergeBoundaryFeatures(matches)] };
  if (collection.features.length === 1) return collection;
  if (labeledFeatures.length) throw new Error(`Shared boundary layer has no feature matching district "${districtName}".`);
  throw new Error(`Boundary layer has ${collection.features.length} unlabeled features and cannot be assigned safely to "${districtName}".`);
}

export function arcgisGeojsonQueryUrl(layerUrl) {
  const query = new URL(`${String(layerUrl).replace(/\/+$/, "")}/query`);
  query.searchParams.set("where", "1=1");
  query.searchParams.set("outFields", "*");
  query.searchParams.set("returnGeometry", "true");
  query.searchParams.set("outSR", "4326");
  query.searchParams.set("f", "geojson");
  return query.toString();
}

export async function fetchArcgisGeojson(layerUrl, fetcher = fetch) {
  const query = arcgisGeojsonQueryUrl(layerUrl);
  const response = await fetcher(query, { headers: { "user-agent": "BID-Atlas-Boundary-Agent/1.0" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`ArcGIS layer query returned HTTP ${response.status}.`);
  return validateBoundaryCollection(await response.json());
}
