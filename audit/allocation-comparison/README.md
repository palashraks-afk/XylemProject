# Local allocation comparison

Same saved California population and raw input bytes; corrected historical features, training-only reselection/calibration, training-rate fallback and full-precision browser inputs. No causal intervention benefit is measured.

Old plans are recomputed from the preserved exported browser values; the original Python summary is retained in `../app-before/data/summary.json`. Its hidden pre-export precision can produce different plans. New Python summaries and browser inputs use identical precision.

Defaults: equity 1, five-year exploratory horizon, no small-system reserve, routes off, cost multiplier 1. Dollar costs are modeled; the constant-annual-risk horizon conversion is unvalidated.

| Budget | Systems old→new | Modeled people old→new | Cost $M old→new | Added / removed | Jaccard | Stress frequency old→new |
|---|---:|---:|---:|---:|---:|---:|
| $100M | 20→20 | 171,738→171,738 | 97.768→97.768 | 0 / 0 | 100.0% | 83.2%→84.0% |
| $250M | 51→51 | 309,772→310,205 | 243.337→243.243 | 2 / 2 | 92.5% | 81.8%→84.5% |
| $500M | 90→97 | 539,915→476,663 | 488.417→487.919 | 12 / 5 | 83.3% | 82.8%→83.9% |
| $1000M | 171→196 | 1,084,241→941,150 | 979.013→976.593 | 41 / 16 | 73.1% | 85.4%→86.2% |
| $2000M | 409→409 | 1,685,510→1,600,548 | 1950.433→1950.138 | 48 / 48 | 79.0% | 84.4%→86.1% |

## Definitions and inspection

- Systems: unique selected IDs. Modeled people: sum of their saved populations, with no adjustment for population overlap or actual remediation outcomes.
- Cost: sum of effective modeled system costs (including cheaper viable route costs where enabled), before conservative $250,000 rounding used by the optimizer.
- Membership stability: Jaccard = intersection / union; retention = intersection / old selected. Added/removed lists and both complete selected-ID sets are in `plans.json`; names and populations of changes are in `membership-changes.csv`.
- Stress frequency: mean saved selection frequency among the selected systems, over 200 fixed-seed scenarios that vary costs, equity 0–2 and horizon 1–10. It is not outcome probability or repeatability at the displayed controls. Stored no-reserve/no-route scenarios are not reported for reserve, routing, fixed-share or cost-multiplier alternatives.
- `summary.csv` contains all 55 plans: five budgets across defaults, equity 0 and 2, reserve 30%, routing, equity+reserve+routing, horizons 1 and 10, fixed share 50%, and costs 0.5× and 2×. These settings were chosen to cover existing controls, without consulting diagnostic outcomes.
- All inputs and outputs are SHA-256 bound in `sha256.json`. The old snapshot is preserved byte-for-byte under `../app-before/`.

Reproduce: `python pipeline/compare_allocations.py`.
