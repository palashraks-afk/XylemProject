/* Verify the real saved snapshot is repaired only for the documented identity. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const labels = require("../app/system-labels.js");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/data/systems.json"), "utf8"));

test("the real snapshot correction changes only one system name", () => {
  const shown = structuredClone(raw);
  assert.deepEqual(labels.apply(shown), ["CA5610029"]);
  const corrected = shown.find(s => s.id === "CA5610029");
  assert.equal(corrected.name, "Vineyard Avenue Acres MWC");
  assert.ok(!shown.some(s => /^[0-9]{1,2}[/][0-9]{1,2}[/][0-9]{4}$/.test(s.name)));
  corrected.name = "10/30/2026";
  assert.deepEqual(shown, raw);
});

test("correction is ID-specific, guarded against changed source names, and repeatable", () => {
  const shown = [
    {id: "OTHER", name: "10/30/2026"},
    {id: "CA5610029", name: "A newly verified source name"}
  ];
  const original = structuredClone(shown);
  assert.deepEqual(labels.apply(shown), []);
  assert.deepEqual(shown, original);
  const repaired = [{id: "CA5610029", name: "10/30/2026"}];
  labels.apply(repaired);
  assert.deepEqual(labels.apply(repaired), []);
  assert.equal(repaired[0].name, "Vineyard Avenue Acres MWC");
});
