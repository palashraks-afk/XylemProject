/* Judges' view: a 90-second guided tour on the live 3D map, plus the three challenge criteria answered with facts read
 * from the app's own data files (so the numbers cannot drift from the app), and what is NOT claimed. Open with the header
 * button or ?judges=1. It drives the real app (budget presets, layer toggles, camera); it has no data of its own. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const fmtM = (usd) => (usd >= 1e9 ? "$" + (usd / 1e9).toFixed(2) + "B" : "$" + (usd / 1e6).toFixed(usd >= 1e7 ? 0 : 1) + "M");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = (u) => fetch(u).then((r) => r.json()).catch(() => null);

  let facts = null, step = 0, tab = "tour", panel = null;

  async function load() {
    const [systems, summary, forecast, gis, routes] = await Promise.all(["systems", "summary", "forecast", "gis", "routes"].map((n) => get(`data/${n}.json`)));
    if (!systems || !summary) return null;
    const people = systems.reduce((a, s) => a + s.pop, 0);
    const dac = systems.filter((s) => s.eq && s.eq[0] !== null && s.eq[0] > 0).reduce((a, s) => a + s.pop, 0);
    const byCounty = {};
    systems.forEach((s) => { const c = (byCounty[s.county] = byCounty[s.county] || { n: 0, failing: 0, people: 0 }); c.n++; c.people += s.pop; if (s.failing) c.failing++; });
    const top = Object.entries(byCounty).sort((a, b) => b[1].people - a[1].people)[0];
    const row = summary.comparison.find((r) => r.budget_musd === 500) || summary.comparison[Math.floor(summary.comparison.length / 2)];
    const m = forecast && forecast.metrics, mod = m && m.models, ens = mod && (mod.ensemble || mod.gradient_boosting);
    const rs = routes && routes.summary && routes.summary.by_status;
    return { systems, summary, gis, N: systems.length, people, dacShare: dac / people, top: { name: top[0], ...top[1] }, row,
      ens, statusAuc: mod && mod.status_only && mod.status_only.auc, m, rs, hub: gis && gis.hubs && gis.hubs[0] };
  }

  const tourSteps = () => {
    const f = facts, r = f.row, o = r.optimizer, b = r.status_first_baseline, gain = o.people / b.people, g = f.gis && f.gis.stats;
    return [
      { h: "The problem", act: () => { layers({}); window.Xylem3D && Xylem3D.home(); },
        t: `<b>${fmtN(f.N)}</b> California drinking-water systems are Failing or At-Risk, serving <b>${fmtN(f.people)}</b> people, <b>${pct(f.dacShare)}</b> of them in disadvantaged communities. The State Water Board publishes each system's status, but not where a limited budget would reach the most people.` },
      { h: "Where it concentrates", act: () => { layers({ hot: true }); window.Xylem3D && Xylem3D.flyToCounty(f.top.name); },
        t: `<b>${esc(f.top.name)} County</b> alone has ${f.top.n} such systems and ${fmtN(f.top.people)} people at risk. Failing systems cluster in space${g ? ` (Moran's I = ${g.morans_i_failing}, p = ${g.morans_p_permutation_999}; weak but real)` : ""}. Rings mark statistical hotspots.` },
      { h: "Set a budget", act: () => { layers({}); preset("500"); window.Xylem3D && Xylem3D.home(); },
        t: `At <b>$500M</b> the plan funds <b>${o.systems}</b> systems and reaches <b>${fmtN(o.people)}</b> people, <b>${gain.toFixed(1)}×</b> a status-first approach (${fmtN(b.people)}). Green towers are funded; red and amber are not. At small budgets (≤$250M) the two are nearly equal (see Method); the advantage appears from about $500M.` },
      { h: "How each is fixed", act: () => { layers({ hubs: true, allconn: true }); const h = f.hub; if (h && window.Xylem3D) Xylem3D.flyToLonLat(h.lon, h.lat, 10.8); },
        t: f.hub ? `<b>${esc(f.hub.name)}</b> could absorb <b>${f.hub.n}</b> failing neighbours (${fmtN(f.hub.people)} people) for about ${fmtM(f.hub.cost)} under the state's 3-mile consolidation rule, costed with its own unit costs ($220/ft pipe, service lines, fees). Purple = hub; dashed = viable connections.` : "Consolidation routes use the state's own rules and unit costs." },
      { h: "Can you trust it?", act: () => { layers({}); window.Xylem3D && Xylem3D.home(); },
        t: `Next-year failure forecast, trained on 2024→25 and tested on 2025→26: AUC <b>${f.ens ? f.ens.auc.toFixed(3) : "n/a"}</b> vs <b>${f.statusAuc}</b> for SAFER status alone. Costs are modelled, not quotes: county rank correlation ${f.summary.calibration.spearman_county}, but typical error about ${Math.round(f.summary.calibration.median_abs_pct_error_county_ge10M)}%. Every claim and limit is in <i>Method and tests</i> and <i>Gaps</i>.` },
    ];
  };

  function criteria() {
    const f = facts, r = f.row, o = r.optimizer, b = r.status_first_baseline, c = f.summary.calibration, s = f.rs;
    const share = (k) => (s && s[k] ? pct(s[k].viable / s[k].total) : "n/a");
    return [
      { h: "Impact", facts: [
        `${fmtN(f.N)} systems and ${fmtN(f.people)} people at risk (state SAFER data, snapshot ${String(f.summary.snapshot).slice(0, 10)}); ${pct(f.dacShare)} in disadvantaged communities.`,
        `At $500M: ${fmtN(o.people)} people reached, ${(o.people / b.people).toFixed(1)}× a status-first approach; ${pct(o.dac_people / o.people)} in disadvantaged areas.`,
        `Produces a plan a funder can act on: cost, $/person, stability and the reason for each system; downloadable as CSV; shareable by link.`],
        no: "No real-user feedback yet. California only. Costs are planning estimates." },
      { h: "Challenge fit and feasibility (Water Access)", facts: [
        `Targets reliable, affordable access: the objective weights disadvantaged status, affordability, poverty and environmental burden, and can reserve budget for small systems that cost more per person.`,
        `Uses the state's own methods: consolidation is viable for ${share("Failing")} of Failing and ${share("At-Risk")} of At-Risk systems, against the state's own 44% and 43%.`,
        `Works now in a browser with an exact optimizer, automated tests (including a Python/JavaScript parity check) and a fallback to a 2D map if 3D cannot load.`],
        no: `Costs: median county error about ${Math.round(c.median_abs_pct_error_county_ge10M)}%. Routes are straight-line stand-ins. No pilot with a utility.` },
      { h: "Innovation", facts: [
        `One 3D placement map that combines an exact budget optimizer, forecast-valued prevention and consolidation routing using the state's method.`,
        f.ens ? `The failure forecast beats SAFER status on a strict next-year test: AUC ${f.ens.auc.toFixed(3)} (95% ${f.ens.auc_ci95[0]} to ${f.ens.auc_ci95[1]}) vs ${f.statusAuc}.` : "A temporal backtest of the failure forecast is in Method.",
        `Closest prior work: State SAFER Dashboard, Pacific Institute cost study, a Michigan prioritization framework. We found none combining these (a limited search); see NOVELTY.md.`],
        no: "The forecast gain is modest and most onsets are missed. Novelty is the combination, not any single method." },
    ];
  }

  function preset(v) { const b = $(`[data-preset="${v}"]`); if (b) b.click(); }
  function layers(want) {
    ["hot", "hubs", "allconn"].forEach((k) => { const c = $(`[data-k="${k}"]`); if (c && c.checked !== !!want[k]) { c.checked = !!want[k]; c.dispatchEvent(new Event("input", { bubbles: true })); } });
  }

  function render() {
    const steps = tourSteps(), cr = criteria();
    const body = tab === "tour"
      ? `<div class="jstep"><span class="eyebrow">Step ${step + 1} of ${steps.length}</span><h3>${steps[step].h}</h3><p>${steps[step].t}</p></div>
         <div class="jnav"><button type="button" data-j="prev" ${step === 0 ? "disabled" : ""}>Back</button><span class="dots">${steps.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</span>
         <button type="button" class="primary" data-j="next">${step === steps.length - 1 ? "Criteria →" : "Next"}</button></div>`
      : cr.map((c) => `<section class="jcrit"><h3>${c.h}</h3><ul>${c.facts.map((x) => `<li>${x}</li>`).join("")}</ul><p class="jno"><b>Not claimed:</b> ${c.no}</p></section>`).join("");
    panel.innerHTML = `<div class="jhead"><b>Judges' view</b><div class="seg"><button type="button" data-j="tab-tour" class="${tab === "tour" ? "on" : ""}">Tour</button><button type="button" data-j="tab-crit" class="${tab === "crit" ? "on" : ""}">Criteria</button></div>
      <button type="button" class="x" data-j="close" aria-label="Close judges' view">×</button></div><div class="jbody">${body}</div>`;
  }

  function go(n) { step = Math.max(0, Math.min(n, 4)); render(); tourSteps()[step].act(); }
  function open(startTab) {
    if (!facts) return;
    tab = startTab || "tour"; panel.hidden = false; document.body.classList.add("judging");
    $("#judgesBtn") && $("#judgesBtn").setAttribute("aria-expanded", "true");
    if (tab === "tour") go(step); else render();
  }
  function close() { panel.hidden = true; document.body.classList.remove("judging"); $("#judgesBtn") && $("#judgesBtn").setAttribute("aria-expanded", "false"); }

  async function init() {
    const btn = document.createElement("button");
    btn.id = "judgesBtn"; btn.type = "button"; btn.className = "judgesBtn"; btn.textContent = "Judges' view"; btn.setAttribute("aria-expanded", "false"); btn.disabled = true;
    const top = $(".top"); if (top) top.appendChild(btn);
    panel = document.createElement("aside"); panel.id = "judges"; panel.className = "judges"; panel.hidden = true; panel.setAttribute("aria-label", "Judges' view");
    document.body.appendChild(panel);
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || b.disabled) return; const k = b.dataset.j;
      if (k === "close") close(); else if (k === "prev") go(step - 1);
      else if (k === "next") { if (step === 4) { tab = "crit"; render(); } else go(step + 1); }
      else if (k === "tab-tour") { tab = "tour"; go(step); } else if (k === "tab-crit") { tab = "crit"; render(); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });
    btn.addEventListener("click", () => (panel.hidden ? open() : close()));
    facts = await load();
    btn.disabled = !facts;
    if (facts && new URLSearchParams(location.search).get("judges")) {
      // wait for the app and the 3D map before driving them
      let tries = 0; const t = setInterval(() => { tries++; if ((window.__xylem && window.Xylem3D && Xylem3D.map()) || tries > 120) { clearInterval(t); open(); } }, 250);
    }
  }
  window.XylemJudges = { open, close, criteria: () => (facts ? criteria() : null) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
