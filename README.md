# Xylem

**A California water-funding planning prototype. Choose a budget and equity rules to explore which Failing and At-Risk systems an allocation model selects.** Reach and costs are modeled; selected systems' populations are not measured intervention benefit.

## Release candidate review

Start with [SETUP.md](SETUP.md) for the verified static preview and independent environment procedure, [release review](audit/RELEASE_REVIEW.md) for QA evidence and blockers, and [demonstration](audit/DEMO_REVIEW.md) for the walkthrough and practitioner checklist. The user subsequently authorized committing and pushing this reviewed candidate; see [push handoff](audit/PUSH_HANDOFF.md). Deployment remains manual and requires separate authorization.

## Local preview and reproduction

The local app data is refreshed under `historical-event-time-v2`. The old app bytes are preserved in `audit/app-before/`; [allocation comparison](audit/allocation-comparison/README.md) retains 55 old/new plans, complete selected-ID sets, membership changes, costs and scenario stability. [Refresh report](audit/APP_REFRESH_REPORT.md) records hashes, environment, checks and the local preview.

Use the preserved raw snapshot, not fresh downloads. The large risk workbooks and raw extras are not all in Git. Copy missing files from the handoff's validation checkout, verify SHA-256 against `data/planner_evaluation.json`, and reject different existing bytes. `audit/input-copy.json` records this checkout's source. Fetch scripts acquire a new source version; they are not controlled reproduction commands.

Use Python and dependencies recorded in `audit/runtime.json` and `audit/requirements-lock.txt` (the supplied environment is `C:\Users\sai71\XylemEvaluation\.venv\Scripts\python.exe`). Node is required for optimizer parity. Limit OMP/OpenBLAS threads to 2 as in the report. Run from the repository root:

```text
python -X utf8 pipeline/model_selection.py
python -X utf8 pipeline/calibrate_planner.py
python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
python -X utf8 pipeline/ml.py
python -X utf8 pipeline/build.py
python -X utf8 pipeline/seal_snapshot.py
python -X utf8 pipeline/compare_allocations.py
python -m pytest tests -q --basetemp audit/pytest-preview
node --check app/app.js
python -m http.server 8876 --bind 127.0.0.1 --directory app
```

Open [the local preview](http://127.0.0.1:8876). Saved boundaries, routes, GIS and infrastructure layers are retained; they have no forecast dependency. Rebuilding these layers is optional and can acquire mutable inputs, so omit fetch/routing/GIS steps for this controlled forecast comparison. `seal_snapshot.py` binds all app data files; the browser checks loaded bytes. CSVs record the same snapshot ID, selected systems, effective costs, snapshot estimates and allocation weights. Changing source/scoring code requires rebuilding affected hash-bound artifacts.

GitHub Pages is manual-only (`workflow_dispatch`). After local review, the user separately authorized committing and pushing these changes to GitHub. PR creation, Pages deployment and other publication still require separate authorization.

## How the planner works

- **Objective:** sum of population × status weight × (1 + equity weight × equity index). Failing systems count in full. At-Risk systems use exploratory snapshot weights or a manual fixed share. The optimizer maximizes this weighted objective, not unweighted reach. Without a reserve, dynamic programming is exact after costs round up to $250,000 units. A reserve uses sequential small-system and remaining-budget optimizations; this is a priority rule, not a globally optimal reserve constraint. Python and browser implementations are checked for parity.
- **Forecast:** five selected model families feed `planner_probabilities`. Member predictions are normalized over the full scoring population before outcome or At-Risk filtering, then passed through the frozen training-only map. Rank scores are distinct from these snapshot estimates. Current export refits base models on both assessment transitions; transfer of the frozen map to that refit is unvalidated. Missing At-Risk forecasts use the 2024→2025 training status rate, never the diagnostic outcome rate.
- **Horizon:** `1-(1-p)^h` is an exploratory funding weight assuming constant annual risk. Annual failure probabilities and the multi-year conversion remain unvalidated. The horizon does not represent measured prevention benefit.
- **Costs and equity:** modeled costs use 2024 Cost Assessment per-connection averages scaled to the $5.386B state total. Equity averages available DAC, environmental burden, affordability, poverty, social vulnerability and drinking-water indicators. Full-precision inputs are shared by Python and browser plans.
- **Routing and map:** saved service areas, counties, approximate consolidation routes and 3D context layers. Viable cheaper routes can replace average costs. Routes are straight-line ×1.3 approximations; receiver capacity and regional construction costs are unresolved.
- **Stability:** 200 fixed-seed scenarios vary costs, equity 0–2 and horizon 1–10. Selection frequency measures sensitivity to those assumptions, not successful remediation. Stored scenarios use no reserve, routes off and a cost multiplier of 1; incompatible controls suppress stored stability. Interactive cost scenarios use current controls.

## Modeled reach at default settings

Saved SAFER registry: 2026-11-02; 1,062 Failing or At-Risk systems serving 1,931,200 people. Defaults: equity 1, five-year exploratory horizon, no reserve, routes off, cost multiplier 1.

| Budget | Optimizer reaches | Status-first reaches | Ratio |
|---|---:|---:|---:|
| $100M | 171,738 | 168,274 | 1.02× |
| $250M | 310,205 | 292,238 | 1.06× |
| $500M | 476,663 | 358,300 | 1.33× |
| $1000M | 941,150 | 406,664 | 2.31× |
| $2000M | 1,600,548 | 944,874 | 1.69× |

Status-first funds Failing systems before At-Risk, largest first. It is a simple comparator, not the state's actual allocation process. Ratios describe modeled unweighted reach under different objectives and modeled costs, not actual effectiveness. Exact system counts, costs, membership changes and old/new scenario frequencies are in the comparison files.

## Diagnostic evidence

Training uses 2024→2025 assessment outcomes. The already-examined 2025→2026 outcomes are diagnostic, not an untouched temporal test. The primary outcome uses the archived 2026 assessment; the original November-2026 comparison uses different outcomes.

| Primary archived cohort | Systems / positives | Planner AUC (95% interval) | Mean estimate / observed | Brier / log loss |
|---|---:|---:|---:|---:|
| All non-Failing | 2,633 / 61 | 0.831 (0.768–0.886) | 2.50% / 2.32% | 0.0201 / 0.0891 |
| At-Risk | 586 / 32 | 0.764 (0.678–0.848) | 6.54% / 5.46% | 0.0471 / 0.1861 |

For the **exact original November-2026 At-Risk cohort (582 / 50)**, AUC changes from 0.756 to 0.739; paired 95% difference interval −0.053 to +0.017. The corrected mean is 6.58% versus 8.59% observed. These comparisons cannot be combined with the archived primary result.

Calibration selects a positive-slope ridge logistic map using nested 5 outer / 4 inner folds within 2024→2025 (68 events). No diagnostic outcomes select or fit it; positive slope preserves corrected ranking. Configuration selection is not nested. Brier improves in the recorded comparisons; log loss does not improve in every comparison. Neither mean agreement nor one transition establishes prospective calibration.

The separately reported legacy rank ensemble has AUC 0.832; status-only baseline AUC 0.679. These are ranking diagnostics, not the probability ensemble used in funding weights. The full comparison and reliability bins are in [PLANNER_EVALUATION.md](PLANNER_EVALUATION.md) and `data/planner_evaluation.json`. Source/code hashes, dependency versions and all individual predictions remain inspectable.

## Limits

- Historical source availability and annual outcome dates remain unresolved. Assessment reference dates differ from July cutoffs; the supplied 2024 risk workbook was modified in June 2025. Complete failure membership/episode histories and original publication vintages are unavailable. Current failure-start dates cannot reconstruct prior or recovered episodes.
- Of 2,647 scored systems, 14 unknown/not-assessed outcomes are excluded only from metrics. The 2026 `Other` category remains a known non-Failing outcome. Eighteen evaluated systems lack stage-1 predictions; missing-value handling and complete-case sensitivity are documented. No difficult cases are removed to improve scores.
- Current registry/location history can introduce survivorship and location bias. Historical sizes use prior-year archives with no current-size fallback; undated/mutable model inputs are excluded under [the historical policy](pipeline/HISTORICAL_FEATURES.md). Downloaded sources are not all forecast features.
- Costs are modeled, routes approximate, population overlap is not resolved, and readiness, willingness to consolidate, operations costs, domestic wells and state small systems are outside the model. California is the only implemented geography. No user study or measured intervention impact is established.

See [DataSets.md](DataSets.md), [PORTABILITY.md](PORTABILITY.md), [NOVELTY.md](NOVELTY.md) and [GRADING.md](GRADING.md). Inherited self-grades are subjective historical opinions, not verified quality measures.
