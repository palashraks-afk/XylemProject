
(async function () {
  "use strict";

  const model = window.XylemFundingReview;
  const $ = (id) => document.getElementById(id);
  const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const storageKey = "xylem-funding-review-records";
  const tracking = new Set();
  const exampleId = "CA5401003";
  const fundingLabels = {
    construction: "Construction funded",
    interim: "Short-term help funded",
    planning: "Planning funded",
    unknown: "Funding unknown",
  };
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
    $("load-status").textContent = "Could not load the funding records. Reload the page to try again.";
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

  const exampleRecord = builtIn.get(exampleId);
  $("example-sources").replaceChildren(...(exampleRecord?.sources ?? []).map((source) => {
    const item = element("li");
    item.append(sourceLink(source));
    return item;
  }));

  function renderRequestedSystem() {
    const system = byId.get(requestedId);
    if (!system) return;
    const record = recordFor(system.id);
    $("requested-system").hidden = false;
    $("requested-title").textContent = system.name;
    $("requested-status").textContent = record
      ? fundingLabels[record.stage] + ". " + record.scope
      : "There is no funding record for this system in EquiFlow.";
    const link = $("requested-link");
    link.href = record ? "#record-" + system.id : "#add-project-record";
    link.textContent = record ? "See the funding record" : "Add your own record";
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
      : "No records match. Try a different name or choose All records.";
  }

  function revealEvidence() {
    const card = document.getElementById(this.hash.slice(1));
    if (!card) return;
    if (card.hidden) {
      $("evidence-query").value = "";
      $("evidence-stage").value = "";
      filterEvidence();
    }
    card.querySelector("details").open = true;
  }

  $("evidence-query").addEventListener("input", filterEvidence);
  $("evidence-stage").addEventListener("change", filterEvidence);

  function renderCards() {
    renderRequestedSystem();
    $("coverage").textContent = `EquiFlow has public records for ${dataset.records.length} of ${format.format(systems.length)} systems. A missing record means we don’t know if the system has funding.`;
    $("records").replaceChildren(...records().map((record) => {
      const card = element("article", undefined, "record");
      card.id = "record-" + record.systemId;
      card.dataset.systemId = record.systemId;
      card.dataset.stage = record.stage;
      const system = byId.get(record.systemId);
      const stage = fundingLabels[record.stage];
      const action = model.stageInfo[record.stage][1];
      const ref = element("p", system.id + " · " + system.county + " County" +
        (local.has(system.id) ? " · Local record" : ""), "id");
      card.append(element("h3", system.name), ref, element("p", stage, "stage"), element("p", record.scope, "scope"));
      const details = element("details", undefined, "record-sources");
      details.append(element("summary", "Read sources and details"), element("p", record.note), element("p", action, "action"));
      const sources = element("ul");
      for (const source of record.sources) {
        const item = element("li");
        item.append(sourceLink(source));
        sources.append(item);
      }
      details.append(sources);
      card.append(details);
      if (record.stage === "construction") {
        const label = element("label");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.dataset.track = system.id;
        checkbox.setAttribute("aria-label", "Set " + system.name + " aside");
        label.append(checkbox, document.createTextNode("Set aside in this plan"));
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
      target.replaceChildren(element("li", id === "removed" ? "No systems leave the plan." : "No systems join the plan."));
      return;
    }
    target.replaceChildren(...selected.map((system) => {
      const record = recordFor(system.id);
      const stage = record?.stage ?? "unknown";
      const label = system.name;
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
        ? result.excluded.has(system.id) ? "Left out because this project has money" : "Left when EquiFlow picked again"
        : fundingLabels[stage];
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
      ["Original plan", result.original],
      ["Updated plan", result.screened],
      ["Cost-based ranking", result.baseline],
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
    $("after-plan").hidden = tracked === 0;
    $("reset").hidden = tracked === 0;
    const budgetLabel = $("budget").selectedOptions[0].textContent;
    $("review-budget").textContent = `${budgetLabel} example budget · ${format.format(reserve * 100)}% for small systems`;
    const systemCount = tracked === 1 ? "1 water system" : `${format.format(tracked)} water systems`;
    $("result-status").textContent = tracked
      ? `EquiFlow used the same ${budgetLabel} budget and left out ${systemCount} before picking again.`
      : "Try leaving East Orosi out to see how the same budget could be used.";
    $("changes").hidden = tracked === 0;
    $("added-count").textContent = format.format(result.added.length);
    $("removed-count").textContent = format.format(result.removed.length);
    const exampleIncluded = result.excluded.has(exampleId);
    $("example-card").classList.toggle("is-set-aside", exampleIncluded);
    $("example-state").textContent = exampleIncluded ? "Left out of this example" : "Construction funded";
    $("east").textContent = exampleIncluded ? "Put East Orosi back" : "See the plan without East Orosi";
    if (!tracked) showChangeList("added");
    list("added", result.added);
    list("removed", result.removed, "removed");
    list("shortlist-items", result.screened);
  }

  function showChangeList(active) {
    for (const view of ["added", "removed"]) {
      const selected = view === active;
      $("show-" + view).setAttribute("aria-pressed", String(selected));
      $(view + "-panel").hidden = !selected;
    }
  }

  function showOutcome() {
    showChangeList("added");
    const heading = $("result-title");
    heading.focus({preventScroll: true});
    const top = heading.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight - 170) heading.scrollIntoView({block: "start"});
  }

  $("show-added").addEventListener("click", () => showChangeList("added"));
  $("show-removed").addEventListener("click", () => showChangeList("removed"));
  $("east").addEventListener("click", () => {
    const added = !tracking.delete(exampleId);
    if (added) tracking.add(exampleId);
    renderResults();
    if (added) showOutcome();
  });
  $("all").addEventListener("click", () => {
    for (const record of dataset.records) {
      if (record.stage === "construction") tracking.add(record.systemId);
    }
    renderResults();
    showOutcome();
  });
  $("reset").addEventListener("click", () => {
    tracking.clear();
    renderResults();
    $("east").focus();
  });
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
