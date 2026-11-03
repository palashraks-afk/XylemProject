# Xylem · California SAFER Planning Lab

An interactive planning tool grounded in California's SAFER drinking-water-system snapshot. Start with the map, adjust a budget and policy priorities, inspect each system's inputs, and see the trade-offs.

## Run
```text
pip install -r requirements.txt
python pipeline/build.py
python -m pytest tests -q
node tests/model.js
python -m http.server 8765 --directory app
```
Open http://localhost:8765. Node.js is required for the cross-language tests.
The committed outputs can be served without rebuilding. Refresh sources explicitly with `python pipeline/fetch_data.py`; this changes the analysis snapshot. Regenerate boundaries with `python pipeline/fetch_boundaries.py` after changing eligible systems.

## Play with the model
- Set a statewide budget, equity priority, At-Risk priority relative to Failing, a small-system preference, and a cost multiplier.
- The optimizer maximizes population served × status factor × (1 + equity priority × equity index) × (1 + small-system priority for systems with ≤500 connections).
- The equity index is the mean of available economic-disadvantage, CalEnviroScreen percentile, affordability, and poverty-percentile components. Full-precision indices are shared by Python and the browser; missing components remain visible.
- Every project cost rounds upward to $100,000 for budget feasibility. The interface shows estimated spend and the rounded allowance. This is exact optimization of the discretized problem, not the original continuous-cost problem.
- The status-first comparison selects Failing before At-Risk systems, largest population first. It uses the same rounded costs. It is a simple reference rule, not the state's actual allocation process.
- Small-system priority is a soft preference. It replaces the old reserve and does not guarantee a spending share.
- The map includes all source systems as context, with a funding model limited to Failing and At-Risk systems. County selection filters the map and table while the allocation remains statewide.
- Click systems to inspect model inputs, copy scenario links, or export the statewide selected plan as CSV.
- Run 40 reproducible cost scenarios for the current controls. These hold all priorities fixed and sample independent lognormal errors (assumed 90% cost range 0.5–2×). Selection frequencies are scenario sensitivity, not real-world success probabilities. Changing any control invalidates the prior result.

## What the model can support
Comparing transparent policy and cost assumptions. It is not a trained health-outcome predictor, a project cost quote, or a validated funding decision.

Baseline costs multiply the 2024 state average per-connection costs by each system's connections, then scale the 2026 target list to the 2024 statewide total. This cross-year calibration remains an assumption. County median absolute error was about 41% in the initial model; system-level accuracy is unverified. Size-bin boundaries cause abrupt cost changes. Funded population is potential reach, not measured health improvement or guaranteed unique beneficiaries.

Readiness, alternatives, completion probability, already-committed funding, recurring operating costs, and consolidation feasibility are not modeled. Historical funding AUC is descriptive and does not validate treatment effects or recommendations. Other SAFER statuses are outside the allocation model, not assumed to have no need.

## Files
- `pipeline/`: source ingestion, full-precision equity, baseline cost estimates, reference scoring and optimizer, data exports.
- `app/`: static map tool, shared browser model, background calculation worker, committed data.
- `tests/`: brute-force solver comparisons, Python/JavaScript parity, full pipeline/browser result parity, source/output consistency.
- `MODEL_PLAN.md`: completed first steps and remaining model-validation work.
- `DataSets.md`: original sources.


Optional browser checks: install Playwright and its Chromium browser, start the local server above, then run `node tests/browser.cjs`. Set `PLAYWRIGHT_BROWSER_CHANNEL=msedge` to use installed Edge.
