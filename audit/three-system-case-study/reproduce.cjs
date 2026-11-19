"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const app = path.resolve(__dirname, "../../app");
const { optimize, SMALL_MAX_CONN } = require(path.join(app, "optimizer.js"));
const manifest = require(path.join(app, "data/snapshot.json"));
const demo = require("../demo/evidence.json");

function readSnapshotFile(name) {
  const bytes = readFileSync(path.join(app, "data", name));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, manifest.sha256[name], "Snapshot hash mismatch for " + name);
  return JSON.parse(bytes);
}

const systems = readSnapshotFile("systems.json");
const fallback = readSnapshotFile("forecast.json").metrics.fallback_at_risk_probability;
const eastOrosi = "CA5401003";
const caseIds = [eastOrosi, "CA3600086", "CA2700728"];
const budget = 500_000_000;
const horizon = 5;

// Match the browser's equity index and compute it on the full snapshot
// before the case-study screen changes the pool of eligible candidates.
const equityMeans = systems.map((system) => {
  const available = system.eq.filter((value) => value !== null);
  if (available.length === 0) return null;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
});
const observedMeans = equityMeans.filter((value) => value !== null).sort((a, b) => a - b);
const midpoint = Math.floor(observedMeans.length / 2);
const median = observedMeans.length % 2
  ? observedMeans[midpoint]
  : (observedMeans[midpoint - 1] + observedMeans[midpoint]) / 2;
const candidates = systems.map((system, i) => {
  const riskWeight = system.failing ? 1 : 1 - Math.pow(1 - (system.pf ?? fallback), horizon);
  const benefit = system.pop * riskWeight * (1 + (equityMeans[i] ?? median));
  return { ...system, benefit };
});

function select(pool, smallPriority) {
  const cost = pool.map((system) => system.cost);
  const benefit = pool.map((system) => system.benefit);
  const connections = pool.map((system) => system.conn);
  return optimize(cost, benefit, connections, budget, smallPriority).map((i) => pool[i]);
}

function metrics(selected) {
  return {
    systems: selected.length,
    smallSystems: selected.filter((system) => system.conn <= SMALL_MAX_CONN).length,
    failingSystems: selected.filter((system) => system.failing).length,
    reportedPopulationSum: selected.reduce((total, system) => total + system.pop, 0),
    modeledCost: selected.reduce((total, system) => total + system.cost, 0),
  };
}

function membershipChange(from, to) {
  const fromIds = new Set(from.map((system) => system.id));
  return to.filter((system) => !fromIds.has(system.id)).map(({ id, name }) => ({ id, name }));
}

const defaultPlan = select(candidates, 0);
const priorityPlan = select(candidates, 0.3);
for (const [key, selected] of [["budget-decision", defaultPlan], ["small-system-tradeoff", priorityPlan]]) {
  const saved = demo.cases.find((scenario) => scenario.name === key);
  assert.deepEqual(selected.map((system) => system.id), saved.selectedIds, key);
}
assert(priorityPlan.some((system) => system.id === eastOrosi));

// This is an offline what-if for a hypothetical new-award shortlist.
const screenedPlan = select(candidates.filter((system) => system.id !== eastOrosi), 0.3);
const plans = { defaultPlan, priorityPlan, screenedPlan };

const caseSystems = caseIds.map((id) => {
  const system = candidates.find((candidate) => candidate.id === id);
  const selectedIn = Object.keys(plans).filter((key) =>
    plans[key].some((candidate) => candidate.id === id));
  return {
    id, name: system.name, county: system.county, failing: system.failing,
    connections: system.conn, reportedPopulation: system.pop,
    modeledCost: system.cost, selectedIn,
  };
});
console.log(JSON.stringify({
  snapshot: manifest.id,
  settings: { budget, equityWeight: 1, horizon, routesEnabled: false, costMultiplier: 1 },
  metrics: Object.fromEntries(Object.entries(plans).map(([key, selected]) => [key, metrics(selected)])),
  caseSystems,
  removedFromPriorityPlan: membershipChange(screenedPlan, priorityPlan),
  addedToScreenedPlan: membershipChange(priorityPlan, screenedPlan),
}, null, 2));
