"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from "leaflet";
import "leaflet/dist/leaflet.css";

type BidProperties = {
  id: string;
  name: string;
  city: string;
  state: string;
  area: string | null;
  website: string | null;
  established: string | null;
  expires: string | null;
  annualRevenue: string | null;
  reportUrl: string | null;
  status: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  publisher: string;
  checkedAt: string;
  center: [number, number];
  bounds: [number, number, number, number];
  geometryType: string;
};

type BidFeature = Feature<Geometry, BidProperties>;
type BidCollection = FeatureCollection<Geometry, BidProperties>;
type Manifest = {
  generatedAt: string;
  records: number;
  states: string[];
  cities: string[];
  sources: { id: string; name: string; status: string; records: number }[];
  coverage: { verifiedJurisdictions: number; configuredSources: number; nationalRegistryAvailable: boolean };
  changeSummary: { added: number; modified: number; removed: number };
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shortDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const money = (value: string | null) => value && Number.isFinite(Number(value)) ? usd.format(Number(value)) : "Not published";

function MapCanvas({ data, selected, onSelect }: { data: BidCollection; selected: BidFeature | null; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<LeafletMap | null>(null);
  const leafletLayer = useRef<LeafletGeoJSON | null>(null);
  const googleMap = useRef<any>(null);
  const googleReady = useRef(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!host.current) return;
      if (apiKey) {
        if (!(window as any).google?.maps) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-bid-google-map]');
            if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); return; }
            const script = document.createElement("script");
            script.dataset.bidGoogleMap = "true";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Google Maps failed to load"));
            document.head.appendChild(script);
          });
        }
        if (cancelled || !host.current) return;
        googleMap.current = new (window as any).google.maps.Map(host.current, {
          center: { lat: 38.2, lng: -96.2 }, zoom: 4, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
        });
        googleMap.current.data.setStyle((feature: any) => ({
          fillColor: feature.getProperty("id") === selected?.properties.id ? "#ff5c35" : "#f4b942",
          fillOpacity: feature.getProperty("id") === selected?.properties.id ? 0.7 : 0.43,
          strokeColor: feature.getProperty("id") === selected?.properties.id ? "#111827" : "#a34b21",
          strokeWeight: feature.getProperty("id") === selected?.properties.id ? 2.5 : 1.2,
        }));
        googleMap.current.data.addListener("click", (event: any) => onSelect(event.feature.getProperty("id")));
        googleReady.current = true;
      } else {
        const L = await import("leaflet");
        if (cancelled || !host.current) return;
        leafletMap.current = L.map(host.current, { zoomControl: false, minZoom: 3 }).setView([38.2, -96.2], 4);
        L.control.zoom({ position: "bottomright" }).addTo(leafletMap.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(leafletMap.current);
      }
    }
    start().catch(() => {});
    return () => {
      cancelled = true;
      leafletMap.current?.remove();
      leafletMap.current = null;
      googleMap.current = null;
      googleReady.current = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (googleReady.current && googleMap.current) {
      googleMap.current.data.forEach((feature: any) => googleMap.current.data.remove(feature));
      googleMap.current.data.addGeoJson(data);
      googleMap.current.data.setStyle((feature: any) => ({
        fillColor: feature.getProperty("id") === selected?.properties.id ? "#ff5c35" : "#f4b942",
        fillOpacity: feature.getProperty("id") === selected?.properties.id ? 0.7 : 0.43,
        strokeColor: feature.getProperty("id") === selected?.properties.id ? "#111827" : "#a34b21",
        strokeWeight: feature.getProperty("id") === selected?.properties.id ? 2.5 : 1.2,
      }));
      return;
    }
    if (!leafletMap.current) return;
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !leafletMap.current) return;
      leafletLayer.current?.remove();
      leafletLayer.current = L.geoJSON(data as any, {
        style: (feature) => ({
          color: feature?.properties.id === selected?.properties.id ? "#111827" : "#a34b21",
          weight: feature?.properties.id === selected?.properties.id ? 3 : 1.25,
          fillColor: feature?.properties.id === selected?.properties.id ? "#ff5c35" : "#f4b942",
          fillOpacity: feature?.properties.id === selected?.properties.id ? 0.7 : 0.43,
        }),
        onEachFeature: (feature, layer) => layer.on("click", () => onSelect(feature.properties.id)),
      }).addTo(leafletMap.current);
    });
    return () => { active = false; };
  }, [data, selected, onSelect]);

  useEffect(() => {
    if (!selected) return;
    const [west, south, east, north] = selected.properties.bounds;
    if (googleMap.current && (window as any).google?.maps) {
      const bounds = new (window as any).google.maps.LatLngBounds({ lat: south, lng: west }, { lat: north, lng: east });
      googleMap.current.fitBounds(bounds, 64);
    } else leafletMap.current?.fitBounds([[south, west], [north, east]], { padding: [48, 48], maxZoom: 14 });
  }, [selected]);

  return (
    <div className="map-frame">
      <div ref={host} className="map-host" aria-label="Interactive map of business improvement districts" />
      <div className="map-provider"><span />{apiKey ? "Google Maps" : "OpenStreetMap preview"}</div>
    </div>
  );
}

function DetailDrawer({ bid, onClose }: { bid: BidFeature; onClose: () => void }) {
  const p = bid.properties;
  return (
    <aside className="detail-drawer" aria-label={`${p.name} details`}>
      <button className="close-button" onClick={onClose} aria-label="Close details">×</button>
      <div className="status-pill"><span /> {p.status}</div>
      <p className="eyebrow">{p.city}, {p.state}</p>
      <h2>{p.name}</h2>
      <p className="detail-intro">A locally governed district funding services and improvements within the highlighted boundary.</p>
      <div className="detail-grid">
        <div><small>Established</small><strong>{p.established || "Not published"}</strong></div>
        <div><small>Annual revenue</small><strong>{money(p.annualRevenue)}</strong></div>
        <div><small>Area / wards</small><strong>{p.area || "See source"}</strong></div>
        <div><small>Boundary</small><strong>{p.geometryType}</strong></div>
      </div>
      <section className="source-card">
        <span className="source-icon">◎</span>
        <div><small>Verified source</small><strong>{p.publisher}</strong><p>Checked {shortDate(p.checkedAt)}</p></div>
      </section>
      <div className="drawer-actions">
        {p.website && <a className="primary-action" href={p.website} target="_blank" rel="noreferrer">Visit district ↗</a>}
        <a className="secondary-action" href={p.sourceUrl} target="_blank" rel="noreferrer">View official record ↗</a>
        {p.reportUrl && <a className="text-action" href={p.reportUrl} target="_blank" rel="noreferrer">Latest annual report ↗</a>}
      </div>
    </aside>
  );
}

export default function Home() {
  const [collection, setCollection] = useState<BidCollection>({ type: "FeatureCollection", features: [] });
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    const dataUrl = (file: string) => new URL(`data/${file}`, document.baseURI).toString();
    Promise.all([
      fetch(dataUrl("bids.geojson")).then((r) => r.json()),
      fetch(dataUrl("manifest.json")).then((r) => r.json()),
    ]).then(([bids, meta]) => { setCollection(bids); setManifest(meta); });
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collection.features.filter((feature) => {
      const p = feature.properties;
      return (state === "ALL" || p.state === state) && (!needle || `${p.name} ${p.city} ${p.state}`.toLowerCase().includes(needle));
    });
  }, [collection, query, state]);
  const filteredCollection = useMemo<BidCollection>(() => ({ type: "FeatureCollection", features: filtered }), [filtered]);
  const selected = collection.features.find((feature) => feature.properties.id === selectedId) ?? null;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">B</span><span>BID <b>ATLAS</b></span></a>
        <div className="header-meta"><span className="live-dot" /> Live directory <i /> Updated {manifest ? shortDate(manifest.generatedAt) : "—"}</div>
        <a className="about-link" href="#methodology">Methodology</a>
      </header>

      <section className="hero">
        <div>
          <p className="kicker">UNITED STATES BUSINESS DISTRICTS</p>
          <h1>Find the people<br />shaping <em>main street.</em></h1>
          <p className="hero-copy">Explore verified Business Improvement Districts and their local equivalents. Inspect boundaries, find official contacts, and trace every record to its source.</p>
        </div>
        <div className="hero-stats">
          <div><strong>{manifest?.records ?? "—"}</strong><span>verified districts</span></div>
          <div><strong>{manifest?.coverage.verifiedJurisdictions ?? "—"}</strong><span>jurisdictions covered</span></div>
          <div><strong>{manifest?.states.length ?? "—"}</strong><span>states in current release</span></div>
        </div>
      </section>

      <section className="explorer" aria-label="BID map explorer">
        <div className="toolbar">
          <label className="searchbox"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search district, city, or state" aria-label="Search districts" /></label>
          <label className="selectbox">State<select value={state} onChange={(e) => setState(e.target.value)}><option value="ALL">All covered states</option>{manifest?.states.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          <button className="list-toggle" onClick={() => setListOpen((value) => !value)}>{listOpen ? "Hide" : "Show"} list</button>
          <span className="result-count">{filtered.length} results</span>
        </div>
        <div className={`workspace ${listOpen ? "with-list" : ""}`}>
          {listOpen && <div className="result-list" aria-label="District results">
            <div className="list-heading"><span>District directory</span><small>Official records</small></div>
            {filtered.slice(0, 250).map((feature) => {
              const p = feature.properties;
              return <button key={p.id} className={`result-row ${selectedId === p.id ? "active" : ""}`} onClick={() => setSelectedId(p.id)}>
                <span className="row-pin" /><span><strong>{p.name}</strong><small>{p.city}, {p.state} · {p.geometryType}</small></span><span className="row-arrow">›</span>
              </button>;
            })}
            {!filtered.length && <div className="empty-state">No districts match this search.</div>}
          </div>}
          <MapCanvas data={filteredCollection} selected={selected} onSelect={setSelectedId} />
          {selected && <DetailDrawer bid={selected} onClose={() => setSelectedId(null)} />}
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div><p className="kicker">HONEST COVERAGE</p><h2>A living directory,<br />not a frozen list.</h2></div>
        <div className="method-copy"><p>There is no authoritative national BID registry. BID Atlas starts with official municipal and state GIS feeds, preserves source provenance, and reports coverage instead of implying completeness.</p><p>The automated administrator checks configured feeds daily, compares record and boundary fingerprints, retains the last good data when a source fails, and produces a review queue for newly discovered public datasets.</p></div>
        <div className="pipeline">
          <div><b>01</b><strong>Discover</strong><span>Search public catalogs</span></div><i>→</i><div><b>02</b><strong>Verify</strong><span>Prefer government GIS</span></div><i>→</i><div><b>03</b><strong>Compare</strong><span>Hash records + geometry</span></div><i>→</i><div><b>04</b><strong>Publish</strong><span>Update map and report</span></div>
        </div>
      </section>

      <footer><span>BID ATLAS</span><p>Public-interest directory · Source-led and transparent</p><a href="mailto:alan@fothergill.com">Suggest a district</a></footer>
    </main>
  );
}
