"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const model = require("../app/funding-review-model.js");
const sources = require("../app/funding-review-records.json").records;
const rows = require("../app/data/systems.json");
const fallback = require("../app/data/forecast.json").metrics.fallback_at_risk_probability;
const cases = require("../audit/demo/evidence.json").cases;
const systems = model.prepare(rows, fallback);
const systemIds = new Set(rows.map((system) => system.id));
const construction = sources.filter((record) => record.stage === "construction").map((record) => record.systemId);
const budget = 500_000_000;
const ids = (selected) => selected.map((system) => system.id);

test("public records match distinct frozen system IDs and include safe source links", () => {
  assert.equal(sources.length, 12);
  assert.equal(new Set(sources.map((record) => record.systemId)).size, sources.length);
  assert.equal(construction.length, 6);
  for (const record of sources) {
    assert(systemIds.has(record.systemId));
    assert(Object.hasOwn(model.stageInfo, record.stage));
    assert(record.scope && record.note && record.sources.length);
    assert(record.sources.every((source) => model.safeSource(source.url)));
  }
});

test("review reproduces the original 0% and 30% app plans by system ID", () => {
  for (const [reserve, name] of [[0, "budget-decision"], [.3, "small-system-tradeoff"]]) {
    const plan = model.compare(systems, sources, [], budget, reserve);
    assert.deepEqual(ids(plan.original), cases.find((scenario) => scenario.name === name).selectedIds);
    assert.deepEqual(ids(plan.screened), ids(plan.original));
  }
});

test("East Orosi screening changes the same seven selections as the case study", () => {
  const plan = model.compare(systems, sources, ["CA5401003", "CA3600086", "CA2700728"], budget, .3);
  assert.deepEqual([...plan.excluded], ["CA5401003"]);
  assert.equal(model.summarize(plan.screened, sources).population, 393369);
  assert.deepEqual(ids(plan.added), ["CA1010042", "CA2700728", "CA4300779", "CA4400660"]);
  assert.deepEqual(ids(plan.removed), ["CA4510004", "CA5401003", "CA5700623"]);
});

test("both screened methods use the tracked exclusion, same candidates and same budget", () => {
  for (const amount of [100e6, 250e6, 500e6, 1e9, 2e9]) {
    for (const reserve of [0, .15, .3, .45, .6]) {
      const plan = model.compare(systems, sources, construction, amount, reserve);
      for (const selected of [plan.screened, plan.baseline]) {
        const stats = model.summarize(selected, sources);
        assert(stats.roundedCost <= amount);
        assert.equal(stats.construction, 0);
        assert.equal(ids(selected).length, new Set(ids(selected)).size);
      }
      assert.equal(plan.screened.length, plan.original.length + plan.added.length - plan.removed.length);
    }
  }
  const { original, screened, baseline } = model.compare(systems, sources, construction, budget, .3);
  assert.deepEqual([original.length, screened.length, baseline.length], [112, 112, 114]);
  assert.equal(model.summarize(original, sources).construction, 4);
  assert.equal(model.summarize(screened, sources).unknown, 109);
});

test("local evidence validates dates and HTTPS sources, and CSV neutralizes formulas", () => {
  const record = { systemId: "CA2700728", stage: "unknown", scope: "Project check", note: "",
    sources: [{ date: "2026-11-17", url: "https://www.waterboards.ca.gov/" }] };
  assert.equal(model.validateLocal(record, systemIds), true);
  for (const url of ["javascript:alert(1)", "http://example.com/", "https://user:pass@example.com/"]) {
    assert.equal(model.safeSource(url), null);
  }
  assert.equal(model.validateLocal({ ...record, sources: [{ ...record.sources[0], date: "2026-02-30" }] }, systemIds), false);
  assert.equal(model.validateLocal({ ...record, sources: {} }, systemIds), false);
  assert.equal(model.csvLine(["=2+2", " @SUM(2)", 'a"b', "Safe"]), "\"'=2+2\",\"' @SUM(2)\",\"a\"\"b\",\"Safe\"");
});
