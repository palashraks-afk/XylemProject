"use strict";

const model = require("../app/funding-review-model.js");
const records = require("../app/funding-review-records.json").records;
const systems = require("../app/data/systems.json");
const fallback = require("../app/data/forecast.json").metrics.fallback_at_risk_probability;
const { id: snapshot } = require("../app/data/snapshot.json");

const candidates = model.prepare(systems, fallback);
const tracked = records.filter(({ stage }) => stage === "construction").map(({ systemId }) => systemId);
const budgets = [100e6, 250e6, 500e6, 1e9, 2e9];
const smallSystemPriority = .3;
const summaries = budgets.map((budget) => {
  const result = model.compare(candidates, records, tracked, budget, smallSystemPriority);
  const summarize = (set) => model.summarize(set, records);
  return {
    budget, before: summarize(result.original), screened: summarize(result.screened),
    ranking: summarize(result.baseline),
    entered: result.added.map(({ id }) => id),
    left: result.removed.map(({ id }) => id),
  };
});
console.log(JSON.stringify({ snapshot, smallSystemPriority, tracked, summaries }, null, 2));
