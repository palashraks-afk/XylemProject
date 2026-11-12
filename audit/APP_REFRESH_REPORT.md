# Local app refresh completion

Ready within the reviewed local scope. The forecast, dependent plans, summary and 200-scenario stress tests are rebuilt. README, GRADING, Method/forecast text, result tables, datasets, portability and reproduction instructions now match these outputs. The original app bytes remain in `app-before/`.

## Checkout and source preservation

- Base: `946881dd3f8ad1635598d51401b3e2a2246170ca` from `main`; isolated branch `preview/refreshed-forecast`.
- Local checkout: `C:\Users\sai71\.codex\visualizations\2026\11\12\01a1cd94-2f3a-7a32-a87e-686964d3f464\XylemPreview`.
- Local preview: http://127.0.0.1:8876 (loopback only).
- No applicable nonempty repository `AGENTS.md` was found. The full handoff was read before implementation.
- Both legacy checkouts retain their statuses, tracked diffs and untracked hashes. The validation checkout remains clean at the requested commit. `335` raw input hashes match both that checkout and the refreshed diagnostic record. See `preview-preservation.json` and `input-copy.json`.
- The local review completed without redownload, push, PR, deployment or publication. The user subsequently authorized committing and pushing this work to GitHub. Pages remains manual-only; PR creation, deployment and other publication still require separate authorization.

## Integration decisions

The shared `planner_probabilities` path, full-population normalization, frozen training-only calibration and stale-artifact rejection remain intact. Selection and calibration were rebuilt after the hash-bound export code changed. The selected method and numerical coefficients match the audited map. No diagnostic outcomes selected a correction or method.

The current export refits base models on both assessment transitions: 5,266 system-years / 129 snapshot positives, normalized over 2,574 eligible current systems. The calibration map remains frozen from 2024→2025; transfer to this refit is unvalidated. One current At-Risk system (`CA4901671`) lacks a model forecast and now uses the training At-Risk snapshot rate, 6.45695364%, instead of a diagnostic outcome rate.

Python plans previously used hidden precision while exported equity components and estimates were rounded. Both now receive the same full-precision optimizer inputs. A pending control change is flushed before CSV creation. `seal_snapshot.py` checks forecast lineage and creates a data manifest; the browser checks loaded SHA-256 values and rejects mixed files. CSV metadata records that same snapshot ID and limitations. Fixed-share exports report the chosen fixed weight rather than a forecast horizon weight. Stored stress stability is suppressed for reserve, route or cost-multiplier alternatives.

## Allocation changes

The inspectable comparison is [allocation-comparison/README.md](allocation-comparison/README.md), with `summary.csv`, full selected-ID sets in `plans.json`, named membership changes and hashes. It covers 55 old/new plans: five budgets and 11 existing control settings. Old plans are recomputed from old exported browser values; the old Python summary remains archived separately. The comparison combines the corrected forecast, fallback and precision repair; it does not isolate their causal contributions.

Default $500M: 90→97 systems, 539,915→476,663 modeled people, $488.417M→$487.919M costs; 12 added and 5 removed, Jaccard 83.3%. Default $1B: 171→196 systems, 1,084,241→941,150 modeled people. More selected systems can accompany lower unweighted reach under the refreshed weighted objective. These are modeled allocations, not measured intervention benefits or a guaranteed effectiveness gain. Per-system stored selection frequencies retain two-decimal snapshot precision; they describe sensitivity to the saved 200 scenarios, not outcome probabilities.

## Diagnostic evidence and limits

Archived primary: 2,633 systems / 61 positives overall, planner AUC 0.831; 586 / 32 At-Risk, AUC 0.764. Mean estimates 2.50% / 6.54%, observed 2.32% / 5.46%. The exact original November comparison remains separate: 582 / 50 At-Risk, AUC 0.756→0.739, paired 95% difference interval −0.053 to +0.017, mean corrected estimate 6.58% versus 8.59% observed. Rerunning the diagnostic calculation preserved the calibrated predictions; raw member scores can differ by floating-point summation order below 1e-15.

Previously examined 2025→2026 outcomes are diagnostic, not an untouched test. Annual failure probabilities remain unvalidated because historical availability and outcome dates are unresolved. Complete historical failure membership/episodes and original publication vintages are unavailable. Multi-year `1-(1-p)^h` assumes constant annual risk and is unvalidated. Brier improves in recorded comparisons; log loss does not always improve. Costs remain modeled, routes approximate and implementation California-only. Inherited self-grades are not quality evidence.

## Verification

- `116 passed in 9.55s` (pre-refresh audit: 108 passed). Added checks cover exact exported forecast precision and training fallback, default-plan reproduction, preserved old bytes, 55-plan reconciliation, 110-case Python/browser parity and rejection of mixed artifacts. The source-drop expectation was updated from legacy mutable-source coverage to the exact nine historical-policy sources; no performance threshold was weakened.
- JavaScript syntax passed for `app.js`, `optimizer.js` and `map3d.js`; `git diff --check` passed.
- Browser displayed all five default budget totals and the primary archived/November diagnostic distinctions. Default $500M CSV: 97 systems / 476,663 people / $487,919,470; combined equity 2 + reserve 30% + routing: 114 / 394,101 / $485,850,493. Both CSVs match exact IDs, populations, effective costs and full-precision weights. The combined CSV has no incompatible stored stability values. No console errors were observed in the final sample.
- Screenshot and browser evidence are in `browser/`. Desktop checks only; no mobile test or user study is claimed.

## Hashes and reproduction

Snapshot ID: `806032f64da14561b81c55e72179ec22f299774fa97b9b5f08c4742909f9c0bd`.

| File | SHA-256 |
|---|---|
| `app/data/forecast.json` | `ce5f62defd5ed7389b692e2dd22be25476a76c932efb618f802b5d044c3d6a13` |
| `app/data/systems.json` | `e919b4c1be007506111bb93e5a282c84517ffbfef1dad9d940f430b483514562` |
| `app/data/summary.json` | `cc8d23b9ac0e579b6264f7fbfff9a54dfd9217fee7321b15dbee0adecbc73cc1` |
| `data/model_selection.json` | `f34dbbf8d7b7608378029f79ed3202134d1e16027d3e2cd30495a73e582e3b93` |
| `data/planner_calibration.json` | `5a7f64cd965d50a744f0eced694c25ff531cc07d75c6137a6c2c540c72df8aec` |
| `data/planner_evaluation.json` | `5a778e1d7e24aa8f8ed2535badf50cd045a8202212c0e19655e3a67e8098127c` |
| `audit/app-before/data/forecast.json` | `63daac60aff40d4fa4ebb091090d31360f222b470c42b625d6079e364286a0b1` |
| `audit/allocation-comparison/summary.csv` | `37948362ad520caec6be7569127fca3bcd89344d38d66a17f9fff8328cc051c1` |

The tracked and unignored delivery-file manifest is `preview-sha256.json`; raw source hashes and versions are in `../data/planner_evaluation.json`, with environment details in `runtime.json`, `requirements-lock.txt` and `environment-full.txt`. The app manifest is `../app/data/snapshot.json`.

Run from the isolated checkout, using preserved input bytes:

```powershell
$env:OMP_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
$python = 'C:\Users\sai71\XylemEvaluation\.venv\Scripts\python.exe'
& $python -X utf8 pipeline/model_selection.py
& $python -X utf8 pipeline/calibrate_planner.py
& $python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
& $python -X utf8 pipeline/ml.py
& $python -X utf8 pipeline/build.py
& $python -X utf8 pipeline/seal_snapshot.py
& $python -X utf8 pipeline/compare_allocations.py
& $python -m pytest tests -q --basetemp audit/pytest-reproduction
node tests/snapshot_parity.js
node --check app/app.js
& $python -m http.server 8876 --bind 127.0.0.1 --directory app
```

`reproduce-preview.ps1` runs the rebuild and checks without fetching sources. Stop an existing preview server before binding the same port. The captured browser CSVs and screenshot document this reviewed snapshot; refresh them after a changed snapshot before rerunning `pipeline/report_app_refresh.py`. Source/model/scoring changes require rebuilding the affected artifacts rather than editing recorded hashes to suppress errors. Numerical dependency and preserved input availability are prerequisites; do not replace unavailable sources with newer downloads.
