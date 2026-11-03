/* Xylem 3D map (MapLibre GL). Real terrain and imagery, real buildings and waterways (OpenStreetMap via OpenFreeMap),
 * real canals, aqueducts, treatment plants and water towers (OpenStreetMap via Overpass, data/infrastructure.json),
 * and the funding plan placed on top. Sources: AWS Terrain Tiles (SRTM/GMTED), Esri World Imagery, OpenFreeMap. */
(function () {
  "use strict";
  const FUND = "#19d3a2", FAIL = "#ef4b4b", RISK = "#f3a73a", ROUTE = "#19d3a2";
  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const HOME = { center: [-119.3, 37.1], zoom: 5.25, pitch: 55, bearing: -12 };
  const CITIES = { "Los Angeles": [-118.25, 34.05], "San Francisco Bay": [-122.35, 37.78], "San Diego": [-117.16, 32.72], "Sacramento": [-121.49, 38.58],
    "Fresno": [-119.79, 36.74], "Bakersfield": [-119.02, 35.37], "San Jose": [-121.89, 37.34] };
  const EMPTY = { type: "FeatureCollection", features: [] };
  const V = (window.Xylem3D = {});
  let map = null, D = null, box = null, ready = false, infra = null, popup = null, hud = {};
  const opt = { base: "sat", areas: true, infra: true, buildings: true, unfunded: true, exag: 1.8 };

  const circle = (lon, lat, r, n = 14) => { const dl = r / 111320, dx = r / (111320 * Math.cos(lat * Math.PI / 180)), c = [];
    for (let k = 0; k <= n; k++) { const a = (k / n) * 2 * Math.PI; c.push([lon + Math.cos(a) * dx, lat + Math.sin(a) * dl]); } return c; };
  const square = (lon, lat, w, h) => { const dl = h / 2 / 111320, dx = w / 2 / (111320 * Math.cos(lat * Math.PI / 180)); return [[lon - dx, lat - dl], [lon + dx, lat - dl], [lon + dx, lat + dl], [lon - dx, lat + dl], [lon - dx, lat - dl]]; };
  const poly = (ring, p) => ({ type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [ring] } });

  async function buildStyle() {
    const st = await fetch(STYLE_URL).then((r) => r.json());
    st.sources.dem = { type: "raster-dem", tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Elevation: AWS Terrain Tiles (SRTM, GMTED)" };
    st.sources.demhs = Object.assign({}, st.sources.dem);
    st.sources.sat = { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 18, attribution: "Imagery &copy; Esri" };
    st.sources.infra = { type: "geojson", data: EMPTY }; st.sources.sites3d = { type: "geojson", data: EMPTY };
    st.sources.sys = { type: "geojson", data: EMPTY }; st.sources.towers = { type: "geojson", data: EMPTY }; st.sources.routes = { type: "geojson", data: EMPTY };
    st.sources.sel = { type: "geojson", data: EMPTY }; st.sources.areas = { type: "geojson", data: EMPTY }; st.sources.counties = { type: "geojson", data: EMPTY };
    st.terrain = { source: "dem", exaggeration: opt.exag };
    st.sky = { "sky-color": "#6aa6dd", "horizon-color": "#dbe9f5", "fog-color": "#dbe6ef", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.45,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 1, 13, 0] };
    st.layers = st.layers.filter((l) => !/^poi_/.test(l.id) && l.id !== "road_one_way_arrow" && l.id !== "road_one_way_arrow_opposite");
    const at = st.layers.findIndex((l) => l.id === "waterway_tunnel");
    st.layers.splice(at, 0,
      { id: "sat", type: "raster", source: "sat", layout: { visibility: "visible" }, paint: { "raster-saturation": -0.05, "raster-contrast": 0.08 } },
      { id: "hill", type: "hillshade", source: "demhs", paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#142231", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#3a4a5c", "hillshade-illumination-direction": 295 } });
    const b3 = st.layers.find((l) => l.id === "building-3d");
    b3.minzoom = 13; b3.paint["fill-extrusion-color"] = ["interpolate", ["linear"], ["get", "render_height"], 0, "#d9d4cc", 60, "#e9e6e0", 200, "#f6f4f0"];
    b3.paint["fill-extrusion-opacity"] = 0.96; b3.paint["fill-extrusion-vertical-gradient"] = true;
    const firstSym = st.layers.findIndex((l) => l.type === "symbol" && !/^waterway|^water_name/.test(l.id));
    const add = (...ls) => st.layers.splice(firstSym, 0, ...ls);
    const w = (a, b, c) => ["interpolate", ["linear"], ["zoom"], 5, a, 9, b, 14, c];
    const stColor = ["match", ["get", "st"], 0, FUND, 1, FAIL, RISK];
    add(
      { id: "areas", type: "fill", source: "areas", paint: { "fill-color": stColor, "fill-opacity": ["match", ["get", "st"], 0, 0.62, 1, 0.62, 0.5] } },
      { id: "areas-line", type: "line", source: "areas", paint: { "line-color": stColor, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 9, 2.4, 13, 3], "line-opacity": 1 } },
      { id: "counties", type: "line", source: "counties", paint: { "line-color": "#ffffff", "line-opacity": 0.28, "line-width": 0.7 } },
      { id: "infra-casing", type: "line", source: "infra", filter: ["in", ["get", "k"], ["literal", ["canal", "aqueduct", "pipeline"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b2a4a", "line-opacity": 0.55, "line-width": w(2.6, 4.6, 12) } },
      { id: "infra-water", type: "line", source: "infra", filter: ["in", ["get", "k"], ["literal", ["canal", "aqueduct"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3fb8ff", "line-width": w(1.4, 2.6, 8) } },
      { id: "infra-pipe", type: "line", source: "infra", filter: ["==", ["get", "k"], "pipeline"], paint: { "line-color": "#b9c4cf", "line-width": w(1, 1.8, 5) } },
      { id: "infra-tunnel", type: "line", source: "infra", filter: ["==", ["get", "k"], "tunnel"], paint: { "line-color": "#ffd38a", "line-width": w(1.2, 2, 5), "line-dasharray": [2, 1.5] } },
      { id: "routes-casing", type: "line", source: "routes", paint: { "line-color": "#06382c", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 9] } },
      { id: "routes", type: "line", source: "routes", paint: { "line-color": ROUTE, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 5] } },
      { id: "sites3d", type: "fill-extrusion", source: "sites3d", minzoom: 12, paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 1 } },
      { id: "towers", type: "fill-extrusion", source: "towers", minzoom: 11, paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } },
      { id: "infra-label", type: "symbol", source: "infra", minzoom: 7.5, filter: ["!=", ["get", "n"], ""], layout: { "symbol-placement": "line", "text-field": ["get", "n"], "text-font": ["Noto Sans Italic"], "text-size": 11, "symbol-spacing": 400 },
        paint: { "text-color": "#d6eeff", "text-halo-color": "#0b2a4a", "text-halo-width": 1.4 } });
    st.layers.push(
      { id: "sites-dot", type: "circle", source: "sites3d", filter: ["==", ["geometry-type"], "Point"], minzoom: 8, maxzoom: 12, paint: { "circle-radius": 3, "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } },
      { id: "sys-risk", type: "circle", source: "sys", minzoom: 8.5, filter: ["==", ["get", "st"], 2], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, ["*", ["get", "k"], 0.7], 14, 5], "circle-color": RISK, "circle-opacity": 0.75, "circle-stroke-color": "#fff", "circle-stroke-width": 0.6 } },
      { id: "sys", type: "circle", source: "sys", filter: ["!=", ["get", "st"], 2], layout: { "circle-sort-key": ["-", 3, ["get", "st"]] },
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["*", ["get", "k"], 0.6], 8, ["*", ["get", "k"], 1.1], 12, ["*", ["get", "k"], 1.5], 15, 5],
          "circle-color": ["match", ["get", "st"], 0, FUND, FAIL], "circle-opacity": ["match", ["get", "st"], 0, 1, 0.8],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": ["match", ["get", "st"], 0, 1.8, 0.5] } },
      { id: "sel", type: "circle", source: "sel", paint: { "circle-radius": 17, "circle-color": "rgba(255,255,255,0)", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    return st;
  }

  // ---------- data ----------
  function refreshSystems() {
    if (!ready || !D) return;
    const mode = D.colorMode(), feats = [], towers = [], areas = [];
    const stOf = (i) => { const s = D.systems[i]; return mode === "plan" && D.inPlan[i] ? 0 : s.failing ? 1 : 2; };
    if (D.polys) D.polys.features.forEach((ft) => { const i = D.idx.get(ft.properties.id); if (i === undefined || (!opt.unfunded && !D.inPlan[i])) return;
      areas.push({ type: "Feature", properties: { st: stOf(i) }, geometry: ft.geometry }); });
    map.getSource("areas").setData({ type: "FeatureCollection", features: areas });
    D.systems.forEach((s, i) => {
      if (s.lat == null || !s.lon) return;
      const funded = !!D.inPlan[i], st = stOf(i), k = Math.min(9, 2.4 + Math.sqrt(s.pop) / 55);
      if (!opt.unfunded && !funded) return;
      feats.push({ type: "Feature", properties: { i, st, k: funded ? k * 1.3 : k * 0.65 }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
      const r = Math.min(34, 11 + Math.sqrt(s.pop) / 22) * (funded ? 1.5 : 1), c = funded ? "#1fbf93" : s.failing ? "#d94444" : "#e0a03a", h = r * 1.9;
      towers.push(poly(circle(s.lon, s.lat, r * 0.3, 8), { c: "#c9d1d9", b: 0, h }), poly(circle(s.lon, s.lat, r, 16), { c, b: h, h: h + r * 1.05 }));
    });
    map.getSource("sys").setData({ type: "FeatureCollection", features: feats });
    map.getSource("towers").setData({ type: "FeatureCollection", features: towers });
    const rt = [];
    if (D.routeLines) D.routeLines.features.forEach((f) => { const i = D.idx.get(f.properties.id), r = D.RT[f.properties.id]; if (i !== undefined && D.inPlan[i] && r && r.viable && r.receiver) rt.push(f); });
    map.getSource("routes").setData({ type: "FeatureCollection", features: rt });
    if (hud.chip) { const s = D.summary(); hud.chip.innerHTML = `<span>Budget <b>${s.budget}</b></span><span><b>${s.systems}</b> systems funded</span><span><b>${s.people}</b> people reached</span>`; }
  }
  function refreshInfra() {
    if (!ready || !infra) return;
    map.getSource("infra").setData({ type: "FeatureCollection", features: infra.lines.map((l) => ({ type: "Feature", properties: { k: l.k, n: l.n }, geometry: { type: "LineString", coordinates: l.c } })) });
    const f = [];
    infra.sites.forEach((s) => {
      if (s.k === "wastewater") return;                          // drinking-water context only
      if (s.k === "tower") { f.push(poly(circle(s.x, s.y, 2.6, 8), { c: "#cfd6dc", b: 0, h: 24 }), poly(circle(s.x, s.y, 7, 12), { c: "#eef2f5", b: 24, h: 33 })); return; }
      const wst = s.k === "wastewater", col = wst ? "#9b8467" : "#6f8aa6";
      f.push(poly(square(s.x, s.y, 70, 44), { c: col, b: 0, h: 14 }), poly(square(s.x + 0.0004, s.y + 0.0003, 26, 26), { c: "#dfe5ea", b: 14, h: 24 }), poly(circle(s.x - 0.0006, s.y - 0.0004, 16, 14), { c: "#b6c3cf", b: 0, h: 5 }));
      f.push({ type: "Feature", properties: { c: wst ? "#c9a46b" : "#7fc3ff" }, geometry: { type: "Point", coordinates: [s.x, s.y] } });
    });
    map.getSource("sites3d").setData({ type: "FeatureCollection", features: f });
  }
  function applyOpts() {
    if (!ready) return;
    const sat = opt.base === "sat", vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("sat", sat); vis("water", !sat); vis("building", false);
    map.setPaintProperty("hill", "hillshade-exaggeration", sat ? ["interpolate", ["linear"], ["zoom"], 6, 0.3, 12, 0.08] : ["interpolate", ["linear"], ["zoom"], 6, 0.6, 13, 0.3]);
    map.getStyle().layers.forEach((l) => { if (/^(road_|bridge_|tunnel_)/.test(l.id) && l.type === "line") map.setPaintProperty(l.id, "line-opacity", sat ? 0.55 : 1); });
    vis("areas", opt.areas); vis("areas-line", opt.areas);
    ["infra-casing", "infra-water", "infra-pipe", "infra-tunnel", "infra-label", "sites3d", "sites-dot"].forEach((id) => vis(id, opt.infra));
    vis("building-3d", opt.buildings);
    map.setTerrain({ source: "dem", exaggeration: opt.exag });
  }

  // ---------- fly-to ----------
  V.home = () => map && map.flyTo(Object.assign({ duration: 2200, essential: true }, HOME));
  // The camera centre sits at a height above sea level; aim it at the ground under the target so the marker lands mid-screen.
  V.flyToLonLat = (lon, lat, zoom) => {
    if (!map) return;
    const el = () => map.queryTerrainElevation([lon, lat]) || 0, e0 = el();
    map.flyTo({ center: [lon, lat], zoom: zoom || 12, pitch: 62, bearing: -20, elevation: e0, duration: 2600, essential: true });
    map.once("moveend", () => { const e1 = el(); if (Math.abs(e1 - e0) > 30) map.easeTo({ elevation: e1, duration: 700 }); });
  };
  V.flyToSystem = (i) => { const s = D.systems[i]; if (!s || s.lat == null) return; select(i); V.flyToLonLat(s.lon, s.lat, 14.2); };
  V.flyToCounty = (name) => { const p = D.systems.filter((s) => s.county === name && s.lat != null && s.lon).map((s) => [s.lon, s.lat]); if (!p.length) return;
    const b = p.reduce((a, c) => a.extend(c), new maplibregl.LngLatBounds(p[0], p[0])); map.fitBounds(b, { padding: 90, maxZoom: 11, pitch: 58, bearing: -15, duration: 2400 }); };
  function select(i) {
    const s = D.systems[i]; map.getSource("sel").setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }] });
    D.onSelect && D.onSelect(i);
  }

  // ---------- mount ----------
  V.mount = async function (container, data) {
    D = data; box = container; box.innerHTML = "";
    if (!window.maplibregl) { box.textContent = "This browser cannot show the 3D map (WebGL is required)."; return; }
    const mapDiv = document.createElement("div"); mapDiv.className = "gl3d"; box.appendChild(mapDiv);
    const load = document.createElement("div"); load.className = "load3d"; load.textContent = "Loading California terrain…"; box.appendChild(load);
    let style; try { style = await buildStyle(); } catch (e) { load.textContent = "Could not load the map style. Check your connection."; return; }
    map = new maplibregl.Map(Object.assign({ container: mapDiv, style, maxPitch: 82, maxZoom: 17.5, minZoom: 4, attributionControl: false, canvasContextAttributes: { antialias: true } }, HOME));
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    buildHud();
    map.on("load", async () => {
      ready = true; load.remove(); applyOpts(); refreshSystems();
      try { infra = await fetch("data/infrastructure.json").then((r) => r.json()); refreshInfra(); } catch (e) { /* infrastructure layer is optional */ }
      if (D.counties) map.getSource("counties").setData(D.counties);
    });
    map.on("click", (e) => { const f = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ["sys", "sys-risk"] }); if (f.length) select(f[0].properties.i); });
    map.on("mousemove", (e) => { const f = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ["sys", "sys-risk"] }); map.getCanvas().style.cursor = f.length ? "pointer" : ""; });
    map.on("error", (e) => console.warn("map3d:", e && e.error && e.error.message));
  };
  V.setData = (data) => { D = data; refreshSystems(); };
  V.show = () => { if (map) { map.resize(); } };
  V.hide = () => {};
  V.map = () => map;

  function buildHud() {
    const el = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
    hud.chip = el(`<div class="chip3d"></div>`);
    const panel = el(`<div class="hud3d">
      <select data-jump aria-label="Jump to"><option value="">Jump to a city…</option>${Object.keys(CITIES).map((c) => `<option>${c}</option>`).join("")}</select>
      <label class="chk"><input type="checkbox" data-k="areas" checked> Service-area shading</label>
      <label class="chk"><input type="checkbox" data-k="infra" checked> Canals, plants, towers</label>
      <label class="chk"><input type="checkbox" data-k="buildings" checked> Buildings</label>
      <label class="chk"><input type="checkbox" data-k="unfunded" checked> Systems not funded</label>
      <label class="rng">Relief <input type="range" data-k="exag" min="1" max="3" step="0.1" value="${opt.exag}"></label>
      <button class="ghost" data-act="home">Whole state</button></div>`);
    const legend = el(`<div class="leg3d"><div><span class="sw" style="background:${FUND}"></span>Selected for funding</div><div><span class="sw" style="background:${FAIL}"></span>Failing, not selected</div>
      <div><span class="sw" style="background:${RISK}"></span>At-risk, not selected</div><div class="mute">Each service area is shaded in its colour.</div><div><span class="sw bar" style="background:#3fb8ff"></span>Canal or aqueduct</div>
      <div><span class="sw bar" style="background:#ffd38a"></span>Tunnel</div><div><span class="sw sq" style="background:#7fc3ff"></span>Treatment plant</div>
      <div><span class="sw bar" style="background:${ROUTE}"></span>Consolidation pipeline</div></div>`);
    box.append(hud.chip, panel, legend);
    panel.addEventListener("input", (e) => { const k = e.target.dataset.k; if (!k) return; opt[k] = e.target.type === "checkbox" ? e.target.checked : +e.target.value; if (k === "unfunded") refreshSystems(); applyOpts(); });
    panel.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.act === "home") V.home(); });
    panel.querySelector("[data-jump]").addEventListener("change", (e) => { const c = CITIES[e.target.value]; if (c) V.flyToLonLat(c[0], c[1], 13.4); e.target.value = ""; });
  }
})();
