/* Xylem app: scenario controls -> exact optimizer -> map, KPIs, tables. All data is real SAFER/State Water Board data;
 * costs are modelled (see Method tab). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const fmtM = (usd) => usd >= 1e9 ? "$" + (usd / 1e9).toFixed(2) + "B" : "$" + (usd / 1e6).toFixed(usd >= 1e7 ? 0 : 1) + "M";
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const [systems, summary, polys] = await Promise.all([
    fetch("data/systems.json").then((r) => r.json()),
    fetch("data/summary.json").then((r) => r.json()),
    fetch("data/boundaries.geojson").then((r) => r.json()).catch(() => null),
  ]);
  const cov = await fetch("data/boundary_coverage.json").then((r) => r.json()).catch(() => null);

  const N = systems.length;
  const costs = systems.map((s) => s.cost);
  const pops = systems.map((s) => s.pop);
  const conns = systems.map((s) => s.conn);
  const failing = systems.map((s) => (s.failing ? 1 : 0));
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const totalPeople = pops.reduce((a, b) => a + b, 0);

  // equity index: mean of available components (DAC, CalEnviroScreen pct, affordability, poverty pct); missing -> median
  const eqRaw = systems.map((s) => { const v = s.eq.filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  const med = (() => { const v = eqRaw.filter((x) => x !== null).sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; })();
  const eq = eqRaw.map((x) => (x === null ? med : x));

  const DEF = { b: 500, l: summary.defaults.lambda_eq, a: summary.defaults.at_risk_weight, r: summary.defaults.small_reserve };
  const BMIN = 25, BMAX = Math.round(totalCost / 1e6 / 5) * 5;
  const posToBudget = (t) => Math.round(BMIN * Math.pow(BMAX / BMIN, t / 100) / 5) * 5;
  const budgetToPos = (b) => Math.round((Math.log(b / BMIN) / Math.log(BMAX / BMIN)) * 100);

  const st = Object.assign({}, DEF, { color: "plan", poly: true, tab: "plan" });
  (function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has("b")) st.b = Math.min(BMAX, Math.max(BMIN, +p.get("b")));
    if (p.has("l")) st.l = +p.get("l");
    if (p.has("a")) st.a = +p.get("a");
    if (p.has("r")) st.r = +p.get("r");
  })();

  $("#snap").textContent = `SAFER snapshot ${String(summary.snapshot).slice(0, 10)} · ${fmtN(summary.all_systems)} systems · ${fmtN(N)} Failing or At-Risk · ${fmtN(totalPeople)} people`;

  // ---------- optimizer run ----------
  let plan = null;
  function run() {
    const ben = pops.map((p, i) => p * (failing[i] ? 1 : st.a) * (1 + st.l * eq[i]));
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
    plan.stabK = k; plan.stabOK = bd < Math.log(1.6); plan.stabBudget = bs[k];
    const strong = plan.stabOK ? chosen.filter((i) => systems[i].p[k] >= 0.5).length / Math.max(1, chosen.length) : null;
    plan.robust = strong;
  }

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([36.9, -119.5], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors", maxZoom: 14 }).addTo(map);
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

  function popup(i) {
    const s = systems[i];
    const stab = plan.stabOK ? `${pct(s.p[plan.stabK])} of stress tests at ~$${plan.stabBudget}M` : "n/a at this budget";
    return `<h4>${esc(s.name)}</h4><div class="mute">${esc(s.county)} County · ${s.failing ? "Failing" : "At-Risk"} · ${esc(s.dac)}</div>
      <div class="r"><span>People served</span><b>${fmtN(s.pop)}</b></div>
      <div class="r"><span>Connections</span><b>${fmtN(s.conn)}</b></div>
      <div class="r"><span>Modelled cost</span><b>${fmtM(s.cost)} (${fmtM(s.lo)}–${fmtM(s.hi)})</b></div>
      <div class="r"><span>Cost per person</span><b>$${fmtN(s.cost / s.pop)}</b></div>
      <div class="r"><span>In plan</span><b>${plan.inPlan[i] ? "Yes" : "No"}</b></div>
      <div class="r"><span>Funded in</span><b>${stab}</b></div>
      <div class="r"><span>Funding since 2017</span><b>${s.funded17 ? "Yes" : "No"}</b></div>
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

  function restyle() {
    dots.forEach((m, i) => { if (m) m.setStyle({ fillColor: colorFor(i), fillOpacity: opacityFor(i) }); });
    polyLayers.forEach((l, i) => l.setStyle({ color: colorFor(i), fillColor: colorFor(i), fillOpacity: plan.inPlan[i] ? 0.45 : 0.15, weight: plan.inPlan[i] ? 1.6 : 0.8 }));
    const leg = {
      plan: [[css("--plan"), "Funded in this plan"], [css("--fail"), "Failing, not funded"], [css("--risk"), "At-Risk, not funded"]],
      status: [[css("--fail"), "Failing"], [css("--risk"), "At-Risk"]],
      stab: [["hsl(200,20%,82%)", "Rarely funded in stress tests"], ["hsl(200,90%,40%)", "Funded in nearly every scenario"]],
    }[st.color];
    $("#legend").innerHTML = leg.map(([c, t]) => `<div><span class="dot" style="background:${c}"></span>${t}</div>`).join("")
      + (st.color === "stab" && !plan.stabOK ? `<div class="mute">Stress tests cover $100M–$2B</div>` : "") + `<div class="mute">Dot size = people served</div>`;
  }

  // ---------- KPIs ----------
  function kpis() {
    const gain = plan.basePeople ? plan.people / plan.basePeople : 0;
    const k = [
      `<div class="kpi hero"><div class="l">People reached</div><div class="v">${fmtN(plan.people)}</div><div class="s">${gain >= 1.005 ? `<span class="up">${gain.toFixed(1)}×</span> a status-first plan (${fmtN(plan.basePeople)})` : "same as status-first plan"}</div></div>`,
      `<div class="kpi"><div class="l">Systems funded</div><div class="v">${fmtN(plan.chosen.length)}</div><div class="s">of ${fmtN(N)} · ${plan.small} with ≤500 connections</div></div>`,
      `<div class="kpi"><div class="l">Spent of budget</div><div class="v">${fmtM(plan.spent)}</div><div class="s">budget ${fmtM(st.b * 1e6)} · $${fmtN(plan.spent / Math.max(1, plan.people))}/person</div></div>`,
      `<div class="kpi"><div class="l">In disadvantaged areas</div><div class="v">${pct(plan.dac / Math.max(1, plan.people))}</div><div class="s">of people reached (DAC or SDAC)</div></div>`,
      `<div class="kpi"><div class="l">Failing, left unfunded</div><div class="v">${fmtN(plan.leftFailing.length)}</div><div class="s">${fmtN(plan.leftPeople)} people</div></div>`,
      `<div class="kpi"><div class="l">Plan robustness</div><div class="v">${plan.robust === null ? "n/a" : pct(plan.robust)}</div><div class="s">${plan.robust === null ? "stress tests cover $100M–$2B" : `funded systems that win in ≥50% of ${summary.n_scenarios} stress tests`}</div></div>`,
    ];
    $("#kpis").innerHTML = k.join("");
  }

  // ---------- tables ----------
  function table(cols, rows, sortKey, desc) {
    let key = sortKey, dir = desc ? -1 : 1;
    const wrap = document.createElement("div");
    function draw() {
      const sorted = rows.slice().sort((a, b) => { const x = a[key], y = b[key]; return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir; });
      wrap.innerHTML = `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}" data-k="${c.k}">${c.h}${key === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
        <tbody>${sorted.slice(0, 400).map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${sorted.length > 400 ? `<p class="fine" style="color:var(--mute)">Showing first 400 of ${fmtN(sorted.length)}.</p>` : ""}`;
      wrap.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.k; if (k === key) dir = -dir; else { key = k; dir = -1; } draw(); }));
    }
    draw(); return wrap;
  }
  const tagS = (r) => `<span class="tag ${r.failing ? "f" : "a"}">${r.failing ? "Failing" : "At-Risk"}</span>`;
  const stabCell = (r) => (plan.stabOK ? pct(r.p[plan.stabK]) : "–");

  function tabPlan() {
    const rows = plan.chosen.map((i) => ({ ...systems[i], cpp: systems[i].cost / systems[i].pop, stab: plan.stabOK ? systems[i].p[plan.stabK] : -1 }));
    const el = document.createElement("div");
    el.innerHTML = `<p class="mute" style="margin-bottom:8px">${fmtN(rows.length)} systems, ${fmtM(plan.spent)} of ${fmtM(st.b * 1e6)}. Stability is the share of ${summary.n_scenarios} stress-test scenarios (cost errors and weights varied) in which the system is still funded${plan.stabOK ? ` at about $${plan.stabBudget}M` : "; not computed at this budget"}.</p>`;
    el.appendChild(table([
      { k: "name", h: "System" }, { k: "county", h: "County" }, { k: "failing", h: "Status", f: tagS },
      { k: "pop", h: "People", num: 1, f: (r) => fmtN(r.pop) }, { k: "cost", h: "Cost", num: 1, f: (r) => fmtM(r.cost) },
      { k: "cpp", h: "$/person", num: 1, f: (r) => "$" + fmtN(r.cpp) }, { k: "stab", h: "Stability", num: 1, f: stabCell }, { k: "dac", h: "Economic status" },
    ], rows, "pop", true));
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
      <p>For a budget B it chooses the set of Failing and At-Risk systems that maximizes total <i>benefit</i> subject to total modelled cost ≤ B. Benefit = people served × status weight (Failing 1, At-Risk as set) × (1 + equity weight × equity index). The problem is a 0/1 knapsack solved exactly by dynamic programming (costs rounded up to $250k units, so a plan never overspends). The same code runs in Python (reference) and in your browser; a test checks they pick identical systems.</p>
      <h3>Where the costs come from</h3>
      <p>The State Water Board publishes no per-system remediation cost as data. It publishes average long-term cost per service connection by system size and status (2024 Cost Assessment, Table 7) and total cost by county (Table 9). We apply Table 7 to each system's connection count, then scale so the statewide total equals the state's $${fmtN(c.official_total_musd)}M. Costs are <b>modelled</b>, not quotes. The shown range is the state's own 0.5×–2× convention.</p>
      <div class="note ${c.spearman_county > 0.8 ? "good" : ""}"><b>Calibration test against the state's county totals (58 counties).</b> Rank correlation ${c.spearman_county}, Pearson ${c.pearson_county}. The county-level typical error is large: median absolute error ${c.median_abs_pct_error_county_ge10M}% for counties with ≥$10M, log-ratio spread ${c.log_ratio_sd_county}. The raw model came out ${(c.raw_total_musd / c.official_total_musd).toFixed(2)}× the state total (${fmtN(c.raw_total_musd)}M vs ${fmtN(c.official_total_musd)}M) before scaling. This is why every system carries a stability score instead of a single claimed answer.</div>
      <h3>Stress test</h3>
      <p>${summary.n_scenarios} scenarios. In each, costs are multiplied by a county-level error drawn from the observed county errors above and a per-system lognormal error (σ ${summary.sigma_system}), and the equity weight (0–2) and At-Risk weight (0.25–0.75) are redrawn. The optimizer is re-run at $100M, $250M, $500M, $1B and $2B. Stability is the share of scenarios in which a system is funded.</p>
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
        <li><b>At-Risk is a score, not a confirmed contaminant.</b> That is why it is discounted by default.</li>
        <li><b>Count reconciliation:</b> this file lists ${fmtN(sc.Failing.systems)} Failing systems serving ${fmtN(sc.Failing.people)} people. The state's 2024 Needs Assessment summary reports 385 Failing systems. Different year and list; we have not reconciled every difference.</li>
        <li><b>Not modelled:</b> a system's readiness to build, willingness to consolidate, ongoing O&amp;M, and the state's separate analysis for state small systems and domestic wells.</li>
      </ul>
      <h3>Prior work, and what is different here</h3>
      <ul>
        <li><a href="https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/saferdashboard.html">State Water Board SAFER Dashboard</a>: shows status and risk. No budget, no cost-per-person, no optimization.</li>
        <li><a href="https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/needs.html">State Needs Assessment and Cost Assessment</a>: estimates statewide and county totals. Does not publish per-system costs as data or rank by reach per dollar.</li>
        <li><a href="https://pacinst.org/publication/drinking-water-cost-assessment-gap-analysis/">Pacific Institute et al., Cost Assessment and Gap Analysis</a>: costs and funding gaps. Not an interactive allocation tool.</li>
        <li><a href="https://phys.org/news/2022-07-framework-prioritizing-investment.amp">Wayne State and University of Michigan prioritization framework (2022)</a>: a decision framework for prioritizing water systems, not California-specific and without a budget optimizer.</li>
      </ul>
      <div class="note good"><b>What Xylem adds:</b> an exact budget-constrained optimizer over the state's own data; a per-system cost model calibrated and tested against the state's county totals; an uncertainty layer so a funder sees how stable each choice is; and an explicit view of who the optimizer leaves out. We searched for a tool combining these and did not find one; two searches are not proof of absence.</div>`;
    return el;
  }

  const TABS = { plan: tabPlan, left: tabLeft, county: tabCounty, method: tabMethod, gaps: tabGaps };
  function drawTab() { const b = $("#tabbody"); b.innerHTML = ""; b.appendChild(TABS[st.tab]()); }

  // ---------- wiring ----------
  function syncLabels() {
    $("#budgetLabel").textContent = fmtM(st.b * 1e6);
    $("#budgetHint").textContent = `Range $${BMIN}M to ${fmtM(totalCost)} (everything)`;
    $("#lamLabel").textContent = st.l.toFixed(1); $("#arwLabel").textContent = pct(st.a); $("#resLabel").textContent = pct(st.r);
  }
  function writeHash() {
    const p = new URLSearchParams({ b: st.b, l: st.l, a: st.a, r: st.r });
    history.replaceState(null, "", "#" + p.toString());
  }
  let timer = null;
  function update() { syncLabels(); clearTimeout(timer); timer = setTimeout(() => { run(); kpis(); restyle(); drawTab(); writeHash(); }, 60); }

  $("#budget").value = budgetToPos(st.b);
  $("#lam").value = st.l; $("#arw").value = st.a; $("#res").value = st.r;
  $("#budget").addEventListener("input", (e) => { st.b = posToBudget(+e.target.value); update(); });
  $("#lam").addEventListener("input", (e) => { st.l = +e.target.value; update(); });
  $("#arw").addEventListener("input", (e) => { st.a = +e.target.value; update(); });
  $("#res").addEventListener("input", (e) => { st.r = +e.target.value; update(); });
  document.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    st.color = b.dataset.color; document.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b)); restyle(); }));
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    st.tab = b.dataset.tab; document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); drawTab(); }));
  $("#poly").addEventListener("change", (e) => { st.poly = e.target.checked; if (st.poly) polyGroup.addTo(map); else map.removeLayer(polyGroup); });
  $("#reset").addEventListener("click", () => {
    Object.assign(st, DEF); $("#budget").value = budgetToPos(st.b); $("#lam").value = st.l; $("#arw").value = st.a; $("#res").value = st.r; update(); });
  $("#copy").addEventListener("click", async () => {
    writeHash(); try { await navigator.clipboard.writeText(location.href); $("#copyMsg").textContent = "Link copied. It reproduces this scenario."; }
    catch (e) { $("#copyMsg").textContent = "Copy the address bar to share this scenario."; }
    setTimeout(() => ($("#copyMsg").textContent = ""), 3000); });

  polyGroup.addTo(map);
  syncLabels(); run(); kpis(); restyle(); drawTab();
  window.__xylem = { st, get plan() { return plan; }, systems, summary };
})();
