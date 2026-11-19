
(async function () {
  "use strict";

  const model = window.XylemFundingReview;
  const $ = (id) => document.getElementById(id);
  const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const storageKey = "xylem-funding-review-records";
  const tracking = new Set();
  const params = new URLSearchParams(location.search);
  const requestedId = params.get("system")?.toUpperCase();
  const plannerScenario = new URLSearchParams(params.get("scenario") ?? "");
  if (plannerScenario.has("b")) $("planner-link").hash = plannerScenario.toString();

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function sourceLink(source) {
    const label = source.date ? source.label + " (" + source.date + ")" : source.label;
    const href = model.safeSource(source.url);
    if (!href) return element("span", label);
    const link = element("a", label);
    link.href = href;
    return link;
  }

  async function load(path, expected) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Missing data");
    const bytes = await response.arrayBuffer();
    if (expected) {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== expected) throw new Error("Snapshot mismatch");
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  let build, manifest, dataset, rows, forecast;
  try {
    [build, manifest] = await Promise.all([load("build.json"), load("data/snapshot.json")]);
    if (build.snapshot_id !== manifest.id || !build.sha256["funding-review-records.json"] || !manifest.sha256["systems.json"] || !manifest.sha256["forecast.json"]) throw new Error("Build mismatch");
    [dataset, rows, forecast] = await Promise.all([
      load("funding-review-records.json", build.sha256["funding-review-records.json"]),
      load("data/systems.json", manifest.sha256["systems.json"]),
      load("data/forecast.json", manifest.sha256["forecast.json"]),
    ]);
  } catch {
    $("load-status").textContent = "Funding review could not load its verified data. Reload the page or return to the allocation planner.";
    return;
  }

  window.XylemLabels.apply(rows);
  const systems = model.prepare(rows, forecast.metrics.fallback_at_risk_probability);
  const byId = new Map(systems.map((system) => [system.id, system]));
  const knownIds = new Set(byId.keys());
  const builtIn = new Map(dataset.records.map((record) => [record.systemId, record]));
  const local = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(saved)) {
      for (const record of saved) {
        if (model.validateLocal(record, knownIds) && !builtIn.has(record.systemId)) local.set(record.systemId, record);
      }
    }
  } catch {
    // Public evidence and the comparison remain usable with storage disabled.
  }

  const records = () => [...builtIn.values(), ...local.values()];
  const recordFor = (id) => builtIn.get(id) ?? local.get(id);

  function renderRequestedSystem() {
    const system = byId.get(requestedId);
    if (!system) return;
    const record = recordFor(system.id);
    $("requested-system").hidden = false;
    $("requested-title").textContent = system.name;
    $("requested-status").textContent = record
      ? model.stageInfo[record.stage][0] + ". " + record.scope
      : "Funding is unverified for this system in the current review.";
    const link = $("requested-link");
    link.href = record ? "#record-" + system.id : "#add-project-record";
    link.textContent = record ? "Read the evidence and sources" : "Add a local project record";
    link.onclick = record ? revealEvidence : () => {
      $("add-project-record").open = true;
      $("record-form").elements.systemId.value = system.id;
    };
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...local.values()]));
      return true;
    } catch {
      return false;
    }
  }

  const idOptions = document.createDocumentFragment();
  for (const system of systems) {
    const option = element("option", system.name);
    option.value = system.id;
    idOptions.append(option);
  }
  $("system-ids").append(idOptions);

  function filterEvidence() {
    const query = $("evidence-query").value.trim().toLowerCase();
    const stage = $("evidence-stage").value;
    const cards = [...$("records").children];
    let shown = 0;
    for (const card of cards) {
      const id = card.dataset.systemId;
      const system = byId.get(id);
      const label = `${system.name} ${id} ${system.county}`.toLowerCase();
      card.hidden = !label.includes(query) || (stage !== "" && recordFor(id).stage !== stage);
      if (!card.hidden) shown++;
    }
    $("evidence-matches").textContent = shown
      ? `Showing ${format.format(shown)} of ${format.format(cards.length)} records`
      : "No records match. Try another name or funding stage.";
  }

  function revealEvidence() {
    const card = document.getElementById(this.hash.slice(1));
    if (!card?.hidden) return;
    $("evidence-query").value = "";
    $("evidence-stage").value = "";
    filterEvidence();
  }

  $("evidence-query").addEventListener("input", filterEvidence);
  $("evidence-stage").addEventListener("change", filterEvidence);

  function renderCards() {
    renderRequestedSystem();
    $("coverage").textContent = "Public records for " + dataset.records.length + " of " + format.format(systems.length) +
      " systems, reviewed " + dataset.reviewedOn + ". The sample covers different types of projects. " +
      "Systems without funding evidence remain unverified." +
      (local.size ? " Local records: " + local.size + "." : "");
    $("records").replaceChildren(...records().map((record) => {
      const card = element("article", undefined, "record");
      card.id = "record-" + record.systemId;
      card.dataset.systemId = record.systemId;
      card.dataset.stage = record.stage;
      const system = byId.get(record.systemId);
      const [stage, action] = model.stageInfo[record.stage];
      const ref = element("p", system.id + " · " + system.county + " County" +
        (local.has(system.id) ? " · Local record" : ""), "id");
      card.append(element("h3", system.name), ref, element("p", stage, "stage"),
        element("p", record.scope, "scope"), element("p", record.note),
        element("p", action, "action"));
      const sources = element("ul");
      for (const source of record.sources) {
        const item = element("li");
        item.append(sourceLink(source));
        sources.append(item);
      }
      card.append(sources);
      if (record.stage === "construction") {
        const label = element("label");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.dataset.track = system.id;
        checkbox.setAttribute("aria-label", "Track " + system.name + " separately");
        label.append(checkbox, document.createTextNode("Set this project aside for the scenario"));
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) tracking.add(system.id);
          else tracking.delete(system.id);
          renderResults();
        });
        card.append(label);
      }
      if (local.has(system.id)) {
        const remove = element("button", "Remove local record");
        remove.type = "button";
        remove.addEventListener("click", () => {
          local.delete(system.id);
          tracking.delete(system.id);
          const persisted = persist();
          renderCards();
          renderResults();
          const formStatus = $("form-status");
          formStatus.parentElement.parentElement.open = true;
          $("record-form").elements.systemId.focus();
          formStatus.textContent = persisted ? "Local record removed." : "Removed for this session.";
        });
        card.append(remove);
      }
      return card;
    }));
    filterEvidence();
  }

  function list(id, selected, detail) {
    const target = $(id);
    if (!selected.length) {
      target.replaceChildren(element("li", "None"));
      return;
    }
    target.replaceChildren(...selected.map((system) => {
      const record = recordFor(system.id);
      const stage = record?.stage ?? "unknown";
      const label = system.name + " (" + system.id + ")";
      const item = element("li");
      if (record) {
        const link = element("a", label);
        link.href = "#record-" + system.id;
        link.addEventListener("click", revealEvidence);
        item.append(link);
      } else {
        item.append(document.createTextNode(label));
      }
      const explanation = detail === "removed"
        ? result.excluded.has(system.id) ? "Tracked separately" : "Changed by reallocation"
        : model.stageInfo[stage].join(". ");
      item.append(element("span", explanation, "item-detail"));
      return item;
    }));
  }

  let result, budget, reserve;
  function renderResults() {
    budget = Number($("budget").value) * 1e6;
    reserve = Number($("reserve").value);
    const evidence = records();
    result = model.compare(systems, evidence, tracking, budget, reserve);
    for (const checkbox of document.querySelectorAll("input[data-track]")) {
      checkbox.checked = result.excluded.has(checkbox.dataset.track);
    }

    const methods = [
      ["Allocation before tracking", result.original],
      ["Allocation after tracking", result.screened],
      ["Benefit-per-dollar ranking after tracking", result.baseline],
    ];
    $("comparison").tBodies[0].replaceChildren(...methods.map(([name, set]) => {
      const values = model.summarize(set, evidence);
      const row = element("tr");
      const heading = element("th", name);
      heading.scope = "row";
      row.append(heading, ...[
        values.systems, values.small, values.population, money.format(values.cost),
        values.benefit, values.construction, values.unknown,
      ].map((value) => element("td", typeof value === "number" ? format.format(value) : value)));
      return row;
    }));
    const tracked = result.excluded.size;
    $("before-count").textContent = format.format(result.original.length);
    $("after-count").textContent = format.format(result.screened.length);
    $("tracked-count").textContent = format.format(tracked);
    $("reset").disabled = tracked === 0;
    const projectCount = tracked === 1 ? "1 project set aside" : format.format(tracked) + " projects set aside";
    $("result-status").textContent = tracked
      ? projectCount + ". " + result.added.length + " entered and " + result.removed.length + " left the modeled shortlist."
      : format.format(result.original.length) + " systems on the modeled shortlist. Try East Orosi or choose another documented construction project below.";
    $("changes").hidden = tracked === 0;
    list("added", result.added);
    list("removed", result.removed, "removed");
    list("shortlist-items", result.screened);
  }

  function trackOnly(ids) {
    tracking.clear();
    for (const id of ids) tracking.add(id);
    renderResults();
  }

  function tryExample(ids) {
    trackOnly(ids);
    const heading = $("result-title");
    heading.focus({preventScroll: true});
    heading.scrollIntoView({block: "start"});
  }
  $("east").addEventListener("click", () => tryExample(["CA5401003"]));
  $("all").addEventListener("click", () => tryExample(dataset.records
    .filter((record) => record.stage === "construction").map((record) => record.systemId)));
  $("reset").addEventListener("click", () => trackOnly([]));
  $("budget").addEventListener("change", renderResults);
  $("reserve").addEventListener("change", renderResults);

  $("record-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const record = {
      systemId: fields.get("systemId").trim().toUpperCase(),
      stage: fields.get("stage"),
      scope: fields.get("scope").trim(),
      note: fields.get("note").trim(),
      sources: [{ date: fields.get("date"), label: "Local source", url: fields.get("url").trim() }],
    };
    if (builtIn.has(record.systemId) || !model.validateLocal(record, knownIds)) {
      $("form-status").textContent = builtIn.has(record.systemId)
        ? "This system has public evidence in the demo. Enter a different system ID."
        : "Enter a system ID from the snapshot, a valid date, an HTTPS link and a project scope.";
      return;
    }
    local.set(record.systemId, record);
    if (record.stage !== "construction") tracking.delete(record.systemId);
    const persisted = persist();
    renderCards();
    renderResults();
    event.currentTarget.reset();
    $("form-status").textContent = persisted ? "Local project record saved." : "Saved for this session. Browser storage is unavailable.";
  });

  $("export").addEventListener("click", () => {
    const ids = (set) => new Set(set.map((system) => system.id));
    const before = ids(result.original);
    const after = ids(result.screened);
    const heuristic = ids(result.baseline);
    const columns = [
      "snapshot", "ui_build", "budget_usd", "small_system_priority", "system_id", "system_name", "county",
      "reported_population", "modeled_cost_usd", "tracked_separately", "selected_before", "selected_after",
      "selected_by_screened_ranking", "funding_stage", "record_origin", "scope", "next_action", "source_dates", "source_urls",
    ];
    const rows = systems.filter(({ id }) => before.has(id) || after.has(id) || heuristic.has(id) || result.excluded.has(id))
      .map((system) => {
        const id = system.id;
        const record = recordFor(id);
        const stage = record?.stage ?? "unknown";
        return [
          manifest.id, build.id, budget, reserve, id, system.name, system.county, system.pop, system.cost,
          result.excluded.has(id), before.has(id), after.has(id), heuristic.has(id),
          model.stageInfo[stage][0], builtIn.has(id) ? "public sample" : local.has(id) ? "local entry" : "",
          record?.scope, model.stageInfo[stage][1],
          record?.sources.map((source) => source.date ?? "").join(" | "),
          record?.sources.map((source) => source.url).join(" | "),
        ];
      });
    const file = new Blob([[columns, ...rows].map(model.csvLine).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = element("a");
    link.href = url;
    link.download = "equiflow-funding-review.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  renderCards();
  renderResults();
  $("load-status").hidden = true;
  $("review").hidden = false;
})();
