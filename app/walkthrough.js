(function () {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const onPlanner = Boolean($("#scenario-controls"));
  const start = $("#start-walkthrough");
  const firstReviewStep = 4;
  const steps = [
    {
      title: "Pick a budget",
      description: "EquiFlow suggests where new money could help. Try a budget to make a practice plan.",
      area: "#scenario-controls",
      action: "Try a different budget",
      run: changeBudget,
    },
    {
      title: "Compare two plans",
      description: "Save one plan, then change the budget to see the difference.",
      area: ".results",
      action: "Compare with another budget",
      run: compareBudget,
    },
    {
      title: "Find a water system",
      description: "A water system brings drinking water to people. Find East Orosi to see whether it’s in the plan.",
      area: ".map-section",
      action: "Find East Orosi",
      run: findExample,
    },
    {
      title: "Check what already has money",
      description: "A funding record shows which work has money approved. Open East Orosi’s record to see what it covers.",
      area: "#example-card",
      action: "Open the funding record",
      run: openFundingRecord,
    },
    {
      title: "Try the same budget again",
      description: "Leave East Orosi out and see who EquiFlow picks with the same budget.",
      area: "#example-card",
      action: "See the plan without East Orosi",
      run: reviewExample,
    },
  ];

  const panel = document.createElement("section");
  panel.className = "walkthrough";
  panel.setAttribute("aria-labelledby", "walkthrough-title");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="walkthrough-header">
      <p class="walkthrough-progress"></p>
      <button type="button" class="walkthrough-close" aria-label="End walkthrough">×</button>
    </div>
    <div class="walkthrough-track" aria-hidden="true"></div>
    <h2 id="walkthrough-title" tabindex="-1"></h2>
    <p class="walkthrough-description"></p>
    <p class="walkthrough-feedback" role="status" hidden></p>
    <div class="walkthrough-actions">
      <button type="button" class="walkthrough-try"></button>
      <button type="button" class="walkthrough-back">Back</button>
      <button type="button" class="walkthrough-next">Next</button>
    </div>`;
  document.querySelector("main").before(panel);

  const title = panel.querySelector("h2");
  const progress = panel.querySelector(".walkthrough-progress");
  const description = panel.querySelector(".walkthrough-description");
  const feedback = panel.querySelector(".walkthrough-feedback");
  const tryButton = panel.querySelector(".walkthrough-try");
  const back = panel.querySelector(".walkthrough-back");
  const next = panel.querySelector(".walkthrough-next");

  let step = 0;
  let highlight = null;
  let updateObserver = null;
  const ready = () => onPlanner ? Boolean($("#main-kpis .kpi")) : !$("#review").hidden;

  function writeStep(number) {
    const url = new URL(location.href);
    if (number) url.searchParams.set("walkthrough", String(number));
    else url.searchParams.delete("walkthrough");
    history.replaceState(history.state, "", url);
  }

  function reveal(selector) {
    highlight?.removeAttribute("data-walkthrough-highlight");
    highlight = $(selector);
    if (!highlight) return;
    highlight.setAttribute("data-walkthrough-highlight", "");
    const bounds = highlight.getBoundingClientRect();
    const top = matchMedia("(max-width: 780px)").matches ? panel.getBoundingClientRect().bottom + 12 : 8;
    if (bounds.top < top || bounds.top + Math.min(bounds.height, 120) > innerHeight) {
      highlight.scrollIntoView({block: "start"});
    }
  }

  function showStep(number) {
    updateObserver?.disconnect();
    const details = steps[number - 1];
    step = number;
    writeStep(step);
    panel.hidden = false;
    panel.style.setProperty("--walkthrough-progress", `${step / steps.length * 100}%`);
    progress.textContent = `Walkthrough · Step ${step} of ${steps.length}`;
    title.textContent = details.title;
    description.textContent = details.description;
    feedback.textContent = "";
    feedback.hidden = true;
    tryButton.textContent = details.action;
    tryButton.disabled = !ready();
    back.hidden = step === 1;
    next.disabled = !ready();
    next.textContent = step === firstReviewStep - 1 ? "Go to funding review" : step === steps.length ? "Finish" : "Next";
    title.focus({preventScroll: true});
    if (ready()) reveal(details.area);
  }

  function finish() {
    updateObserver?.disconnect();
    highlight?.removeAttribute("data-walkthrough-highlight");
    highlight = null;
    step = 0;
    panel.hidden = true;
    writeStep(0);
    const end = ready() ? $(onPlanner ? "#results-title" : "#result-title") : start;
    end.focus({preventScroll: true});
    if (end.getBoundingClientRect().top < 0 || end.getBoundingClientRect().bottom > innerHeight) {
      end.scrollIntoView({block: "nearest"});
    }
  }

  function showFeedback(message, area) {
    feedback.hidden = false;
    feedback.textContent = message;
    reveal(area);
  }

  function chooseDifferentBudget(onUpdate) {
    const nextBudget = $('[data-preset="250"]').getAttribute("aria-pressed") === "true" ? 500 : 250;
    updateObserver?.disconnect();
    updateObserver = new MutationObserver(() => {
      updateObserver.disconnect();
      tryButton.disabled = false;
      next.disabled = false;
      onUpdate();
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        next.focus({preventScroll: true});
      }
    });
    updateObserver.observe($("#main-kpis"), {childList: true});
    tryButton.disabled = true;
    next.disabled = true;
    $(`[data-preset="${nextBudget}"]`).click();
  }

  function changeBudget() {
    chooseDifferentBudget(() =>
      showFeedback(`At ${$("#budgetLabel").textContent}, the plan could reach ${$("#main-kpis .hero .v").textContent} people.`, ".results")
    );
  }

  function compareBudget() {
    const compare = $("#compare-pin");
    if (compare.getAttribute("aria-expanded") !== "true") compare.click();
    chooseDifferentBudget(() =>
      showFeedback("The comparison shows how the number of people, systems, and estimated cost changed.", "#scenario-compare")
    );
  }

  function findExample() {
    $("#find-example").click();
    showFeedback("Look for “In this plan” and “Estimated cost” in the system details.", "#detail");
  }

  function openFundingRecord() {
    $("#example-source").open = true;
    showFeedback("The record is for the connection project. The links show how we know.", "#example-source");
  }

  function reviewExample() {
    if (!$("#example-card").classList.contains("is-set-aside")) $("#east").click();
    const added = $("#added-count").textContent;
    const removed = $("#removed-count").textContent;
    showFeedback(`${added} join and ${removed} leave. Choose a group to see the names.`, "#review-outcome");
  }

  panel.querySelector(".walkthrough-close").addEventListener("click", finish);
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    }
  });
  tryButton.addEventListener("click", () => steps[step - 1].run());
  back.addEventListener("click", () => {
    if (step !== firstReviewStep) {
      showStep(step - 1);
      return;
    }
    const planner = new URL($("#planner-link").href);
    planner.searchParams.set("walkthrough", String(firstReviewStep - 1));
    location.assign(planner);
  });
  next.addEventListener("click", () => {
    if (step === steps.length) {
      finish();
    } else if (step === firstReviewStep - 1) {
      $("#find-example").click();
      const review = new URL($("#detail-review").href);
      review.searchParams.set("walkthrough", String(firstReviewStep));
      location.assign(review);
    } else {
      showStep(step + 1);
    }
  });

  if (onPlanner) {
    start.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showStep(1);
    });
    document.addEventListener("click", event => {
      const link = event.target.closest("#detail-review");
      if (step !== firstReviewStep - 1 || !link) return;
      const review = new URL(link.href);
      review.searchParams.set("walkthrough", String(firstReviewStep));
      link.href = review;
    });
  }

  const initialStep = Number(new URL(location.href).searchParams.get("walkthrough"));
  if (Number.isInteger(initialStep) && (onPlanner ? initialStep >= 1 && initialStep < firstReviewStep : initialStep >= firstReviewStep && initialStep <= steps.length)) {
    showStep(initialStep);
  }

  if (!ready()) {
    const loading = new MutationObserver(() => {
      if (!ready()) return;
      loading.disconnect();
      if (step) {
        tryButton.disabled = false;
        next.disabled = false;
        reveal(steps[step - 1].area);
      }
    });
    loading.observe(onPlanner ? $("#main-kpis") : $("#review"), onPlanner ? {childList: true} : {attributes: true, attributeFilter: ["hidden"]});
  }
})();
