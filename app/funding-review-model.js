
(function (root) {
  "use strict";

  const optimizer = typeof module === "undefined" ? root.XylemOpt : require("./optimizer.js");
  const { UNIT, SMALL_MAX_CONN } = optimizer;
  const rounded = (cost) => Math.max(1, Math.ceil(cost / UNIT)) * UNIT;
  const stageInfo = {
    construction: ["Construction funding documented", "Track the funded scope and verify any separate remaining need."],
    interim: ["Interim support documented", "Confirm the permanent project scope and any remaining funding gap."],
    planning: ["Planning support documented", "Check readiness, proposed construction scope and financing."],
    unknown: ["Project funding unverified", "Verify current project scope, readiness and funding."],
  };

  function prepare(systems, fallback) {
    const means = systems.map((system) => {
      const values = system.eq.filter((value) => value !== null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    });
    const observed = means.filter((value) => value !== null).sort((a, b) => a - b);
    const middle = Math.floor(observed.length / 2);
    const median = observed.length % 2 ? observed[middle] : (observed[middle - 1] + observed[middle]) / 2;
    return systems.map((system, index) => {
      const risk = system.failing ? 1 : 1 - Math.pow(1 - (system.pf ?? fallback), 5);
      const benefit = system.pop * risk * (1 + (means[index] ?? median));
      return { ...system, benefit };
    });
  }

  function choose(pool, budget, reserve) {
    return optimizer.optimize(
      pool.map((system) => system.cost),
      pool.map((system) => system.benefit),
      pool.map((system) => system.conn),
      budget,
      reserve,
    ).map((index) => pool[index]);
  }

  function greedy(pool, budget, reserve) {
    const ranked = pool.slice().sort((a, b) => b.benefit / rounded(b.cost) - a.benefit / rounded(a.cost));
    const chosen = new Set();
    let spent = 0;
    const spend = (limit, smallOnly) => {
      for (const system of ranked) {
        if (chosen.has(system) || (smallOnly && system.conn > SMALL_MAX_CONN)) continue;
        const cost = rounded(system.cost);
        if (system.benefit > 0 && spent + cost <= limit) {
          chosen.add(system);
          spent += cost;
        }
      }
    };
    if (reserve) spend(budget * reserve, true);
    spend(budget, false);
    return pool.filter((system) => chosen.has(system));
  }

  function compare(systems, records, tracking, budget, reserve) {
    const eligibleIds = new Set(records.filter((record) => record.stage === "construction").map((record) => record.systemId));
    const excluded = new Set([...tracking].filter((id) => eligibleIds.has(id)));
    const pool = systems.filter((system) => !excluded.has(system.id));
    const original = choose(systems, budget, reserve);
    const screened = choose(pool, budget, reserve);
    const baseline = greedy(pool, budget, reserve);
    const originalIds = new Set(original.map((system) => system.id));
    const screenedIds = new Set(screened.map((system) => system.id));
    return {
      original, screened, baseline, excluded,
      added: screened.filter((system) => !originalIds.has(system.id)),
      removed: original.filter((system) => !screenedIds.has(system.id)),
    };
  }

  function summarize(selected, records) {
    const stageById = new Map(records.map((record) => [record.systemId, record.stage]));
    return selected.reduce((summary, system) => {
      summary.systems += 1;
      summary.small += Number(system.conn <= SMALL_MAX_CONN);
      summary.population += system.pop;
      summary.cost += system.cost;
      summary.roundedCost += rounded(system.cost);
      summary.benefit += system.benefit;
      summary.construction += Number(stageById.get(system.id) === "construction");
      summary.unknown += Number((stageById.get(system.id) ?? "unknown") === "unknown");
      return summary;
    }, { systems: 0, small: 0, population: 0, cost: 0, roundedCost: 0, benefit: 0, construction: 0, unknown: 0 });
  }

  function safeSource(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function validateLocal(record, knownIds) {
    if (!record || !knownIds.has(record.systemId) || !Object.hasOwn(stageInfo, record.stage)) return false;
    if (!Array.isArray(record.sources)) return false;
    const [source] = record.sources;
    if (!source || typeof source.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) return false;
    const date = new Date(source.date);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== source.date) return false;
    return typeof record.scope === "string" && record.scope.trim().length > 0 && record.scope.length <= 140
      && typeof record.note === "string" && record.note.length <= 500
      && typeof source.url === "string" && source.url.length <= 1000
      && Boolean(safeSource(source.url));
  }

  function csvLine(values) {
    return values.map((value) => {
      const raw = String(value ?? "");
      const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replaceAll('"', '""') + '"';
    }).join(",");
  }

  const api = { stageInfo, prepare, compare, summarize, safeSource, validateLocal, csvLine };
  if (typeof module === "undefined") root.XylemFundingReview = api;
  else module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
