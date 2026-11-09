/* Xylem 3D map (MapLibre GL). Real terrain and imagery, real buildings and waterways (OpenStreetMap via OpenFreeMap),
 * real canals, aqueducts, treatment plants and water towers (OpenStreetMap via Overpass, data/infrastructure.json),
 * and the funding plan placed on top. Sources: AWS Terrain Tiles (SRTM/GMTED), Esri World Imagery, OpenFreeMap. */
(function () {
  "use strict";
  const FUND = "#19d3a2", FAIL = "#ef4b4b", RISK = "#f3a73a", ROUTE = "#19d3a2";
  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const EOX = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg";
  const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const HOME = { center: [-119.3, 37.1], zoom: 5.25, pitch: 55, bearing: -12 };
  const CITIES = { "Los Angeles": [-118.25, 34.05], "San Francisco Bay": [-122.35, 37.78], "San Diego": [-117.16, 32.72], "Sacramento": [-121.49, 38.58],
    "Fresno": [-119.79, 36.74], "Bakersfield": [-119.02, 35.37], "San Jose": [-121.89, 37.34] };
  const EMPTY = { type: "FeatureCollection", features: [] };
  const V = (window.Xylem3D = {});
  const Q = window.XylemQuality;
  let tier = "high", pref = "auto", qs = null, gov = null, moving = false, lastT = 0;
  const envNow = () => ({ pref, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, dpr: devicePixelRatio, coarse: matchMedia("(pointer: coarse)").matches, saveData: !!(navigator.connection && navigator.connection.saveData) });
  const readPref = () => { try { return localStorage.getItem("xylem.quality") || "auto"; } catch (e) { return "auto"; } };
  let map = null, D = null, box = null, ready = false, infra = null, popup = null, hud = {};
  const opt = { base: "sat", areas: true, infra: true, buildings: true, unfunded: true, exag: 1.8, allconn: false, hot: false, hubs: false };

  const circle = (lon, lat, r, n = 14) => { const dl = r / 111320, dx = r / (111320 * Math.cos(lat * Math.PI / 180)), c = [];
    for (let k = 0; k <= n; k++) { const a = (k / n) * 2 * Math.PI; c.push([lon + Math.cos(a) * dx, lat + Math.sin(a) * dl]); } return c; };
  const square = (lon, lat, w, h) => { const dl = h / 2 / 111320, dx = w / 2 / (111320 * Math.cos(lat * Math.PI / 180)); return [[lon - dx, lat - dl], [lon + dx, lat - dl], [lon + dx, lat + dl], [lon - dx, lat + dl], [lon - dx, lat - dl]]; };
  const poly = (ring, p) => ({ type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [ring] } });

  async function buildStyle() {
    const st = await fetch(STYLE_URL).then((r) => r.json());
    st.sources.dem = { type: "raster-dem", tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Elevation: AWS Terrain Tiles (SRTM, GMTED)" };
    st.sources.demhs = Object.assign({}, st.sources.dem);
    st.sources.eox = { type: "raster", tiles: [EOX], tileSize: 256, maxzoom: 13, attribution: "Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data 2021)" };
    st.sources.sat = { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 18, attribution: "Imagery &copy; Esri" };
    st.sources.infra = { type: "geojson", data: EMPTY }; st.sources.sites3d = { type: "geojson", data: EMPTY };
    st.sources.sys = { type: "geojson", data: EMPTY }; st.sources.towers = { type: "geojson", data: EMPTY }; st.sources.routes = { type: "geojson", data: EMPTY };
    st.sources.allroutes = { type: "geojson", data: EMPTY }; st.sources.hot = { type: "geojson", data: EMPTY }; st.sources.hubs = { type: "geojson", data: EMPTY };
    st.sources.sel = { type: "geojson", data: EMPTY }; st.sources.areas = { type: "geojson", data: EMPTY }; st.sources.counties = { type: "geojson", data: EMPTY };
    st.terrain = { source: "dem", exaggeration: opt.exag };
    st.light = { anchor: "map", position: [1.6, 205, 38], color: "#fff1d6", intensity: 0.5 };   // low sun from the south-west: towers and buildings get a lit and a shaded face
    st.sky = { "sky-color": "#6aa6dd", "horizon-color": "#dbe9f5", "fog-color": "#dbe6ef", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.75,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 1, 13, 0] };
    st.layers = st.layers.filter((l) => !/^poi_/.test(l.id) && l.id !== "road_one_way_arrow" && l.id !== "road_one_way_arrow_opposite");
    const at = st.layers.findIndex((l) => l.id === "waterway_tunnel");
    st.layers.splice(at, 0,
      { id: "sat-eox", type: "raster", source: "eox", paint: { "raster-saturation": -0.4, "raster-brightness-max": 0.8 } },
      { id: "sat", type: "raster", source: "sat", layout: { visibility: "visible" }, paint: { "raster-saturation": -0.42, "raster-brightness-max": 0.78, "raster-contrast": 0.12 } },
      { id: "hill", type: "hillshade", source: "demhs", paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#142231", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#3a4a5c", "hillshade-illumination-direction": 295 } });
    const b3 = st.layers.find((l) => l.id === "building-3d");
    b3.minzoom = 13; b3.paint["fill-extrusion-color"] = ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#d9d4cc", 60, "#e9e6e0", 200, "#f6f4f0"];
    b3.paint["fill-extrusion-height"] = ["coalesce", ["get", "render_height"], 8]; b3.paint["fill-extrusion-base"] = ["coalesce", ["get", "render_min_height"], 0];
    b3.paint["fill-extrusion-opacity"] = 0.96; b3.paint["fill-extrusion-vertical-gradient"] = true;
    const firstSym = st.layers.findIndex((l) => l.type === "symbol" && !/^waterway|^water_name/.test(l.id));
    const add = (...ls) => st.layers.splice(firstSym, 0, ...ls);
    const w = (a, b, c) => ["interpolate", ["linear"], ["zoom"], 5, a, 9, b, 14, c];
    const stColor = ["case", ["has", "col"], ["to-color", ["get", "col"]], ["match", ["get", "st"], 0, FUND, 1, FAIL, RISK]];
    add(
      { id: "areas", type: "fill", source: "areas", paint: { "fill-color": stColor, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9, ["match", ["get", "st"], 0, 0.62, 1, 0.62, 0.5], 14, ["match", ["get", "st"], 0, 0.18, 1, 0.2, 0.15]] } },
      { id: "areas-line", type: "line", source: "areas", paint: { "line-color": stColor, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 9, 2.4, 13, 3], "line-opacity": 1 } },
      { id: "counties", type: "line", source: "counties", paint: { "line-color": "#ffffff", "line-opacity": 0.28, "line-width": 0.7 } },
      { id: "infra-casing", type: "line", source: "infra", filter: ["in", ["get", "k"], ["literal", ["canal", "aqueduct", "pipeline"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b2a4a", "line-opacity": 0.55, "line-width": w(2.6, 4.6, 12) } },
      { id: "infra-water", type: "line", source: "infra", filter: ["in", ["get", "k"], ["literal", ["canal", "aqueduct"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3fb8ff", "line-width": w(1.4, 2.6, 8) } },
      { id: "infra-pipe", type: "line", source: "infra", filter: ["==", ["get", "k"], "pipeline"], paint: { "line-color": "#b9c4cf", "line-width": w(1, 1.8, 5) } },
      { id: "infra-tunnel", type: "line", source: "infra", filter: ["==", ["get", "k"], "tunnel"], paint: { "line-color": "#ffd38a", "line-width": w(1.2, 2, 5), "line-dasharray": [2, 1.5] } },
      { id: "routes-all", type: "line", source: "allroutes", layout: { visibility: "none" }, paint: { "line-color": "#9fd8ff", "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 14, 3], "line-dasharray": [2, 1.5] } },
      { id: "routes-casing", type: "line", source: "routes", paint: { "line-color": "#06382c", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 9] } },
      { id: "routes", type: "line", source: "routes", paint: { "line-color": ROUTE, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 5] } },
      { id: "sites3d", type: "fill-extrusion", source: "sites3d", minzoom: 12, paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 1 } },
      { id: "towers", type: "fill-extrusion", source: "towers", minzoom: 11, paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } },
      { id: "infra-label", type: "symbol", source: "infra", minzoom: 7.5, filter: ["!=", ["get", "n"], ""], layout: { "symbol-placement": "line", "text-field": ["get", "n"], "text-font": ["Noto Sans Italic"], "text-size": 11, "symbol-spacing": 400 },
        paint: { "text-color": "#d6eeff", "text-halo-color": "#0b2a4a", "text-halo-width": 1.4 } });
    st.layers.push(
      { id: "sys-glow", type: "circle", source: "sys", minzoom: 3, filter: ["==", ["get", "st"], 0], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["*", ["get", "k"], 2.2], 9, ["*", ["get", "k"], 3.4], 14, 16], "circle-color": FUND, "circle-blur": 1, "circle-opacity": 0.42, "circle-pitch-alignment": "map" } },
      { id: "sites-dot", type: "circle", source: "sites3d", filter: ["==", ["geometry-type"], "Point"], minzoom: 8, maxzoom: 12, paint: { "circle-radius": 3, "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } },
      { id: "sys-risk", type: "circle", source: "sys", minzoom: 8.5, filter: ["==", ["get", "st"], 2], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, ["*", ["get", "k"], 0.7], 14, 5], "circle-color": ["case", ["has", "col"], ["to-color", ["get", "col"]], RISK], "circle-opacity": 0.75, "circle-stroke-color": "#fff", "circle-stroke-width": 0.6 } },
      { id: "sys", type: "circle", source: "sys", filter: ["!=", ["get", "st"], 2], layout: { "circle-sort-key": ["-", 3, ["get", "st"]] },
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["*", ["get", "k"], 0.6], 8, ["*", ["get", "k"], 1.1], 12, ["*", ["get", "k"], 1.5], 15, 5],
          "circle-color": ["case", ["has", "col"], ["to-color", ["get", "col"]], ["match", ["get", "st"], 0, FUND, FAIL]], "circle-opacity": ["match", ["get", "st"], 0, 1, 0.8],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": ["match", ["get", "st"], 0, 1.8, 0.5] } },
      { id: "hot", type: "circle", source: "hot", layout: { visibility: "none" }, paint: { "circle-radius": 15, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.4, "circle-stroke-color": ["case", [">", ["get", "z"], 2.58], "#ff6a2a", "#ffc233"] } },
      { id: "hubs", type: "circle", source: "hubs", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 6, 12, 11], "circle-color": "#8a5cf0", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "sel", type: "circle", source: "sel", paint: { "circle-radius": 17, "circle-color": "rgba(255,255,255,0)", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    return st;
  }

  // ---------- data ----------
  // Tower shapes never change; only their colour and whether they are drawn in full do. Build the geometry once and reuse it.
  let geo = null, heavyTimer = null, heavyDone = false, lastSig = "";
  const STEEL = "#c9d1d9";
  function buildGeo() {
    geo = D.systems.map((s) => {
      if (s.lat == null || !s.lon) return null;
      const base = Math.min(34, 11 + Math.sqrt(s.pop) / 22);
      const at = (r, mx, my) => [s.lon + mx / (111320 * Math.cos(s.lat * Math.PI / 180)), s.lat + my / 111320];
      const full = (r) => { const leg = r * 1.7, o = r * 0.55, w = Math.max(1.2, r * 0.16), parts = [];
        [[o, o], [-o, o], [o, -o], [-o, -o]].forEach(([x, y]) => { const p = at(r, x, y); parts.push({ g: square(p[0], p[1], w, w), b: 0, h: leg, s: 1 }); });
        parts.push({ g: circle(s.lon, s.lat, r * 0.16, 6), b: 0, h: leg, s: 1 }, { g: circle(s.lon, s.lat, r, 18), b: leg, h: leg + r * 1.1, s: 0 },
          { g: circle(s.lon, s.lat, r * 0.74, 14), b: leg + r * 1.1, h: leg + r * 1.42, s: 0 }, { g: circle(s.lon, s.lat, r * 0.3, 10), b: leg + r * 1.42, h: leg + r * 1.75, s: 1 });
        return parts; };
      // not-funded systems get a lighter tower (leg, tank, roof): about a third of the data, and they are de-emphasised anyway
      const lite = (r) => { const leg = r * 1.7;
        return [{ g: circle(s.lon, s.lat, r * 0.16, 6), b: 0, h: leg, s: 1 }, { g: circle(s.lon, s.lat, r, 12), b: leg, h: leg + r * 1.1, s: 0 },
          { g: circle(s.lon, s.lat, r * 0.74, 10), b: leg + r * 1.1, h: leg + r * 1.42, s: 0 }]; };
      return { full: full(base * 1.5), lite: lite(base) };
    });
  }
  const stateOf = (i, mode) => (mode === "plan" && D.inPlan[i] ? 0 : D.systems[i].failing ? 1 : 2);

  // Cheap part: one point per system. Runs on every slider tick.
  function refreshPoints() {
    const mode = D.colorMode(), stab = mode === "stab", feats = [];
    D.systems.forEach((s, i) => {
      if (s.lat == null || !s.lon) return;
      const funded = !!D.inPlan[i], st = stateOf(i, mode), k = Math.min(9, 2.4 + Math.sqrt(s.pop) / 55);
      if (!opt.unfunded && !funded) return;
      feats.push({ type: "Feature", properties: stab ? { i, st, k: funded ? k * 1.3 : k * 0.65, col: D.colorCss(i) } : { i, st, k: funded ? k * 1.3 : k * 0.65 }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
    });
    map.getSource("sys").setData({ type: "FeatureCollection", features: feats });
    if (hud.bud && D.budget && document.activeElement !== hud.bud) { hud.bud.value = D.budget.pos(); hud.bl.textContent = D.budget.label(); }
    if (hud.chip) { const s = D.summary(); hud.chip.innerHTML = `<span>Budget <b>${s.budget}</b></span><span><b>${s.systems}</b> systems funded</span><span><b>${s.people}</b> people reached</span>`; }
  }

  // Heavy part: service-area shading, towers and routes (megabytes of geometry). Waits until the slider has been still for a moment.
  function refreshHeavy() {
    if (!ready || !D) return;
    const mode = D.colorMode(), stab = mode === "stab";
    const sig = mode + "|" + opt.unfunded + "|" + tier + "|" + Array.prototype.join.call(D.inPlan, "");
    if (!stab && sig === lastSig) return;
    lastSig = stab ? "" : sig;
    if (!geo) buildGeo();
    const towers = [], areas = [];
    if (D.polys) D.polys.features.forEach((ft) => { const i = D.idx.get(ft.properties.id); if (i === undefined || (!opt.unfunded && !D.inPlan[i])) return;
      areas.push({ type: "Feature", properties: stab ? { st: stateOf(i, mode), col: D.colorCss(i) } : { st: stateOf(i, mode) }, geometry: ft.geometry }); });
    map.getSource("areas").setData({ type: "FeatureCollection", features: areas });
    D.systems.forEach((s, i) => {
      const g = geo[i]; if (!g) return;
      const funded = !!D.inPlan[i]; if (!opt.unfunded && !funded) return;
      if (!funded && !qs.unfundedTowers) return;
      const c = stab ? D.colorCss(i) : funded ? "#1fbf93" : s.failing ? "#d94444" : "#e0a03a";
      (funded ? g.full : g.lite).forEach((p) => towers.push({ type: "Feature", properties: { c: p.s ? STEEL : c, b: p.b, h: p.h }, geometry: { type: "Polygon", coordinates: [p.g] } }));
    });
    map.getSource("towers").setData({ type: "FeatureCollection", features: towers });
    const rt = [];
    if (D.routeLines) D.routeLines.features.forEach((f) => { const i = D.idx.get(f.properties.id), r = D.RT[f.properties.id]; if (i !== undefined && D.inPlan[i] && r && r.viable && r.receiver) rt.push(f); });
    map.getSource("routes").setData({ type: "FeatureCollection", features: rt });
  }

  function refreshSystems() {
    if (!ready || !D) return;
    refreshPoints();
    clearTimeout(heavyTimer);
    if (!heavyDone) { heavyDone = true; refreshHeavy(); } else heavyTimer = setTimeout(refreshHeavy, 150);
  }

  // Static context layers: every viable connection, spatial hotspots, consolidation hubs. Set once.
  function refreshContext() {
    if (!D) return;
    const all = [];
    if (D.routeLines) D.routeLines.features.forEach((f) => { const r = D.RT[f.properties.id]; if (r && r.viable && r.receiver) all.push(f); });
    map.getSource("allroutes").setData({ type: "FeatureCollection", features: all });
    const hot = [], hubs = [];
    if (D.gis) {
      D.systems.forEach((s) => { const z = D.gis.z[s.id]; if (z > 1.96 && s.lat != null && s.lon) hot.push({ type: "Feature", properties: { z }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }); });
      D.gis.hubs.forEach((h) => { if (h.lat != null) hubs.push({ type: "Feature", properties: { name: h.name, n: h.n, people: h.people, cost: h.cost }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } }); });
    }
    map.getSource("hot").setData({ type: "FeatureCollection", features: hot });
    map.getSource("hubs").setData({ type: "FeatureCollection", features: hubs });
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
    qs = Q.settings(tier, devicePixelRatio);
    const sat = opt.base === "sat", vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("sat", sat); vis("sat-eox", sat); vis("water", !sat); vis("building", false);
    map.setPaintProperty("hill", "hillshade-exaggeration", sat ? ["interpolate", ["linear"], ["zoom"], 6, 0.3, 12, 0.08] : ["interpolate", ["linear"], ["zoom"], 6, 0.6, 13, 0.3]);
    map.getStyle().layers.forEach((l) => { if (/^(road_|bridge_|tunnel_)/.test(l.id) && l.type === "line") map.setPaintProperty(l.id, "line-opacity", sat ? 0.55 : 1); });
    vis("areas", opt.areas); vis("areas-line", opt.areas);
    ["infra-casing", "infra-water", "infra-pipe", "infra-tunnel", "infra-label", "sites3d", "sites-dot"].forEach((id) => vis(id, opt.infra));
    vis("building-3d", opt.buildings && qs.buildings !== false); if (qs.buildings !== false && map.getLayer("building-3d")) map.setLayerZoomRange("building-3d", qs.buildings, 24); vis("routes-all", opt.allconn); vis("hot", opt.hot); vis("hubs", opt.hubs);
    map.setTerrain(qs.terrain ? { source: "dem", exaggeration: opt.exag } : null); vis("hill", qs.hillshade);
    map.setPixelRatio(qs.pixelRatio); map.setMaxPitch(qs.maxPitch);
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
    pref = readPref(); tier = Q.pickTier(envNow()); qs = Q.settings(tier, devicePixelRatio); gov = Q.createGovernor();
    // If 3D cannot start (no WebGL, tile or style server unreachable, too slow), hand control back so the app shows the 2D map.
    let failed = false;
    const fail = (why) => { if (failed) return; failed = true; box.textContent = "The 3D map could not load (" + why + "). Showing the 2D map."; if (D && D.onFail) D.onFail(why); };
    if (!window.maplibregl) { fail("WebGL or MapLibre is unavailable"); return; }
    const mapDiv = document.createElement("div"); mapDiv.className = "gl3d"; box.appendChild(mapDiv);
    const load = document.createElement("div"); load.className = "load3d"; load.textContent = "Loading California terrain…"; box.appendChild(load);
    let style; try { style = await buildStyle(); } catch (e) { fail("map style unreachable"); return; }
    try { map = new maplibregl.Map(Object.assign({ container: mapDiv, style, maxPitch: qs.maxPitch, pixelRatio: qs.pixelRatio, maxZoom: 17.5, minZoom: 4, attributionControl: false, canvasContextAttributes: { antialias: qs.antialias } }, HOME)); }
    catch (e) { fail("WebGL is unavailable"); return; }
    // A slow start (not a hard failure) must not destroy the map: show 2D meanwhile and offer 3D again when it is ready.
    // The clock only runs while the tab is visible, because browsers pause map rendering in background tabs.
    let slow = false;
    const arm = () => setTimeout(() => { if (ready || failed) return; if (document.hidden) { arm(); return; } slow = true; if (D && D.onFail) D.onFail("took too long to load"); }, 25000);
    arm();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    buildHud();
    map.on("load", async () => {
      ready = true; load.remove(); applyOpts(); refreshSystems(); refreshContext(); if (slow && D && D.onRecover) D.onRecover();
      const at = box.querySelector(".maplibregl-ctrl-attrib"); if (at) at.classList.remove("maplibregl-compact-show");
      try { infra = await fetch("data/infrastructure.json").then((r) => r.json()); refreshInfra(); } catch (e) { /* infrastructure layer is optional */ }
      if (D.counties) map.getSource("counties").setData(D.counties);
    });
    map.on("click", (e) => { const f = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ["sys", "sys-risk"] }); if (f.length) select(f[0].properties.i); });
    map.on("click", (e) => { const f = map.queryRenderedFeatures([[e.point.x - 9, e.point.y - 9], [e.point.x + 9, e.point.y + 9]], { layers: ["hubs"] }); if (!f.length) return;
      const p = f[0].properties; if (popup) popup.remove();
      popup = new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(f[0].geometry.coordinates).setHTML(`<b>${D.esc(p.name)}</b><br>Could absorb ${p.n} Failing or At-Risk neighbours (${D.fmtN(p.people)} people) within the state's 3-mile rule. Receiver capacity is not modelled.`).addTo(map); });
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
    map.on("movestart", () => { moving = true; lastT = performance.now(); gov.reset(); });
    map.on("moveend", () => { moving = false; });
    map.on("render", () => { const now = performance.now(); if (moving && pref === "auto" && ready && gov.push(now - lastT)) downgrade(); lastT = now; });
    map.on("mousemove", (e) => { const f = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ["sys", "sys-risk"] }); map.getCanvas().style.cursor = f.length ? "pointer" : ""; });
    map.on("error", (e) => console.warn("map3d:", e && e.error && e.error.message));
  };
  V.setData = (data) => { D = data; refreshSystems(); };
  V.show = () => { if (map) { map.resize(); } };
  V.hide = () => {};
  V.map = () => map;

  function toast(msg) { if (!hud.toast) return; hud.toast.textContent = msg; hud.toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (hud.toast.hidden = true), 7000); }
  function setTier(t) { tier = t; lastSig = ""; applyOpts(); refreshHeavy(); const o = hud.q && hud.q.querySelector('option[value="auto"]'); if (o) o.textContent = "Auto (" + tier + ")"; }
  function downgrade() { const t = Q.lower(tier); if (t === tier) return; setTier(t); toast("Switched to " + t + " graphics to keep the map smooth. Change it under Layers and view."); }
  function buildHud() {
    const el = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
    hud.chip = el(`<div class="chip3d"></div>`); hud.toast = el(`<div class="toast3d" role="status" hidden></div>`);
    const panel = el(`<div class="hud3d">
      <label class="rng bud">Budget <b data-bl></b><input type="range" data-bud min="0" max="100" step="1" value="50" aria-label="Funding budget"></label>
      <details class="more"><summary>Layers and view</summary>
      <div class="seg" role="group" aria-label="Basemap"><button type="button" data-base="sat" class="on">Satellite</button><button type="button" data-base="map">Map</button></div>
      <select data-jump aria-label="Jump to"><option value="">Jump to a city…</option>${Object.keys(CITIES).map((c) => `<option>${c}</option>`).join("")}</select>
      <label class="chk"><input type="checkbox" data-k="areas" checked> Service-area shading</label>
      <label class="chk"><input type="checkbox" data-k="infra" checked> Canals, plants, towers</label>
      <label class="chk"><input type="checkbox" data-k="buildings" checked> Buildings</label>
      <label class="chk"><input type="checkbox" data-k="unfunded" checked> Systems not funded</label>
      <label class="chk"><input type="checkbox" data-k="allconn"> All possible connections</label>
      <label class="chk"><input type="checkbox" data-k="hot"> Hotspot rings</label>
      <label class="chk"><input type="checkbox" data-k="hubs"> Consolidation hubs</label>
      <label class="rng">Relief <input type="range" data-k="exag" min="1" max="3" step="0.1" value="${opt.exag}"></label>
      <label class="rng">Graphics <select data-q aria-label="Graphics quality"><option value="auto">Auto (${tier})</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low (fastest)</option></select></label>
      <button class="ghost" data-act="home">Whole state</button></details></div>`);
    const fs = el(`<button class="fs3d" type="button" aria-label="Full screen" title="Full screen">⛶</button>`);
    const legend = el(`<details class="leg3d"${innerWidth > 1100 ? " open" : ""}><summary>Legend</summary><div><span class="sw" style="background:${FUND}"></span>Selected for funding</div><div><span class="sw" style="background:${FAIL}"></span>Failing, not selected</div>
      <div><span class="sw" style="background:${RISK}"></span>At-risk, not selected</div><div class="mute">Each service area is shaded in its colour.</div><div><span class="sw bar" style="background:#3fb8ff"></span>Canal or aqueduct</div>
      <div><span class="sw bar" style="background:#ffd38a"></span>Tunnel</div><div><span class="sw sq" style="background:#7fc3ff"></span>Treatment plant</div>
      <div><span class="sw bar" style="background:${ROUTE}"></span>Consolidation pipeline</div></details>`);
    box.append(hud.chip, panel, legend, fs, hud.toast);
    fs.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen(); });
    document.addEventListener("fullscreenchange", () => { fs.textContent = document.fullscreenElement ? "✕" : "⛶"; setTimeout(() => map && map.resize(), 120); });
    hud.q = panel.querySelector("[data-q]"); hud.q.value = pref;
    hud.q.addEventListener("change", () => { pref = hud.q.value; try { localStorage.setItem("xylem.quality", pref); } catch (e) { /* private mode */ } gov.reset(); setTier(Q.pickTier(envNow())); });
    panel.addEventListener("input", (e) => { const k = e.target.dataset.k; if (!k) return; opt[k] = e.target.type === "checkbox" ? e.target.checked : +e.target.value; if (k === "unfunded") refreshSystems(); applyOpts(); });
    panel.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.base) { opt.base = b.dataset.base; panel.querySelectorAll("[data-base]").forEach((x) => x.classList.toggle("on", x === b)); applyOpts(); return; }
      if (b.dataset.act === "home") V.home(); });
    hud.bud = panel.querySelector("[data-bud]"); hud.bl = panel.querySelector("[data-bl]");
    hud.bud.addEventListener("input", () => D.budget.set(+hud.bud.value));
    panel.querySelector("[data-jump]").addEventListener("change", (e) => { const c = CITIES[e.target.value]; if (c) V.flyToLonLat(c[0], c[1], 13.4); e.target.value = ""; });
  }
})();
