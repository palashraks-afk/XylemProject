/* Xylem app: scenario controls -> exact optimizer -> map, KPIs, tables. All data is real SAFER/State Water Board data;
 * costs are modelled (see Method tab). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const fmtM = (usd) => usd >= 1e9 ? "$" + (usd / 1e9).toFixed(2) + "B" : "$" + (usd / 1e6).toFixed(usd >= 1e7 ? 0 : 1) + "M";
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const build = await fetch("build.json", {cache: "no-store"}).then(r => {
    if (!r.ok) throw new Error("Missing presentation build receipt");
    return r.json();
  });
  const snapshot = await fetch("data/snapshot.json", {cache: "no-store"}).then(r => {
    if (!r.ok) throw new Error("Missing snapshot manifest; run pipeline/seal_snapshot.py");
    return r.json();
  });
  async function loadData(name) {
    const response = await fetch("data/" + name, {cache: "no-store"});
    if (!response.ok) throw new Error("Missing snapshot data: " + name);
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== snapshot.sha256[name]) throw new Error("Snapshot hash mismatch: " + name);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const [systems, summary, polys] = await Promise.all([
    loadData("systems.json"),
    loadData("summary.json"),
    loadData("boundaries.geojson"),
  ]);
  const cov = await loadData("boundary_coverage.json");
  const routesData = await loadData("routes.json");
  const routeLines = await loadData("routes.geojson");
  const RT = routesData ? routesData.routes : {};
  const gis = await loadData("gis.json");
  const forecast = await loadData("forecast.json");
  const countyGeo = await loadData("counties.geojson");
  const infrastructure = await loadData("infrastructure.json");
  const AT_RISK_RATE = forecast.metrics.fallback_at_risk_probability;

  const N = systems.length;
  const baseCost = systems.map((s) => s.cost);
  const costs = baseCost.slice();   // effective cost; rewritten in run() when consolidation routes are switched on
  const pops = systems.map((s) => s.pop);
  const conns = systems.map((s) => s.conn);
  const failing = systems.map((s) => (s.failing ? 1 : 0));
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const totalPeople = pops.reduce((a, b) => a + b, 0);

  // equity index: mean of available components (DAC, CalEnviroScreen pct, affordability, poverty pct); missing -> median
  const eqRaw = systems.map((s) => { const v = s.eq.filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  const med = (() => { const v = eqRaw.filter((x) => x !== null).sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; })();
  const eq = eqRaw.map((x) => (x === null ? med : x));

  const DEF = { b: 500, l: summary.defaults.lambda_eq, h: summary.defaults.horizon_years, v: "fc", a: summary.defaults.at_risk_weight, r: summary.defaults.small_reserve, c: 0, m: 1 };
  const BMIN = 25, BMAX = Math.round(totalCost / 1e6 / 5) * 5;
  const posToBudget = (t) => Math.round(BMIN * Math.pow(BMAX / BMIN, t / 100) / 5) * 5;
  const budgetToPos = (b) => Math.round((Math.log(b / BMIN) / Math.log(BMAX / BMIN)) * 100);

  const st = Object.assign({}, DEF, { color: "plan", poly: true, tab: "plan", routes: true, shade: "none", hot: false, hubs: false });
  function controlNumber(p, key, fallback, min, max, step) {
    if (!p.has(key) || !p.get(key).trim()) return fallback;
    const value = Number(p.get(key));
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Number((Math.round(value / step) * step).toFixed(10))));
  }
  (function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    st.b = controlNumber(p, "b", st.b, BMIN, BMAX, 5);
    st.l = controlNumber(p, "l", st.l, 0, 3, 0.1);
    st.a = controlNumber(p, "a", st.a, 0.1, 1, 0.05);
    st.r = controlNumber(p, "r", st.r, 0, 0.6, 0.05);
    if (p.has("c")) st.c = +p.get("c") ? 1 : 0;
    st.m = controlNumber(p, "m", st.m, 0.5, 2, 0.05);
    st.h = controlNumber(p, "h", st.h, 1, 10, 1);
    if (p.has("v")) st.v = p.get("v") === "fixed" ? "fixed" : "fc";
  })();

  $("#snap").textContent = `SAFER snapshot ${String(summary.snapshot).slice(0, 10)} · ${fmtN(summary.all_systems)} systems · ${fmtN(N)} Failing or At-Risk · ${fmtN(totalPeople)} people · forecast ${snapshot.id.slice(0, 12)} · UI build ${build.id.slice(0, 12)}`;

  // ---------- optimizer run ----------
  let plan = null;
  // consolidation route cost replaces the average-based cost where the route is viable and cheaper
  const viaRoute = new Uint8Array(N);
  function applyCosts() {
    for (let i = 0; i < N; i++) {
      const r = RT[systems[i].id];
      viaRoute[i] = st.c && r && r.viable && r.cost < baseCost[i] ? 1 : 0;
      costs[i] = (viaRoute[i] ? r.cost : baseCost[i]) * st.m;
      systems[i].cost = costs[i]; systems[i].lo = Math.round(costs[i] * 0.5); systems[i].hi = Math.round(costs[i] * 2);
    }
  }
  function run() {
    applyCosts();
    // At-Risk value: chance of becoming Failing within the horizon (from the forecast model), or a fixed share of Failing
    const wRisk = (i) => failing[i] ? 1 : st.v === "fc" ? 1 - Math.pow(1 - (systems[i].pf == null ? AT_RISK_RATE : systems[i].pf), st.h) : st.a;
    const ben = pops.map((p, i) => p * wRisk(i) * (1 + st.l * eq[i]));
    const chosen = XylemOpt.optimize(costs, ben, conns, st.b * 1e6, st.r);
    const base = XylemOpt.statusFirst(costs, pops, failing, st.b * 1e6);
    const inPlan = new Uint8Array(N); chosen.forEach((i) => (inPlan[i] = 1));
    const sum = (ix, arr) => ix.reduce((s, i) => s + arr[i], 0);
    const dacMask = systems.map((s) => (s.eq[0] !== null && s.eq[0] > 0 ? 1 : 0));
    plan = {
      chosen, inPlan, ben,
      people: sum(chosen, pops), spent: sum(chosen, costs), dac: chosen.filter((i) => dacMask[i]).reduce((s, i) => s + pops[i], 0),
      small: chosen.filter((i) => conns[i] <= 500).length,
      basePeople: sum(base, pops), baseSpent: sum(base, costs), baseN: base.length,
      leftFailing: systems.map((s, i) => i).filter((i) => failing[i] && !inPlan[i]),
    };
    plan.leftPeople = sum(plan.leftFailing, pops);
    // stability at nearest precomputed budget
    const bs = summary.budgets_musd;
    let k = 0, bd = 1e9; bs.forEach((b, j) => { const d = Math.abs(Math.log(b / st.b)); if (d < bd) { bd = d; k = j; } });
    plan.stabK = k; plan.stabOK = bd < Math.log(1.6) && !st.c && st.v === "fc" && st.l <= 2 && st.r === 0 && st.m === 1; plan.stabBudget = bs[k];   // stress tests ran on average-based costs
    const strong = plan.stabOK ? chosen.filter((i) => systems[i].p[k] >= 0.5).length / Math.max(1, chosen.length) : null;
    plan.robust = strong;
  }

  // ---------- map ----------
  function mapStatus(message) { const el = $("#mapStatus"); el.textContent = message; el.hidden = !message; }
  const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([36.9, -119.5], 6);
  L.control.zoom({position: "topright"}).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors", maxZoom: 14 })
    .on("tileerror", () => mapStatus("2D basemap unavailable. Saved system boundaries, allocations and CSV export remain available."))
    .addTo(map);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const idx = new Map(systems.map((s, i) => [s.id, i]));
  const dots = [], polyLayers = new Map();
  const polyGroup = L.layerGroup(), dotGroup = L.layerGroup().addTo(map);

  function colorFor(i) {
    const s = systems[i];
    if (st.color === "status") return s.failing ? css("--fail") : css("--risk");
    if (st.color === "stab") {
      if (!plan.stabOK) return css("--off");
      const p = s.p[plan.stabK];
      return `hsl(${200 - 0}, ${Math.round(20 + 70 * p)}%, ${Math.round(82 - 42 * p)}%)`;
    }
    if (plan.inPlan[i]) return css("--plan");
    return s.failing ? css("--fail") : css("--risk");
  }
  const opacityFor = (i) => (st.color === "plan" && !plan.inPlan[i] ? 0.35 : 0.85);

  function routeLine(i) {
    const r = RT[systems[i].id];
    if (!r) return `<div class="mute">Consolidation: not eligible under the state's size rules</div>`;
    if (!r.receiver) return `<div class="mute">Consolidation: ${esc(r.reason)}</div>`;
    return `<div class="r"><span>Consolidate into</span><b>${esc(r.receiver_name)}</b></div>
      <div class="r"><span>Route</span><b>${r.kind === "intersect" ? "adjacent" : r.route_mi + " mi"} · ${fmtM(r.cost)} ($${fmtN(r.per_conn)}/conn)</b></div>
      <div class="mute">${r.viable ? "Meets" : "Fails"} the state's funding viability test${viaRoute[i] ? " · cost used in this plan" : ""}</div>`;
  }
  function popup(i) {
    const s = systems[i];
    const stab = plan.stabOK ? `${pct(s.p[plan.stabK])} of stress tests at ~$${plan.stabBudget}M` : "unavailable for these controls";
    return `<h4>${esc(s.name)}</h4><div class="mute">${esc(s.county)} County · ${s.failing ? "Failing" : "At-Risk"} · ${esc(s.dac)}</div>
      <div class="r"><span>People served</span><b>${fmtN(s.pop)}</b></div>
      <div class="r"><span>Connections</span><b>${fmtN(s.conn)}</b></div>
      <div class="r"><span>Modelled cost</span><b>${fmtM(s.cost)} (${fmtM(s.lo)}–${fmtM(s.hi)})</b></div>
      <div class="r"><span>Cost per person</span><b>$${fmtN(s.cost / s.pop)}</b></div>
      <div class="r"><span>In plan</span><b>${plan.inPlan[i] ? "Yes" : "No"}</b></div>
      <div class="r"><span>Funded in</span><b>${stab}</b></div>
      <div class="r"><span>Funding since 2017</span><b>${s.funded17 ? "Yes" : "No"}</b></div>
      ${s.pf != null ? `<div class="r"><span>${st.v === "fixed" ? "Fixed At-Risk share" : `Exploratory ${st.h}-year weight`}</span><b>${pct(st.v === "fixed" ? st.a : 1 - Math.pow(1 - s.pf, st.h))}</b></div><div class="mute">Annual and multi-year risk unvalidated; constant annual risk assumed for forecast weights.</div>` : ""}
      ${gis && gis.z[s.id] !== undefined ? `<div class="r"><span>Hotspot score (25 km)</span><b>${gis.z[s.id].toFixed(1)}</b></div>` : ""}
      ${routeLine(i)}
      ${s.analytes ? `<div class="mute">Issue: ${esc(s.analytes)}</div>` : ""}`;
  }

  systems.forEach((s, i) => {
    if (s.lat == null || s.lon == null || s.lon === 0) return;
    const m = L.circleMarker([s.lat, s.lon], { radius: Math.min(15, 3 + Math.sqrt(s.pop) / 40), weight: 1, color: "#fff", fillOpacity: 0.85 });
    m.bindPopup(() => popup(i));
    m.addTo(dotGroup); dots[i] = m;
  });
  if (polys) {
    L.geoJSON(polys, {
      style: () => ({ weight: 1, fillOpacity: 0.3 }),
      onEachFeature: (f, layer) => { const i = idx.get(f.properties.id); if (i === undefined) return; polyLayers.set(i, layer); layer.bindPopup(() => popup(i)); },
    }).eachLayer((l) => polyGroup.addLayer(l));
  }

  // county shading (under everything), hotspot rings, consolidation hubs
  map.createPane("counties"); map.getPane("counties").style.zIndex = 350;
  const countyGroup = L.layerGroup().addTo(map), hotGroup = L.layerGroup(), hubGroup = L.layerGroup();
  const countyAgg = () => {
    const m = new Map();
    systems.forEach((x, i) => { const c = m.get(x.county.toUpperCase()) || { people: 0, funded: 0 }; c.people += x.pop; if (plan.inPlan[i]) c.funded += x.pop; m.set(x.county.toUpperCase(), c); });
    return m;
  };
  let countyLayer = null;
  if (countyGeo) {
    countyLayer = L.geoJSON(countyGeo, { pane: "counties", renderer: L.svg({ pane: "counties" }), style: () => ({ weight: 0.6, color: "#889", fillOpacity: 0 }) });
    countyGroup.addLayer(countyLayer);
  }
  function drawCounties() {
    if (!countyLayer) return;
    const agg = countyAgg(); const maxP = Math.max(...[...agg.values()].map((c) => c.people));
    countyLayer.eachLayer((l) => {
      const c = agg.get(l.feature.properties.name.toUpperCase());
      let v = 0, tip = l.feature.properties.name;
      if (c && st.shade === "risk") { v = Math.sqrt(c.people / maxP); tip += `: ${fmtN(c.people)} people at risk`; }
      else if (c && st.shade === "reached") { v = c.funded / c.people; tip += `: ${pct(v)} of at-risk people reached`; }
      l.setStyle({ fillColor: st.shade === "reached" ? "#1f8a5b" : "#c2362f", fillOpacity: st.shade === "none" ? 0 : 0.12 + 0.5 * v });
      l.unbindTooltip(); if (st.shade !== "none") l.bindTooltip(tip, { sticky: true });
    });
  }
  if (gis) {
    systems.forEach((s, i) => { const z = gis.z[s.id]; if (z > 1.96 && s.lat != null && s.lon !== 0)
      L.circleMarker([s.lat, s.lon], { radius: 16, weight: 2, color: z > 2.58 ? "#e0561b" : "#e8a31a", fillOpacity: 0, interactive: false }).addTo(hotGroup); });
    gis.hubs.forEach((h) => { if (h.lat == null) return;
      L.circleMarker([h.lat, h.lon], { radius: 9, weight: 2, color: "#fff", fillColor: "#7a4bd1", fillOpacity: 0.95 })
        .bindPopup(`<h4>${esc(h.name)}</h4><div>Could absorb <b>${h.n}</b> Failing or At-Risk neighbours (${fmtN(h.people)} people) within the state's 3-mile rule, about ${fmtM(h.cost)}.</div><div class="mute">Receiver capacity is not modelled.</div>`)
        .addTo(hubGroup); });
  }
  const routeGroup = L.layerGroup().addTo(map);
  function drawRoutes() {
    routeGroup.clearLayers();
    if (!routeLines || !st.routes) return;
    routeLines.features.forEach((f) => {
      const i = idx.get(f.properties.id);
      if (i === undefined || !plan.inPlan[i] || !viaRoute[i]) return;
      const c = f.geometry.coordinates;
      L.polyline([[c[0][1], c[0][0]], [c[1][1], c[1][0]]], { color: css("--good"), weight: 3, dashArray: "5 4", opacity: 0.95 })
        .bindPopup(() => popup(i)).addTo(routeGroup);
    });
  }
  function restyle() {
    drawRoutes(); drawCounties();
    dots.forEach((m, i) => { if (m) m.setStyle({ fillColor: colorFor(i), fillOpacity: opacityFor(i) }); });
    polyLayers.forEach((l, i) => l.setStyle({ color: colorFor(i), fillColor: colorFor(i), fillOpacity: plan.inPlan[i] ? 0.45 : 0.15, weight: plan.inPlan[i] ? 1.6 : 0.8 }));
    map.eachLayer(layer => { if (layer.isPopupOpen && layer.isPopupOpen()) layer.getPopup().update(); });
    $("#colorSel").value = st.color;
    document.querySelectorAll("[data-color]").forEach(b => { b.classList.toggle("on", b.dataset.color === st.color); b.setAttribute("aria-pressed", String(b.dataset.color === st.color)); });
    const leg = {
      plan: [[css("--plan"), "Funded in this plan"], [css("--fail"), "Failing, not funded"], [css("--risk"), "At-Risk, not funded"]],
      status: [[css("--fail"), "Failing"], [css("--risk"), "At-Risk"]],
      stab: [["hsl(200,20%,82%)", "Rarely funded in stress tests"], ["hsl(200,90%,40%)", "Funded in nearly every scenario"]],
    }[st.color];
    $("#legend").innerHTML = leg.map(([c, t]) => `<div><span class="dot" style="background:${c}"></span>${t}</div>`).join("")
      + (st.color === "stab" && !plan.stabOK ? `<div class="mute">Stored stability unavailable for these controls; run cost scenarios.</div>` : "") + `<div class="mute">Dot size = people served</div>`;
    if (on3d && window.Xylem3D) Xylem3D.setData(data3d());
  }

  // ---------- 3D map (default) and 2D map ----------
  let on3d = true;
  const data3d = () => ({ systems, infrastructure, drawRoutes: st.routes, inPlan: plan.inPlan, viaRoute, RT, routeLines, onMapStatus: mapStatus, onMapFailure: (message) => { mapStatus(message); setView("2d"); }, counties: countyGeo, polys, idx, popup, esc, fmtN, colorMode: () => st.color, colorCss: colorFor, onSelect: (i) => openDetail(i, $("#map3d canvas") || $("#find")),
    budget: { pos: () => budgetToPos(st.b), label: () => fmtM(st.b * 1e6), set: (p) => { st.b = posToBudget(p); $("#budget").value = p; update(); } },
    summary: () => ({ budget: fmtM(st.b * 1e6), systems: fmtN(plan.chosen.length), people: fmtN(plan.people) }) });
  function setView(v) {
    on3d = v === "3d";
    document.querySelectorAll("[data-view]").forEach((b) => { b.classList.toggle("on", b.dataset.view === v); b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
    $("#map").hidden = on3d; $("#map3d").hidden = !on3d; $("#legend").hidden = on3d;
    if (on3d) { Xylem3D.setData(data3d()); Xylem3D.show(); } else map.invalidateSize();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // ---------- cost scenarios: how often is each system selected when its cost estimate is wrong? ----------
  let scen = null;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const scenarioKey = () => [st.b, st.l, st.h, st.v, st.a, st.r, st.c, st.m].join();
  let scenarioGeneration = 0;
  async function runScenarios() {
    const btn = $("#runScen"), out = $("#scenOut"), K = 40, rand = rng(11), hits = new Uint16Array(N);
    if (btn.getAttribute("aria-disabled") === "true") return;
    // Keep the trigger focusable while busy; native disabled drops keyboard focus.
    btn.setAttribute("aria-disabled", "true"); commitUpdate(); clearAnnouncement(); $("#resultStatus").textContent = "";
    const key = scenarioKey(), generation = ++scenarioGeneration, budget = st.b * 1e6, reserve = st.r, fixedCosts = costs.slice();
    const wRisk = (i) => failing[i] ? 1 : st.v === "fc" ? 1 - Math.pow(1 - (systems[i].pf == null ? AT_RISK_RATE : systems[i].pf), st.h) : st.a;
    const ben = pops.map((p, i) => p * wRisk(i) * (1 + st.l * eq[i]));
    for (let k = 0; k < K; k++) {
      const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
      if (generation !== scenarioGeneration) { btn.setAttribute("aria-disabled", "false"); return; }
      const c = fixedCosts.map((v) => v * Math.exp(0.35 * gauss()));          // 0.5x to 2x range is about two standard deviations
      XylemOpt.optimize(c, ben, conns, budget, reserve).forEach((i) => hits[i]++);
      out.textContent = `Running… ${k + 1} of ${K}`; await new Promise((r) => setTimeout(r, 0));
    }
    if (generation !== scenarioGeneration || key !== scenarioKey()) { btn.setAttribute("aria-disabled", "false"); return; }
    scen = { hits, K, key };
    const solid = plan.chosen.filter((i) => hits[i] >= K * 0.8).length;
    out.textContent = `${solid} of ${plan.chosen.length} funded systems were chosen in at least 80% of ${K} scenarios. Open a system to see its count.`;
    btn.setAttribute("aria-disabled", "false"); if (sel3 >= 0) showDetail(sel3);
    announce(`Cost scenarios complete. ${solid} of ${plan.chosen.length} funded systems were selected in at least 80% of 40 scenarios.`);
  }
  $("#runScen").addEventListener("click", runScenarios);

  // ---------- selected-system card ----------
  let sel3 = -1, detailReturn = null;
  function openDetail(i, origin) {
    detailReturn = { node: origin, system: origin?.dataset.system };
    showDetail(i);
    $("#detailTitle").focus({preventScroll: true});
    $("#detail").scrollIntoView({block: "nearest"});
  }
  function closeDetail() {
    showDetail(-1);
    const usable = node => node?.isConnected && node.getClientRects().length && !node.disabled;
    const matching = detailReturn?.system && [...document.querySelectorAll("[data-system]")].find(b => b.dataset.system === detailReturn.system);
    const target = usable(detailReturn?.node) ? detailReturn.node : usable(matching) ? matching : $("#find");
    target.focus(); detailReturn = null;
  }
  function showDetail(i) {
    sel3 = i; const d = $("#detail"); if (i < 0) { d.hidden = true; return; }
    const s = systems[i], fresh = scen && scen.key === scenarioKey();
    const focusedId = d.contains(document.activeElement) ? document.activeElement.id : null;
    d.hidden = false;
    d.innerHTML = `<span class="eyebrow">${esc(s.id)} · ${esc(s.county)} County</span><h3 id="detailTitle" tabindex="-1">${esc(s.name)}</h3><button class="x" aria-label="Close" id="detailX">×</button>
      <div class="mute">${s.failing ? "Failing" : "At-Risk"} · ${fmtN(s.pop)} people served · ${fmtN(s.conn)} connections · ${esc(s.dac)}</div>
      <div class="grid"><div><span class="l">In this plan</span><b>${plan.inPlan[i] ? "Selected" : "Not selected"}</b></div>
      <div><span class="l">Estimated cost</span><b>${fmtM(s.cost)}</b></div><div><span class="l">Illustrative cost range</span><b>${fmtM(s.lo)}–${fmtM(s.hi)}</b></div>
      <div><span class="l">Weighted priority score</span><b>${fmtN(plan.ben[i])}</b></div>
      ${s.pv != null ? `<div><span class="l">Diagnostic violation estimate (unvalidated)</span><b>${pct(s.pv, 0)}</b></div>` : ""}
      <div><span class="l">Selected when costs vary</span><b>${fresh ? `${scen.hits[i]} of ${scen.K} scenarios` : plan.stabOK ? pct(s.p[plan.stabK]) + " of stress tests" : "run the scenarios"}</b></div></div>
      <div style="margin-top:10px">${routeLine(i)}</div>${s.analytes ? `<div class="mute">Issue: ${esc(s.analytes)}</div>` : ""}`;
    $("#detailX").onclick = closeDetail;
    if (focusedId) $("#" + focusedId)?.focus({preventScroll: true});
  }

  // ---------- KPIs ----------
  function kpis() {
    const gain = plan.basePeople ? plan.people / plan.basePeople : 0;
    const k = [
      `<div class="kpi hero"><div class="l">Modeled people reached</div><div class="v">${fmtN(plan.people)}</div><div class="s">${gain >= 1.005 || gain < 0.995 ? `<span class="up">${gain.toFixed(2)}×</span> status-first reach (${fmtN(plan.basePeople)})` : `about the same reach as status-first (${fmtN(plan.basePeople)})`}</div></div>`,
      `<div class="kpi"><div class="l">Systems funded</div><div class="v">${fmtN(plan.chosen.length)}</div><div class="s">of ${fmtN(N)} · ${plan.small} with ≤500 connections</div></div>`,
      `<div class="kpi"><div class="l">Spent of budget</div><div class="v">${fmtM(plan.spent)}</div><div class="s">budget ${fmtM(st.b * 1e6)} · $${fmtN(plan.spent / Math.max(1, plan.people))}/person</div></div>`,
      `<div class="kpi"><div class="l">In disadvantaged areas</div><div class="v">${pct(plan.dac / Math.max(1, plan.people))}</div><div class="s">of people reached (DAC or SDAC)</div></div>`,
      `<div class="kpi"><div class="l">Failing, left unfunded</div><div class="v">${fmtN(plan.leftFailing.length)}</div><div class="s">${fmtN(plan.leftPeople)} people</div></div>`,
      `<div class="kpi"><div class="l">Plan robustness</div><div class="v">${plan.robust === null ? "n/a" : pct(plan.robust)}</div><div class="s">${plan.robust === null ? "stored stability unavailable for these controls; run cost scenarios" : `funded systems that win in ≥50% of ${summary.n_scenarios} stress tests`}</div></div>`,
    ];
    $("#kpis").innerHTML = k.join("");
  }

  // ---------- tables ----------
  function table(cols, rows, sortKey, desc) {
    let key = sortKey, dir = desc ? -1 : 1;
    const wrap = document.createElement("div");
    function draw() {
      const sorted = rows.slice().sort((a, b) => { const x = a[key], y = b[key]; return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir; });
      wrap.innerHTML = `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}" aria-sort="${key === c.k ? (dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-k="${c.k}">${c.h}${key === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${sorted.slice(0, 400).map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.k === "name" && r.id ? `<button type="button" class="system-link" data-system="${esc(r.id)}">${esc(r.name)}</button>` : c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${sorted.length > 400 ? `<p class="fine" style="color:var(--mute)">Showing first 400 of ${fmtN(sorted.length)}.</p>` : ""}`;
      wrap.querySelectorAll("th button").forEach((button) => button.addEventListener("click", () => { const k = button.dataset.k; if (k === key) dir = -dir; else { key = k; dir = -1; } draw(); wrap.querySelector(`[data-k="${k}"]`).focus(); }));
      wrap.querySelectorAll("[data-system]").forEach(button => button.addEventListener("click", () => { openDetail(idx.get(button.dataset.system), button); }));
    }
    draw(); return wrap;
  }
  const tagS = (r) => `<span class="tag ${r.failing ? "f" : "a"}">${r.failing ? "Failing" : "At-Risk"}</span>`;
  const stabCell = (r) => (plan.stabOK ? pct(r.p[plan.stabK]) : "–");

  function tabPlan() {
    const rows = plan.chosen.map((i) => ({ ...systems[i], cpp: systems[i].cost / systems[i].pop, stab: plan.stabOK ? systems[i].p[plan.stabK] : -1 }));
    const el = document.createElement("div");
    el.innerHTML = `<p class="mute" style="margin-bottom:8px">${fmtN(rows.length)} systems, ${fmtM(plan.spent)} of ${fmtM(st.b * 1e6)}. Stability is the share of ${summary.n_scenarios} stress-test scenarios (cost errors and weights varied) in which the system is still funded${plan.stabOK ? ` at about $${plan.stabBudget}M` : "; unavailable for these controls"}.</p>`;
    el.appendChild(table([
      { k: "name", h: "System" }, { k: "county", h: "County" }, { k: "failing", h: "Status", f: tagS },
      { k: "pop", h: "People", num: 1, f: (r) => fmtN(r.pop) }, { k: "cost", h: "Cost", num: 1, f: (r) => fmtM(r.cost) },
      { k: "cpp", h: "$/person", num: 1, f: (r) => "$" + fmtN(r.cpp) }, { k: "stab", h: "Stability", num: 1, f: stabCell }, { k: "dac", h: "Economic status" },
      { k: "how", h: "Solution", f: (r) => esc(r.how) },
    ], rows.map((r) => ({ ...r, how: viaRoute[idx.get(r.id)] ? `Consolidate into ${RT[r.id].receiver_name} (${RT[r.id].kind === "intersect" ? "adjacent" : RT[r.id].route_mi + " mi"})` : "Modelled average" })), "pop", true));
    return el;
  }
  function tabLeft() {
    const rows = plan.leftFailing.map((i) => ({ ...systems[i], cpp: systems[i].cost / systems[i].pop }));
    const small = plan.leftFailing.filter((i) => conns[i] <= 500).length;
    const el = document.createElement("div");
    el.innerHTML = `<div class="note"><b>Who the optimizer leaves out.</b> ${fmtN(rows.length)} Failing systems (${fmtN(plan.leftPeople)} people) are not funded in this plan; ${fmtN(small)} of them have 500 connections or fewer. They are skipped because each person costs more to reach, not because their need is smaller. Raise the equity weight or reserve budget for small systems to see the trade-off.</div>`;
    el.appendChild(table([
      { k: "name", h: "System" }, { k: "county", h: "County" }, { k: "pop", h: "People", num: 1, f: (r) => fmtN(r.pop) },
      { k: "conn", h: "Connections", num: 1, f: (r) => fmtN(r.conn) }, { k: "cost", h: "Cost", num: 1, f: (r) => fmtM(r.cost) },
      { k: "cpp", h: "$/person", num: 1, f: (r) => "$" + fmtN(r.cpp) }, { k: "dac", h: "Economic status" },
    ], rows, "pop", true));
    return el;
  }
  function tabCounty() {
    const m = new Map();
    systems.forEach((s, i) => {
      const c = m.get(s.county) || { county: s.county, systems: 0, people: 0, funded: 0, fundedSys: 0, cost: 0 };
      c.systems++; c.people += s.pop; c.cost += s.cost;
      if (plan.inPlan[i]) { c.funded += s.pop; c.fundedSys++; }
      m.set(s.county, c);
    });
    const off = new Map(summary.county.map((c) => [c.county, c.official_musd]));
    const rows = [...m.values()].map((c) => ({ ...c, share: c.people ? c.funded / c.people : 0, off: off.get(c.county) || 0 }));
    const el = document.createElement("div");
    el.appendChild(table([
      { k: "county", h: "County" }, { k: "systems", h: "Systems", num: 1 }, { k: "people", h: "People at risk", num: 1, f: (r) => fmtN(r.people) },
      { k: "funded", h: "Reached by plan", num: 1, f: (r) => fmtN(r.funded) },
      { k: "share", h: "Share reached", num: 1, f: (r) => `<span class="bar" style="width:${Math.round(r.share * 60)}px"></span> ${pct(r.share)}` },
      { k: "cost", h: "Modelled cost", num: 1, f: (r) => fmtM(r.cost) }, { k: "off", h: "State's county total", num: 1, f: (r) => (r.off ? "$" + r.off.toFixed(0) + "M" : "–") },
    ], rows, "funded", true));
    return el;
  }
  function tabMethod() {
    const c = summary.calibration, v = summary.validation, cmp = summary.comparison;
    const el = document.createElement("div"); el.className = "prose";
    el.innerHTML = `
      <h3>What the optimizer does</h3>
      <p>For a budget B it chooses the set of Failing and At-Risk systems that maximizes the weighted population objective subject to total modelled cost ≤ B. Weighted objective = people served × status weight (Failing 1, At-Risk as set) × (1 + equity weight × equity index). With no reserve, dynamic programming solves the 0/1 knapsack exactly after costs round up to $250k units, so a plan never overspends. A small-system reserve runs two sequential knapsacks: first small systems within the reserved amount, then remaining systems within the remaining budget. This is a priority rule, not proof of a globally optimal reserve-constrained plan. The same code runs in Python (reference) and in your browser; a test checks they pick identical systems.</p>
      <h3>Where the costs come from</h3>
      <p>The preserved inputs contain state average long-term cost per service connection by system size and status (2024 Cost Assessment, Table 7) and total cost by county (Table 9). We apply Table 7 to each system's connection count, then scale so the statewide total equals the state's $${fmtN(c.official_total_musd)}M. Costs are <b>modelled</b>, not quotes. The shown range is the state's own 0.5×–2× convention.</p>
      <div class="note ${c.spearman_county > 0.8 ? "good" : ""}"><b>Calibration test against the state's county totals (58 counties).</b> Rank correlation ${c.spearman_county}, Pearson ${c.pearson_county}. The county-level typical error is large: median absolute error ${c.median_abs_pct_error_county_ge10M}% for counties with ≥$10M, log-ratio spread ${c.log_ratio_sd_county}. The raw model came out ${(c.raw_total_musd / c.official_total_musd).toFixed(2)}× the state total (${fmtN(c.raw_total_musd)}M vs ${fmtN(c.official_total_musd)}M) before scaling. Stored stability is available only for compatible controls; run current cost scenarios otherwise.</div>
      ${routesData ? (() => { const rs = routesData.summary, f = rs.by_status.Failing, a = rs.by_status["At-Risk"]; return `
      <h3>Infrastructure routing (consolidation)</h3>
      <p>Following the state's physical-consolidation method, a Failing system with 1,000 or fewer connections (At-Risk: 500 or fewer) is connected to the largest healthy community system within 3 miles that has more than 500 connections. Pipeline is costed at $220 per foot plus $6,200 per connection for service lines, $5,437 per connection in fees, 15% administration, CEQA ($25k adjacent, $100k route), 20% contingency, 10% planning, 15% engineering and 3.1% inflation. A route is viable if it passes the state's funding test ($96,000 per connection, or $7.2M total for systems of 75 connections or fewer).</p>
      <div class="note good"><b>Check against the state.</b> We find ${f.viable} of ${f.total} Failing systems (${pct(f.viable / (f.total))}) and ${a.viable} of ${a.total} At-Risk systems (${pct(a.viable / (a.total))}) have a viable consolidation. The state's own 2024 model selected consolidation for 44% of Failing and 43% of At-Risk systems. The lists differ (2026 vs 2024), so agreement is encouraging, not proof.</div>
      <div class="note"><b>Departures from the state's method.</b> Straight-line distance times ${rs.assumptions.circuity} stands in for the street route (not validated); no regional (RSMeans) cost adjustment, so high-cost regions are understated; receiver boundaries are simplified. Stress tests were run on average-based costs, so stability is not shown when routes are on.</div>`; })() : ""}
      ${forecast ? (() => { const m = forecast.metrics, cohorts = m.planner_evaluation.cohorts;
        const row = (name, key) => { const c = cohorts[key], p = c.models.planner_ensemble; return `<tr><td>${name}</td><td>${c.n} / ${c.onsets}</td><td>${p.auc.toFixed(3)}</td><td>${pct(p.mean_predicted, 2)} / ${pct(c.observed_rate, 2)}</td><td>${p.brier.toFixed(4)} / ${p.log_loss.toFixed(4)}</td></tr>`; };
        return `
      <h3>Exploratory failure forecast</h3>
      <div class="note"><b>Diagnostic snapshot comparisons.</b> Previously examined 2025→2026 outcomes are not an untouched test. Historical availability and outcome dates remain unresolved. Annual failure probabilities remain unvalidated. The horizon conversion 1 − (1 − p)<sup>h</sup> assumes constant annual risk and is unvalidated.</div>
      <p>Training: 2024→2025 (${fmtN(m.train_n)} systems, ${m.train_positives} snapshot positives). Primary diagnostic outcome: archived 2026 assessment, ${fmtN(m.test_n)} known outcomes, ${m.test_positives} positives. Normalization retains all 2,647 scored systems before unknown outcomes or At-Risk filtering. Rank scores order systems; calibrated snapshot estimates supply exploratory funding weights.</p>
      <div class="scroll"><table><thead><tr><th>Primary cohort</th><th>Systems / positives</th><th>AUC</th><th>Mean estimate / observed</th><th>Brier / log loss</th></tr></thead><tbody>${row("All non-Failing", "all_non_failing")}${row("At-Risk", "at_risk")}</tbody></table></div>
      <p><b>Training-only calibration.</b> Positive-slope ridge logistic calibration selected with nested 5 outer / 4 inner folds within 2024→2025 (68 events). No diagnostic outcomes select or fit the map. Configuration selection is not nested. Brier improves in the recorded comparisons; log loss does not improve in every comparison.</p>
      <p><b>Separate November-2026 comparison:</b> exact original 582 At-Risk systems / 50 positives: AUC 0.756→0.739, paired 95% difference interval −0.053 to +0.017. Corrected mean 6.58% versus 8.59% observed. These outcomes differ from the primary archive and cannot be interchanged.</p>
      <p><b>Current export.</b> ${esc(m.final_model_note)} Missing current At-Risk forecasts use the training status rate (${summary.fallback_at_risk_systems.length} systems). Modeled reach sums selected populations under the chosen objective; it is not measured intervention benefit.</p>`; })() : ""}
      ${forecast && forecast.metrics.model_selection ? (() => { const ms = forecast.metrics.model_selection, s1 = ms.stage1, s2 = ms.stage2, g = forecast.metrics.models;
        const f4 = (x) => (x == null ? "–" : x.toFixed(3));
        const top1 = s1.candidates.slice().sort((x, y) => y.val.auc - x.val.auc).slice(0, 10);
        const top2 = s2.candidates.slice().sort((x, y) => y.cv.auc - x.cv.auc).slice(0, 10);
        return `
      <h3>Model comparison</h3>
      <p><b>How models were compared.</b> Stage 1 has about ${fmtN(s1.n_rows)} system-years, so it supports a real search: ${s1.candidates.length} candidates (tuned gradient boosting, random forests, extra trees, regularised logistic regression, and an ensemble) were tuned on forward-chaining validation (train on earlier years, validate on 2021, 2022, 2023). The test years 2024 and 2025 were scored afterwards and played no part in choosing. Chosen: <b>${esc(s1.chosen.replace(/_/g, " "))}</b>.</p>
      <div class="scroll"><table><thead><tr><th>Stage 1 candidate (top 10 by validation)</th><th class="num">Validation AUC</th><th class="num">Validation avg precision</th><th class="num">Diagnostic AUC</th><th class="num">Diagnostic avg precision</th></tr></thead><tbody>
        ${top1.map((c) => `<tr><td>${esc(c.name.replace(/_/g, " "))}${c.name === s1.chosen ? " ✓" : ""}</td><td class="num">${f4(c.val.auc)}</td><td class="num">${f4(c.val.ap)}</td><td class="num">${f4(c.test.auc)}</td><td class="num">${f4(c.test.ap)}</td></tr>`).join("")}
        <tr><td><i>Baseline: count of past health violations</i></td><td class="num">–</td><td class="num">–</td><td class="num">${f4(Object.values(s1.baseline_violation_count_test_auc).reduce((x, y) => x + y, 0) / 2)}</td><td class="num">–</td></tr></tbody></table></div>
      <p><b>Calibration:</b> the ensemble's raw scores differ from observed levels (test mean prediction ${pct(s1.calibration["2025"].mean_pred_raw, 1)} vs observed ${pct(s1.calibration["2025"].observed_rate, 1)}), because several members are class-weighted. An isotonic map fitted on the 2021 to 2023 validation years only cuts the Brier score from ${s1.calibration["2025"].brier_raw} to ${s1.calibration["2025"].brier_calibrated} on 2025 (mean prediction ${pct(s1.calibration["2025"].mean_pred_calibrated, 1)}). It is applied to the violation estimate shown for each system. These folds also select configurations, so calibration evidence is not nested.</p>
      <p><b>Stage 2 (a system becomes Failing).</b> Only ${forecast.metrics.train_positives} training onsets, so models were compared by repeated 5-fold cross-validation on the 2024 to 2025 transition, then scored diagnostically on the already-examined 2025 to 2026 snapshots. Within-year cross-validation does not establish transfer between years. Stage-1 forecasts for four violation types (health-based, any, monitoring and reporting, MCL) feed a small stacked logistic model alongside the trees. Chosen: <b>${esc(s2.chosen.replace(/_/g, " "))}</b>.</p>
      <div class="scroll"><table><thead><tr><th>Stage 2 candidate (top 10 by cross-validation)</th><th class="num">CV AUC</th><th class="num">Diagnostic AUC</th><th class="num">Diagnostic avg precision</th></tr></thead><tbody>
        ${top2.map((c) => `<tr><td>${esc(c.name.replace(/_/g, " "))}</td><td class="num">${f4(c.cv.auc)}</td><td class="num">${f4(c.test.auc)}</td><td class="num">${f4(c.test.ap)}</td></tr>`).join("")}
        <tr><td><b>Ensemble of the best of each family</b></td><td class="num">${f4(s2.ensemble.cv.auc)}</td><td class="num">${f4(s2.ensemble.test.auc)}</td><td class="num">${f4(s2.ensemble.test.ap)}</td></tr>
        ${s2.baselines.map((b) => `<tr><td><i>Baseline: ${esc(b.name.replace(/_/g, " "))}</i></td><td class="num">${f4(b.cv.auc)}</td><td class="num">${f4(b.test.auc)}</td><td class="num">${f4(b.test.ap)}</td></tr>`).join("")}</tbody></table></div>
      <div class="note"><b>Honest read.</b> With a few dozen onsets, differences of 0.02 AUC between models are inside the noise (95% intervals span about ±0.05). The best models do not clearly beat the stage-1 forecast used on its own, so a gain from the extra complexity is not established by these diagnostic results.</div>`; })() : ""}
      ${forecast && forecast.metrics.source_value ? (() => { const m = forecast.metrics, sv = m.source_value, s1 = m.stage1_model, w = m.without_stage1.ensemble, e = m.models.ensemble;
        const drop = Object.entries(sv.drop_one).sort((x, y) => y[1].auc_lost - x[1].auc_lost);
        const nm = (k) => k.replace(/_/g, " ");
        return `
      <h3>More data: what it bought</h3>
      <p>We added ${m.sources ? m.sources.filter((s) => s.ok).length : 23} public datasets (EPA violation, enforcement and lead records; State Water Board facilities, rates and school lead tests; DWR shortage scores, dry wells and groundwater basins; CDC social vulnerability, CalEnviroScreen, Census tracts; NOAA weather and drought; wildfire perimeters; terrain; OpenStreetMap infrastructure). Retained model inputs follow historical-event-time-v2: mutable snapshots and undated lead/copper are excluded. Event cutoffs do not prove historical publication availability. Other downloaded inputs provide descriptive context or equity signals.</p>
      <div class="scroll"><table><thead><tr><th>Snapshot rank diagnostic, 2025 to 2026</th><th class="num">AUC</th><th class="num">Average precision</th><th class="num">Onsets caught in top 10%</th></tr></thead><tbody>
        <tr><td>Before: risk scores and status only</td><td class="num">${w.auc}</td><td class="num">${w.avg_precision}</td><td class="num">${pct(w.recall_top10pct)}</td></tr>
        <tr><td>After: plus violation forecast from public data</td><td class="num">${e.auc}</td><td class="num">${e.avg_precision}</td><td class="num">${pct(e.recall_top10pct)}</td></tr></tbody></table></div>
      <p><b>Stage 1.</b> With only dozens of new Failing systems a year, the failure label alone is too thin to learn from. So a first model learns from historical system-years: will this system get a new health-based violation in the next 12 months? Retrospective diagnostics score AUC ${Object.values(s1).map((x) => x.auc).join(", ")} (in cycle order; early cycles use later-selected configurations and are not as-of forecasts). A plain count of past violations scores ${Object.values(s1).map((x) => x.auc_baseline_violation_count).join(", ")}. Used alone it predicts Failing onset with AUC ${m.stage1_failing_onset_auc}. One October 2024 spike of 793 lead service-line paperwork violations was excluded as an administrative deadline, not a water-quality change.</p>
      <p><b>What each source is worth.</b> Retraining stage 1 without one source at a time. Size alone scores ${sv.size_only}; all sources together ${sv.all_sources}. These are retrospective source-drop diagnostics, not causal source contributions. The size-only score reflects missing historical size inputs in early training, not proof that system size is uninformative.</p>
      <div class="scroll"><table><thead><tr><th>Source dropped</th><th class="num">Features</th><th class="num">AUC lost</th></tr></thead><tbody>${drop.map(([k, v]) => `<tr><td>${nm(k)}</td><td class="num">${v.n_features}</td><td class="num">${v.auc_lost >= 0 ? "+" : ""}${v.auc_lost.toFixed(4)}</td></tr>`).join("")}</tbody></table></div>
      ${m.sources ? `<details class="grp"><summary>All ${m.sources.length} downloaded sources</summary><ul>${m.sources.map((s) => `<li><b>${esc(s.name)}</b> (${esc(s.owner || "")}): ${esc(s.desc || "")}${s.ok ? "" : " <i>(download failed)</i>"}</li>`).join("")}</ul></details>` : ""}`; })() : ""}
      ${gis ? (() => { const t = gis.stats; return `
      <h3>Spatial analysis (GIS)</h3>
      <p><b>Clustering.</b> Failing systems are spatially clustered: Moran's I = ${t.morans_i_failing} (random would be about 0), permutation p = ${t.morans_p_permutation_999}, ${t.radius_km} km neighbourhoods, ${fmtN(t.n_systems)} systems. The clustering is statistically clear but weak. <b>Hotspots.</b> Getis-Ord Gi* on people served by Failing or At-Risk systems flags ${t.hotspots_p05} systems at p&lt;0.05 and ${t.hotspots_p01} at p&lt;0.01 (rings on the map; not corrected for multiple testing). <b>Hubs.</b> ${t.hubs_with_3plus} healthy systems are modeled as potential receivers for three or more at-risk neighbours; capacity is unverified and; see the Hubs tab.</p>`; })() : ""}
      <h3>Stress test</h3>
      <p>${summary.n_scenarios} scenarios. In each, costs are multiplied by a county-level error drawn from the observed county errors above and a per-system lognormal error (σ ${summary.sigma_system}), and the equity weight (0–2) and the forecast horizon (1–10 years) are redrawn. The optimizer is re-run at $100M, $250M, $500M, $1B and $2B. Stability is the share of scenarios in which a system is funded, not a probability of successful remediation. Stored scenarios use no small-system reserve, routes off and a cost multiplier of 1.</p>
      <h3>Optimizer versus a status-first process</h3>
      <div class="scroll"><table><thead><tr><th>Budget</th><th class="num">Optimizer people</th><th class="num">Status-first people</th><th class="num">Ratio</th><th class="num">Optimizer systems</th><th class="num">Status-first systems</th></tr></thead><tbody>
      ${cmp.map((r) => `<tr><td>$${fmtN(r.budget_musd)}M</td><td class="num">${fmtN(r.optimizer.people)}</td><td class="num">${fmtN(r.status_first_baseline.people)}</td><td class="num">${(r.optimizer.people / r.status_first_baseline.people).toFixed(2)}×</td><td class="num">${r.optimizer.systems}</td><td class="num">${r.status_first_baseline.systems}</td></tr>`).join("")}</tbody></table></div>
      <p class="mute">Status-first = fund Failing systems before At-Risk, largest first, until the money runs out. This is a simple stand-in, not the state's actual process, which also weighs readiness, willingness and technical assistance needs.</p>
      <h3>Sanity check against funding already awarded</h3>
      <p>${fmtN(v.n_funded_since_2017)} of ${fmtN(v.n_systems)} systems received funding since 2017. Using AUC (0.5 = no relationship): our need-and-equity benefit score ${v.auc_need_benefit_vs_funded}, our efficiency (benefit per dollar) ${v.auc_efficiency_vs_funded}, population alone ${v.auc_population_vs_funded}, the Failing flag alone ${v.auc_failing_flag_vs_funded}. ${pct(v.funded_share_failing)} of Failing and ${pct(v.funded_share_at_risk)} of At-Risk systems have received funding.</p>
      <div class="note"><b>Read this honestly.</b> The relationships are modest (AUC 0.63–0.69). Past funding reflects need, readiness and politics, not cost-effectiveness, so this is a sanity check that the ranking is not pointing the wrong way. It is not evidence that the optimizer's choices are correct.</div>`;
    return el;
  }
  function tabGaps() {
    const s = summary, sc = s.status_counts;
    const el = document.createElement("div"); el.className = "prose";
    el.innerHTML = `
      <h3>Known gaps in the data</h3>
      <ul>
        <li><b>${sc["Not Assessed"].systems} systems have no SAFER status</b> and serve ${fmtN(sc["Not Assessed"].people)} people (mostly the largest utilities). They are not in this analysis, so big-city need is understated.</li>
        <li><b>${fmtN(s.missing_economic_status_systems)} systems have a missing economic status</b> (${s.missing_economic_status_in_target} of the Failing or At-Risk). Their equity index is built from the remaining components, not imputed.</li>
        <li><b>The state's cost estimates are from 2024.</b> The State Water Board's <a href="https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs/2026/2026-needs-factsheet.pdf">2026 factsheet</a> says the Cost Assessment was not updated in 2025 or 2026. Costs here use the 2024 averages on the 2026 system list.</li>
        <li><b>Service-area polygons:</b> ${cov ? `${cov.with_polygon} of ${cov.targets}` : "most"} Failing or At-Risk systems have a boundary in the state layer, simplified for the web. Boundaries are the state's, not independently verified.</li>
        <li><b>At-Risk is a score, not a confirmed contaminant.</b> At-Risk systems receive exploratory snapshot weights. Annual failure probabilities and constant-annual-risk horizon conversions are unvalidated.</li>
        <li><b>Count reconciliation:</b> this file lists ${fmtN(sc.Failing.systems)} Failing systems serving ${fmtN(sc.Failing.people)} people. The state's 2024 Needs Assessment summary reports 385 Failing systems. Different year and list; we have not reconciled every difference.</li>
        <li><b>Not modelled:</b> a system's readiness to build, willingness to consolidate, ongoing O&amp;M, and the state's separate analysis for state small systems and domestic wells.</li>
      </ul>
      <h3>Prior work, and what is different here</h3>
      <ul>
        <li><a href="https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/saferdashboard.html">State Water Board SAFER Dashboard</a>: reference for status and risk information.</li>
        <li><a href="https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/needs.html">State Needs Assessment and Cost Assessment</a>: reference for the cost tables used here.</li>
        <li><a href="https://pacinst.org/publication/drinking-water-cost-assessment-gap-analysis/">Pacific Institute et al., Cost Assessment and Gap Analysis</a>: background on costs and funding gaps.</li>
        <li><a href="https://phys.org/news/2022-07-framework-prioritizing-investment.amp">Wayne State and University of Michigan prioritization framework (2022)</a>: an inherited reference lead, not a verified current comparison.</li>
      </ul>
      <div class="note good"><b>What Xylem adds:</b> a budget allocation prototype using rounded modeled costs and explicit priority rules, sensitivity checks, and a view of systems left out. These references are not an exhaustive current review; no unique or first-of-kind claim is established.</div>`;
    return el;
  }

  function tabSpot() {
    const el = document.createElement("div"); el.className = "prose";
    if (!st.spot) { el.innerHTML = `<p class="mute">Pick a county above the map, or search for your water system, to see what this plan means locally.</p>`; return el; }
    const ix = systems.map((_, i) => i).filter((i) => systems[i].county === st.spot);
    const sum = (a, arr) => a.reduce((s, i) => s + arr[i], 0);
    const people = sum(ix, pops), got = ix.filter((i) => plan.inPlan[i]), gotP = sum(got, pops);
    const leftF = ix.filter((i) => failing[i] && !plan.inPlan[i]), leftP = sum(leftF, pops);
    const nF = ix.filter((i) => failing[i]).length, cost = sum(ix, costs);
    el.innerHTML = `<p class="story"><b>${esc(st.spot)} County.</b> ${ix.length} Failing or At-Risk water systems (${nF} Failing) serve ${fmtN(people)} people, and fixing them is modelled at ${fmtM(cost)}. With a ${fmtM(st.b * 1e6)} statewide budget, this plan funds ${got.length} of them and reaches ${fmtN(gotP)} people (${pct(gotP / Math.max(1, people))}). ${leftF.length ? `${leftF.length} Failing systems serving ${fmtN(leftP)} people are not funded at this budget.` : "No Failing system here is left unfunded."}</p>`;
    const rows = ix.map((i) => ({ ...systems[i], inplan: plan.inPlan[i] ? "Yes" : "No", cpp: systems[i].cost / systems[i].pop }));
    el.appendChild(table([
      { k: "name", h: "System" }, { k: "failing", h: "Status", f: tagS }, { k: "pop", h: "People", num: 1, f: (r) => fmtN(r.pop) },
      { k: "cost", h: "Cost", num: 1, f: (r) => fmtM(r.cost) }, { k: "cpp", h: "$/person", num: 1, f: (r) => "$" + fmtN(r.cpp) },
      { k: "inplan", h: "In plan" }, { k: "dac", h: "Economic status" },
    ], rows, "pop", true));
    return el;
  }

  function tabHubs() {
    const el = document.createElement("div"); el.className = "prose";
    if (!gis) { el.innerHTML = "<p class='mute'>No hub data.</p>"; return el; }
    el.innerHTML = `<p class="story">${gis.stats.hubs_with_3plus} healthy systems could each absorb three or more Failing or At-Risk neighbours under the state's 3-mile rule. One pipeline project per hub is the cheapest way to fix several systems at once. The state's method does not check whether the receiver has capacity.</p>`;
    el.appendChild(table([
      { k: "name", h: "Receiving system" }, { k: "n", h: "Systems joined", num: 1 }, { k: "people", h: "People", num: 1, f: (r) => fmtN(r.people) },
      { k: "cost", h: "Modelled cost", num: 1, f: (r) => fmtM(r.cost) }, { k: "cpp", h: "$/person", num: 1, f: (r) => "$" + fmtN(r.cost / r.people) },
    ], gis.hubs, "people", true));
    return el;
  }
  const TABS = { plan: tabPlan, spot: tabSpot, hubs: tabHubs, left: tabLeft, county: tabCounty, method: tabMethod, gaps: tabGaps };
  function drawTab() {
    const active = document.activeElement, panelFocused = $("#tabbody").contains(active);
    const scrollIndex = [...$("#tabbody").querySelectorAll(".scroll")].indexOf(active);
    const b = $("#tabbody"); b.innerHTML = ""; b.appendChild(TABS[st.tab]());
    document.querySelectorAll("[data-tab]").forEach(button => {
      const selected = button.dataset.tab === st.tab;
      button.id = "tab-" + button.dataset.tab; button.setAttribute("aria-controls", "tabbody");
      button.classList.toggle("on", selected); button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
      if (selected) { b.setAttribute("aria-label", button.textContent); b.setAttribute("aria-labelledby", button.id); }
    });
    b.querySelectorAll(".scroll").forEach(region => {
      region.tabIndex = 0; region.setAttribute("role", "region");
      region.setAttribute("aria-label", `${$("[data-tab].on").textContent}: ${region.querySelector("th").textContent.trim()} table`);
    });
    if (panelFocused) {
      const replacement = active.dataset.system ? [...b.querySelectorAll("[data-system]")].find(node => node.dataset.system === active.dataset.system)
        : active.dataset.k ? [...b.querySelectorAll("th button")].find(node => node.dataset.k === active.dataset.k)
        : scrollIndex >= 0 ? b.querySelectorAll(".scroll")[scrollIndex] : b;
      (replacement || b).focus({preventScroll: true});
    }
  }

  $(".skip-results").addEventListener("click", e => { e.preventDefault(); $("#tabbody").focus(); $("#tabbody").scrollIntoView({block: "start"}); });

  // ---------- wiring ----------
  function syncLabels() {
    document.querySelectorAll("[data-val]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === st.v)));
    for (const [id, text] of Object.entries({budget: fmtM(st.b * 1e6), lam: st.l.toFixed(1), res: pct(st.r), mul: st.m.toFixed(2) + " times", hor: st.h + " years (exploratory)", arw: pct(st.a)})) $("#" + id).setAttribute("aria-valuetext", text);
    $("#budgetLabel").textContent = fmtM(st.b * 1e6);
    $("#budgetHint").textContent = `Range $${BMIN}M to ${fmtM(totalCost)} (maximum preset)`;
    $("#lamLabel").textContent = st.l.toFixed(1); $("#horLabel").textContent = st.h + " yr"; $("#arwLabel").textContent = pct(st.a);
    $("#horWrap").hidden = st.v !== "fc"; $("#arwWrap").hidden = st.v === "fc";
    document.querySelectorAll("[data-val]").forEach((x) => x.classList.toggle("on", x.dataset.val === st.v)); $("#resLabel").textContent = (st.r ? "+" : "") + pct(st.r); $("#mulLabel").textContent = st.m.toFixed(2) + "×";
  }
  function writeHash() {
    const p = new URLSearchParams({ b: st.b, l: st.l, h: st.h, v: st.v, a: st.a, r: st.r, c: st.c, m: st.m });
    history.replaceState(null, "", "#" + p.toString());
  }
  // One polite, atomic summary after a quiet interval. Never announce table redraws
  // or the forty intermediate scenario iterations. Real speech needs human QA.
  let announcementTimer = null, lastPlanKey = scenarioKey(), scenarioCancelled = false;
  function clearAnnouncement() { clearTimeout(announcementTimer); }
  function announce(message) {
    clearAnnouncement();
    announcementTimer = setTimeout(() => {
      if ($("#resultStatus").textContent !== message) $("#resultStatus").textContent = message;
    }, 350);
  }
  function planSummary() {
    const detail = sel3 < 0 ? "" : ` ${systems[sel3].name}: ${plan.inPlan[sel3] ? "selected" : "not selected"}, modeled cost ${fmtM(systems[sel3].cost)}.`;
    return `${scenarioCancelled ? "Cost scenarios cancelled. " : ""}Plan updated. Budget ${fmtM(st.b * 1e6)}; ${fmtN(plan.chosen.length)} systems funded; ${fmtN(plan.people)} modeled people reached.${detail}`;
  }
  let timer = null;
  function commitUpdate() {
    clearTimeout(timer); timer = null; run(); kpis(); restyle(); drawTab(); writeHash(); if (sel3 >= 0) showDetail(sel3);
    if (lastPlanKey !== scenarioKey()) { lastPlanKey = scenarioKey(); announce(planSummary()); scenarioCancelled = false; }
  }
  function update() {
    clearAnnouncement(); scenarioCancelled ||= $("#runScen").getAttribute("aria-disabled") === "true";
    scenarioGeneration++; scen = null; $("#scenOut").textContent = "Controls changed. Run cost scenarios for this plan.";
    syncLabels(); clearTimeout(timer); timer = setTimeout(commitUpdate, 60);
  }

  $("#budget").value = budgetToPos(st.b);
  $("#lam").value = st.l; $("#arw").value = st.a; $("#res").value = st.r; $("#mul").value = st.m;
  $("#budget").addEventListener("input", (e) => { st.b = posToBudget(+e.target.value); update(); });
  $("#lam").addEventListener("input", (e) => { st.l = +e.target.value; update(); });
  $("#arw").addEventListener("input", (e) => { st.a = +e.target.value; update(); });
  $("#res").addEventListener("input", (e) => { st.r = +e.target.value; update(); });
  $("#mul").addEventListener("input", (e) => { st.m = +e.target.value; update(); });
  $("#eqZero").addEventListener("click", () => { st.l = 0; $("#lam").value = 0; update(); });
  $("#eqHigh").addEventListener("click", () => { st.l = 2; $("#lam").value = 2; update(); });
  $("#colorSel").addEventListener("change", (e) => { st.color = e.target.value; document.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x.dataset.color === st.color)); restyle(); });
  document.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    st.color = b.dataset.color; document.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b)); restyle(); }));
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    if (timer !== null) commitUpdate();
    st.tab = b.dataset.tab; document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); drawTab(); }));
  $(".tabs").addEventListener("keydown", e => {
    const tabs = [...document.querySelectorAll("[data-tab]")], current = tabs.indexOf(document.activeElement);
    if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (current + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click(); tabs[next].focus();
  });
  $("#poly").addEventListener("change", (e) => { st.poly = e.target.checked; if (st.poly) polyGroup.addTo(map); else map.removeLayer(polyGroup); });
  $("#hor").value = st.h;
  $("#hor").addEventListener("input", (e) => { st.h = +e.target.value; update(); });
  document.querySelectorAll("[data-val]").forEach((b) => b.addEventListener("click", () => { st.v = b.dataset.val; update(); }));
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    st.b = Math.min(BMAX, +b.dataset.preset || BMAX); $("#budget").value = budgetToPos(st.b); update(); }));
  $("#shade").addEventListener("change", (e) => { st.shade = e.target.value; drawCounties(); });
  $("#hot").addEventListener("change", (e) => { st.hot = e.target.checked; if (st.hot) hotGroup.addTo(map); else map.removeLayer(hotGroup); });
  $("#hub").addEventListener("change", (e) => { st.hubs = e.target.checked; if (st.hubs) hubGroup.addTo(map); else map.removeLayer(hubGroup); });
  $("#export").addEventListener("click", () => {
    // Flush pending control changes so the display and CSV describe one plan.
    commitUpdate();
    const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
    const head = ["water_system_id", "name", "county", "status", "people", "connections", "cost_usd", "cost_per_person", "solution", "snapshot_probability", "allocation_weight", "forecast_source", "stability_pct", "economic_status", "hotspot_z"];
    const rows = plan.chosen.map((i) => { const s = systems[i];
      return [s.id, s.name, s.county, s.failing ? "Failing" : "At-Risk", s.pop, s.conn, s.cost, Math.round(s.cost / s.pop),
        viaRoute[i] ? `Consolidate into ${RT[s.id].receiver_name}` : "Modelled average",
        s.pf == null ? "" : s.pf, s.failing ? 1 : st.v === "fc" ? 1 - Math.pow(1 - s.pf, st.h) : st.a, s.forecast_source, plan.stabOK ? Math.round(s.p[plan.stabK] * 100) : "", s.dac, gis && gis.z[s.id] !== undefined ? gis.z[s.id] : ""].map(q).join(","); });
    const blob = new Blob([`# Budget_USD ${st.b * 1e6}; selected_systems ${plan.chosen.length}; modeled_people ${plan.people}; modeled_cost_usd ${plan.spent}; scenario ${new URLSearchParams({b:st.b,l:st.l,h:st.h,v:st.v,a:st.a,r:st.r,c:st.c,m:st.m})}; stability_budget_musd ${plan.stabOK ? plan.stabBudget : "unavailable"}\n# Snapshot ${snapshot.id}; UI_build ${build.id}; diagnostic snapshot estimates; annual failure probabilities and constant-annual-risk horizon conversion unvalidated.\n# Xylem placement plan: budget ${fmtM(st.b * 1e6)}, equity ${st.l}, ${st.v === "fc" ? "forecast horizon " + st.h + " yr" : "fixed At-Risk share " + pct(st.a)}, small-system reserve ${pct(st.r)}, routes ${st.c}, cost multiplier ${st.m}; stability ${plan.stabOK ? "stored at " + plan.stabBudget + "M, no reserve/routes, multiplier 1" : "unavailable for these controls"}; reach is modeled population, not measured intervention benefit; costs modeled; routes approximate\n`, head.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "xylem-placement-plan.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("#cons").checked = !!st.c;
  $("#cons").addEventListener("change", (e) => { st.c = e.target.checked ? 1 : 0; update(); });
  $("#routes").addEventListener("change", (e) => { st.routes = e.target.checked; restyle(); });
  $("#reset").addEventListener("click", () => {
    Object.assign(st, DEF); $("#mul").value = st.m; $("#hor").value = st.h; $("#cons").checked = false; $("#budget").value = budgetToPos(st.b); $("#lam").value = st.l; $("#arw").value = st.a; $("#res").value = st.r; update(); });
  $("#copy").addEventListener("click", async () => {
    commitUpdate(); try { await navigator.clipboard.writeText(location.href); $("#copyMsg").textContent = "Link copied. It reproduces this scenario."; }
    catch (e) { $("#copyMsg").textContent = "Copy the address bar to share this scenario."; }
    setTimeout(() => ($("#copyMsg").textContent = ""), 3000); });

  // find-your-system search and county spotlight
  const label = (s) => `${s.name} · ${s.county}`;
  const byLabel = new Map(systems.map((s, i) => [label(s), i]));
  $("#syslist").innerHTML = systems.map((s) => `<option value="${esc(label(s))}">`).join("");
  [...new Set(systems.map((s) => s.county))].sort().forEach((c) => $("#spot").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`));
  function showTab(t) { st.tab = t; document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x.dataset.tab === t)); drawTab(); }
  function spotlight(county) {
    st.spot = county || ""; $("#spot").value = st.spot;
    if (st.spot) {
      const pts = systems.filter((s) => s.county === st.spot && s.lat != null && s.lon !== 0).map((s) => [s.lat, s.lon]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 11 });
      showTab("spot"); if (on3d && window.Xylem3D) Xylem3D.flyToCounty(st.spot);
    } else { map.setView([36.9, -119.5], 6); drawTab(); if (on3d && window.Xylem3D) Xylem3D.home(); }
  }
  $("#spot").addEventListener("change", (e) => spotlight(e.target.value));
  $("#find").addEventListener("change", (e) => {
    const v = e.target.value.trim(), i = byLabel.has(v) ? byLabel.get(v) : idx.get(v.toUpperCase()); if (i === undefined || !dots[i]) return;
    openDetail(i, e.target);
    st.spot = systems[i].county; $("#spot").value = st.spot; showTab("spot");
    if (on3d && window.Xylem3D) { Xylem3D.flyToSystem(i); return; }
    map.flyTo(dots[i].getLatLng(), 11); dots[i].openPopup();
  });

  polyGroup.addTo(map);
  syncLabels(); run(); kpis(); restyle(); drawTab();
  setView("3d");
  Xylem3D.mount($("#map3d"), data3d()).catch(error => { mapStatus("3D map unavailable. Switched to the 2D map; allocations and CSV remain available."); setView("2d"); console.warn(error); });
  window.__xylem = { st, map, routeGroup, viaRoute, get plan() { return plan; }, systems, summary };
})().catch(error => {
  document.querySelector("#snap").textContent = "Snapshot could not be loaded: " + error.message;
  document.querySelector("#export").disabled = true;
  console.error(error);
});
