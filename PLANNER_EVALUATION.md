# Planner forecast evaluation

Train: 2024 to 2025. Test: 2025 to 2026. Full model; model selection rebuilt under historical input policy.

The planner probability ensemble is evaluated separately from the previously reported rank ensemble. Its probability calibration uses training outcomes only; the already-examined 2025-to-2026 transition is diagnostic, not an untouched test.

## All Non Failing

2633 systems; 61 onsets; observed rate 2.32%.

| Model | AUC (95% interval) | Average precision | Top-10% recall | Mean forecast | Brier score | Log loss |
|---|---:|---:|---:|---:|---:|---:|
| planner_ensemble | 0.831 (0.768 to 0.886) | 0.245 | 52.5% | 2.50% | 0.0201 | 0.0891 |
| legacy_rank_ensemble | 0.832 (0.771 to 0.886) | 0.264 | 54.1% | not a failure probability | - | - |
| total_risk_score | 0.703 (0.633 to 0.772) | 0.072 | 28.6% | not a failure probability | - | - |
| status_training_rate | 0.679 (0.612 to 0.745) | 0.043 | 23.5% | 2.55% | 0.0224 | 0.1050 |
| violation_forecast_only | 0.788 (0.725 to 0.849) | 0.247 | 51.3% | not a failure probability | - | - |
| uncalibrated_planner_ensemble | 0.831 (0.768 to 0.886) | 0.245 | 52.5% | 2.59% | 0.0207 | 0.0903 |

Calibration of planner probabilities:

| Probability band | Systems | Mean forecast | Observed onset rate |
|---|---:|---:|---:|
| 0.0% to 1.0% | 1567 | 0.33% | 0.51% |
| 1.0% to 2.5% | 492 | 1.58% | 1.83% |
| 2.5% to 5.0% | 274 | 3.54% | 2.92% |
| 5.0% to 10.0% | 146 | 7.10% | 6.85% |
| 10.0% to 20.0% | 91 | 13.59% | 9.89% |
| 20.0% to 100.0% | 63 | 32.68% | 26.98% |

Paired AUC differences (planner minus comparator):

- legacy_rank_ensemble: -0.001 (95% interval -0.006 to +0.004).
- total_risk_score: +0.128 (95% interval +0.062 to +0.202).
- status_training_rate: +0.153 (95% interval +0.091 to +0.223).
- violation_forecast_only: +0.043 (95% interval -0.006 to +0.091).
- uncalibrated_planner_ensemble: +0.000 (95% interval +0.000 to +0.000).

## At Risk

586 systems; 32 onsets; observed rate 5.46%.

| Model | AUC (95% interval) | Average precision | Top-10% recall | Mean forecast | Brier score | Log loss |
|---|---:|---:|---:|---:|---:|---:|
| planner_ensemble | 0.764 (0.678 to 0.848) | 0.271 | 43.8% | 6.54% | 0.0471 | 0.1861 |
| legacy_rank_ensemble | 0.761 (0.671 to 0.846) | 0.281 | 40.6% | not a failure probability | - | - |
| total_risk_score | 0.561 (0.447 to 0.666) | 0.105 | 18.8% | not a failure probability | - | - |
| status_training_rate | 0.500 (0.500 to 0.500) | 0.055 | 9.9% | 6.46% | 0.0517 | 0.2127 |
| violation_forecast_only | 0.718 (0.617 to 0.813) | 0.236 | 29.7% | not a failure probability | - | - |
| uncalibrated_planner_ensemble | 0.764 (0.678 to 0.848) | 0.271 | 43.8% | 5.22% | 0.0478 | 0.1861 |

Calibration of planner probabilities:

| Probability band | Systems | Mean forecast | Observed onset rate |
|---|---:|---:|---:|
| 0.0% to 1.0% | 130 | 0.56% | 1.54% |
| 1.0% to 2.5% | 115 | 1.63% | 1.74% |
| 2.5% to 5.0% | 126 | 3.73% | 3.97% |
| 5.0% to 10.0% | 100 | 7.21% | 6.00% |
| 10.0% to 20.0% | 69 | 13.72% | 8.70% |
| 20.0% to 100.0% | 46 | 31.20% | 23.91% |

Paired AUC differences (planner minus comparator):

- legacy_rank_ensemble: +0.003 (95% interval -0.009 to +0.018).
- total_risk_score: +0.203 (95% interval +0.075 to +0.339).
- status_training_rate: +0.264 (95% interval +0.178 to +0.348).
- violation_forecast_only: +0.046 (95% interval -0.032 to +0.138).
- uncalibrated_planner_ensemble: +0.000 (95% interval +0.000 to +0.000).

## Interpretation limits

- One annual held-out transition; intervals condition on the fitted models and observed prevalence and do not capture year-to-year drift, model-selection uncertainty or regional dependence.
- Model configurations were already developed with this test year visible. This is a diagnostic re-evaluation of the existing model, not a new untouched test.
- Historical features use event-time-v2: mutable snapshots and undated lead/copper excluded; prior-year archived sizes only, no current-size fallback. Source publication dates and retrospective revisions remain unverified.
- The supplied 2024 risk workbook was modified 2025-06-23, after its nominal cutoff. Year-labelled workbooks are retrospective proxies, not verified original releases. The 2025 assessment uses December 2024 Failing-list status, not July 2025 status. These are snapshot-transition probabilities; annual failure calibration is unverified.
- Probability calibration is selected by nested folds within 2024-to-2025 training data only and frozen before diagnostic evaluation; no 2025-to-2026 outcomes fit or select its map. Normalization still depends on full scoring-cohort covariates. Base configuration selection is not nested.
- Systems missing a next-snapshot outcome are excluded from metrics but retained in the probability-normalization cohort. Attrition may still bias measured performance.
- The five-year conversion 1-(1-p)^5 assumes constant annual risk and has not been validated on five-year outcomes. Report annual probabilities as approximate.
- Current registry, system type, deactivation dates, coordinates and county define a retrospective cohort/location proxy; missing historical systems and changed locations remain unverified.
- The app snapshot and funding plans are not regenerated by this command. These diagnostic results do not update existing app claims.

Inputs, file hashes, model settings, library versions and the bootstrap definition are recorded in `data/planner_evaluation.json`; individual held-out predictions are in `data/planner_test_predictions.csv`.

## Training-only probability calibration

Selected `logit_ridge` from identity, intercept-only logistic offset, and positive-slope ridge logistic calibration, using nested 5 outer / 4 inner folds on 2633 training systems and 68 onsets.

Lowest mean outer-fold log loss; prefer identity, then intercept, then logit_ridge within 0.001 of minimum. No test-year inputs.

| Candidate | Mean validation log loss |
|---|---:|
| identity | 0.09112 |
| intercept | 0.09115 |
| logit_ridge | 0.08608 |

The final map is fitted to outer out-of-fold predictions. Fold predictions, fold maps and selection evidence are saved in `data/planner_calibration_oof.csv` and `data/planner_calibration.json`. No class weighting is used for calibration. Positive slope preserves ranking apart from existing rounded-score ties. With 68 events, a flexible isotonic failure calibrator is not supported. Training-year folds cannot correct unobserved year-to-year changes in prevalence or follow-up duration.

## Comparison on the original population and outcomes

Exact original system IDs and November-2026 outcomes, compared to rebuilt-input predictions; configurations were reselected using training/validation only.

| Cohort | Method | N / onsets | AUC | Mean forecast | Brier | Log loss |
|---|---|---:|---:|---:|---:|---:|
| all_non_failing | saved_pre_audit_planner | 2616 / 120 | 0.776 | 2.61% | 0.0411 | 0.1661 |
| all_non_failing | repaired_uncalibrated | 2616 / 120 | 0.769 | 2.60% | 0.0415 | 0.1684 |
| all_non_failing | planner_ensemble | 2616 / 120 | 0.769 | 2.52% | 0.0407 | 0.1769 |
| at_risk | saved_pre_audit_planner | 582 / 50 | 0.756 | 4.88% | 0.0734 | 0.2670 |
| at_risk | repaired_uncalibrated | 582 / 50 | 0.739 | 5.24% | 0.0744 | 0.2705 |
| at_risk | planner_ensemble | 582 / 50 | 0.739 | 6.58% | 0.0714 | 0.2668 |

The primary tables use the archived 2026 assessment outcome. These paired tables retain the original November 2026 outcomes; changes here combine historical feature corrections and training-only reselection, rather than a change in outcome vintage. The JSON records paired bootstrap differences. Original snapshots and uncommitted diffs are preserved under `audit/prior/`.

## Reproduce locally

Use the pinned environment in `audit/requirements-lock.txt` and the preserved raw files (do not redownload for this comparison).

```text
python -X utf8 pipeline/model_selection.py
python -X utf8 pipeline/calibrate_planner.py
python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
python -m pytest tests -q --basetemp audit/pytest-final
```

These commands rebuild selection, calibration and diagnostic results locally. Forecast export (`pipeline/ml.py`) uses the same frozen probability map and checks its hashes; it has not been run for this deliverable. The existing app forecast and funding plans remain the prior snapshots.

See `pipeline/HISTORICAL_FEATURES.md` for input-level timing decisions and `audit/VALIDATION_REPORT.md` for the audit findings.
