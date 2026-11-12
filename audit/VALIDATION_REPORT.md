> Archived validation-stage report from before app integration. Statements below about unchanged app data describe that earlier stage. The current local refresh, checks and hashes are in [APP_REFRESH_REPORT.md](APP_REFRESH_REPORT.md).

# Xylem validation and probability calibration

**Ready for local diagnostic review; annual probability claims need revision.** Historical feature handling, selection and calibration are rebuilt locally. The available assessment snapshots do not support a clean annual-onset target or a publication-time backtest.

## Revised snapshot results

Training: 2024→2025 assessment transition. Diagnostic evaluation: 2025→2026 assessment transition. The primary outcome now uses the archived 2026 affordability assessment, rather than November 2026 current status.

| Cohort | Systems / onsets | AUC (95% interval) | Highest 10% capture | Mean probability / observed | Brier / log loss |
|---|---:|---:|---:|---:|---:|
| all_non_failing | 2633 / 61 | 0.831 (0.768–0.886) | 32.0 / 61 | 2.50% / 2.32% | 0.0201 / 0.0891 |
| at_risk | 586 / 32 | 0.764 (0.678–0.848) | 14.0 / 32 | 6.54% / 5.46% | 0.0471 / 0.1861 |

Normalization retains all 2647 eligible baseline systems, including unknown outcomes; subgroup metrics do not renormalize. Reliability bins, baseline comparisons and 1,000 paired stratified bootstrap replicates are in `PLANNER_EVALUATION.md` and the evaluation JSON. Intervals condition on fitted models and prevalence; they exclude retraining, time drift and spatial dependence.

## Comparable original population

| Cohort | Systems / onsets | Original AUC → repaired AUC | Original mean → repaired calibrated mean | Paired AUC change (95% interval) |
|---|---:|---:|---:|---:|
| all_non_failing | 2616 / 120 | 0.776 → 0.769 | 2.61% → 2.52% | -0.007 (-0.027–+0.013) |
| at_risk | 582 / 50 | 0.756 → 0.739 | 4.88% → 6.58% | -0.017 (-0.053–+0.017) |

All 2616 original system IDs and their November 2026 outcomes are retained for this paired comparison. 335 original raw-file hashes were checked; 0 changed. The performance change combines corrected features and training-only model reselection. It does not isolate the effect of each removed source. The different primary population/outcome counts reflect assessment-vintage coverage and changed statuses, not missing rows silently removed by normalization.

## What changed

- Removed current mutable stage-1 attributes, facilities, all-time lead/copper maxima, demographics, shortage/rate/basin/infrastructure snapshots and current-size substitutes. Historical population/connection counts come only from prior-year affordability archives; missing history stays unknown.
- School-lead inputs require both collection and source load dates before cutoff. Removed eventual wildfire acreage, withheld incomplete early five-year fire windows, corrected January weather windows and past-only climatology, and represented NOAA missing sentinels as unknown.
- Rebuilt stage-1 selection on 2021–2023 forward validation, its probability map on those validation predictions, and stage-2 selection on 2024→2025 cross-validation. Historical 2026 outcomes now come from the 2026 assessment archive.
- Bound feature caches, in-memory forecasts, selection and calibration to source/code hashes and dependency versions. Old or mismatched artifacts fail closed with rebuild instructions. Preprocessing fits on training data.

## Probability calibration decision

Selected **logit_ridge** using 2633 training rows and 68 events. Candidates were identity, a one-parameter intercept adjustment, and a positive-slope two-parameter logistic map with fixed ridge shrinkage toward slope one. Nested 5 outer / 4 inner folds exclude validation rows from model and calibration fitting; the lowest mean outer log loss wins, preferring the simpler method within 0.001. Candidate losses were identity: 0.09112, intercept: 0.09115, logit_ridge: 0.08608.

Final map: `logit(p_calibrated) = 2.127741 + 1.744147 * logit(p_base)`; base probabilities are clipped to [0.000001, 0.999999] for the logit. It fits outer out-of-fold predictions only. No held-out prevalence correction, test-year method selection or At-Risk-specific fitting was performed. The same `planner_probabilities` path applies the map in evaluation and forecast export, after full-population normalization. The positive-slope mapping preserves rank comparisons and existing ties. The JSON retains uncalibrated probability metrics alongside calibrated metrics.

This uses one training transition and few events. Configuration selection is not nested inside calibration folds, so training validation evidence can be optimistic. Within-year calibration cannot establish transfer under changing prevalence, follow-up duration or final-model refitting. The stage-1 isotonic map has many more violation events, but shares validation folds with model selection and is also not nested.

## Material limitations and what remains unverified

| Finding | Severity / confidence | Evidence and consequence |
|---|---|---|
| Annual target and cutoff mismatch | High / established | The 2025 official assessment uses the 2024-12-31 Failing list, queried 2025-03-04, rather than July 2025 membership. The original current-status target runs through November 2026. Assessment-to-assessment probabilities cannot be certified as 12-month onset probabilities. |
| Historical publication vintage | High / established gap | The supplied 2024 risk workbook was modified 2025-06-23. Metadata does not prove changed cells, but original 2024 bytes and publication dates are unverified. Event sources generally have event times rather than first-publication histories. |
| Cohort/location history | Medium / established gap | Current registry/type/deactivation, coordinates and county remain qualified proxies. Historical activation, relocation, reclassification and disappeared-system coverage are unavailable. |
| Selection, repeated development and dependence | High / established | Prior work already examined 2025→2026 outcomes. This is diagnostic evaluation; neither confidence intervals nor training-only calibration restore an untouched test. |
| Five-year probabilities | High / unvalidated | `1-(1-p)^5` assumes constant annual risk. Annual validation would not validate five-year probabilities; the annual target is itself unresolved here. |

Of the original 50 At-Risk snapshot positives, 22 current failure episodes start on/before July 2025 and 5 after July 2026. Current `FAILING_START_DATE` cannot recover prior/recovered episodes, so filtering that column would not create complete annual labels. Needed evidence: original dated risk/affordability releases, complete Failing-list membership and episode histories at aligned cutoffs, historical registries/locations, and first-availability/source revision history. No annual-rate correction has been invented to fill this gap.

Credible within this scope: the saved arithmetic, population-specific snapshot ranking and proper probability scores for these fixed bytes, and comparisons on exact original IDs/outcomes. Not established: prospective leakage-free ranking, calibrated annual failure probabilities, or calibrated five-year risk. Mean predicted-versus-observed differences should be read alongside the horizon mismatch, rather than interpreted purely as probability-model error.

## Local delivery and reproduction

Branch: `validate/historical-calibration`, based on `d9495817cb02aeca3de47d44ec10bbf8e558709f`. Both source checkouts retain their original status and tracked diffs (`audit/source-preservation.json`). No push, PR or publication was performed. Saved app forecast and funding plans were not regenerated.

Run in this isolated checkout using the supplied evaluation environment:

```powershell
$env:OMP_NUM_THREADS = "2"
$env:OPENBLAS_NUM_THREADS = "2"
$python = 'C:\Users\sai71\XylemEvaluation\.venv\Scripts\python.exe'
& $python -X utf8 pipeline/model_selection.py
& $python -X utf8 pipeline/calibrate_planner.py
& $python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
& $python -m pytest tests -q --basetemp audit/pytest-final
& $python -X utf8 pipeline/report_validation.py
```

Use preserved raw inputs, not fresh downloads. SHA-256 hashes, model settings, source metadata and library versions are in `data/planner_evaluation.json`; calibration folds/maps and individual predictions are saved in the accompanying JSON/CSV files. `audit/requirements-lock.txt`, `audit/environment-full.txt` and `audit/runtime.json` record dependencies and Python. The bundled Pillow build may require retaining this environment. Source URLs are in `data/extra_sources.json`, `pipeline/fetch_data.py`, and the evaluation input audit.

Verification results are recorded in `audit/tests-final.log`. Tests check historical cutoffs/load dates, exclusion invariance, missing history, cache/provenance invalidation, OOF label exclusion, monotone calibration, independent probability/AUC/Brier/log-loss reconstruction, and cohort alignment. Legacy app-snapshot tests remain separate from the revised diagnostic result.

References: [State Water Board 2025 Needs Assessment, page 75](https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs/2025needsassessment.pdf); [scikit-learn calibration guidance](https://scikit-learn.org/stable/modules/calibration.html).

## Coverage and calibration qualifications

Of 2647 scored systems, 14 have unknown/not-assessed 2026 outcomes and are excluded only from metrics. The 2026 archive groups known non-Failing/non-At-Risk systems as Other; these are retained as negative outcomes rather than discarded. The original November comparison retains exactly the original 2,616 systems, including all 582 At-Risk systems.

18 evaluated systems lack a stage-1 forecast (five are At-Risk; one of the 18 is an onset). The full model uses its training-fitted missing-value handling; the violation-only baseline fills missing scores with zero, as explicitly recorded. The JSON includes a complete-case sensitivity calculation using fixed predictions without refitting or renormalization.

| Outcome / cohort | Uncalibrated Brier → calibrated | Uncalibrated log loss → calibrated |
|---|---:|---:|
| Assessment / all_non_failing | 0.02067 → 0.02012 | 0.09030 → 0.08908 |
| Assessment / at_risk | 0.04785 → 0.04714 | 0.18605 → 0.18614 |
| Original November / all_non_failing | 0.04150 → 0.04070 | 0.16837 → 0.17685 |
| Original November / at_risk | 0.07438 → 0.07135 | 0.27048 → 0.26675 |

Calibration improves Brier score in these comparisons, but it does not improve every proper score: the primary At-Risk log loss worsens slightly, and the original November overall log loss worsens. The selected method is retained because its selection used training-only validation, not these diagnostic outcomes. Mean agreement alone does not establish calibration, and no claim of universal improvement is supported.

The complete normalization population is saved in `data/planner_scoring_predictions.csv`; the exact original-population comparison is in `data/planner_original_comparison.csv`. Output hashes are recorded in the result JSON. Local forecast explanatory text now calls the results exploratory and states the constant-annual-risk multi-year assumption. App data is unchanged; no full app export was run. JavaScript syntax and Python/browser optimizer parity were checked.
