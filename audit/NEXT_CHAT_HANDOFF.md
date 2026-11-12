# Handoff: finish Xylem app integration and claims cleanup

Continue Xylem's California water-funding planning prototype. Complete the two tasks below locally. Do not push, open a PR, deploy, or publish without new explicit authorization. The prior authorization to push covered the completed validation changes only. GitHub Pages now runs manually (`workflow_dispatch`); preserve that setting.

Repository: https://github.com/palashraks-afk/XylemProject

The completed historical-input audit, calibration, tests, and reproducible results have been prepared for `main`. Start from the latest `main` containing `historical-event-time-v2`, inspect status/diff and applicable `AGENTS.md`, and create an isolated checkout. Preserve all existing work.

## Local context

- Completed validation checkout: `C:\Users\sai71\.codex\visualizations\2026\11\12\01a1cd55-8da6-78c0-8e32-a25d35740e1d\XylemValidation`, branch `validate/historical-calibration`. It contains the preserved raw data needed to reproduce this run.
- Python: `C:\Users\sai71\XylemEvaluation\.venv\Scripts\python.exe`.
- Leave `C:\Users\sai71\XylemEvaluation` (`evaluate/at-risk-planner`) and `C:\Users\sai71\XylemProject` (`fix/historical-model-inputs`) untouched. Both contain separate uncommitted work already integrated into validation; do not reapply it blindly.
- Read `audit/VALIDATION_REPORT.md`, `pipeline/HISTORICAL_FEATURES.md`, `PLANNER_EVALUATION.md`, and the result/calibration JSON files. The audit report describes the validation-stage state before the subsequently authorized push.
- Preserve the raw snapshot bytes; do not redownload mutable sources for a controlled comparison. `.gitattributes` preserves hash-bound file bytes. Raw extras, risk workbooks and generated caches are not all tracked in Git; copy the needed source files from the validation checkout without overwriting different existing inputs.

## Task 1: integrate the corrected forecast into a local app preview

The saved `app/data` forecast and funding plans still predate the audit. The corrected evaluation results are separate. Generate a complete local app preview with the corrected forecast/calibration and its dependent funding plans, summaries and stress tests. Inspect actual output paths in `pipeline/ml.py`, `pipeline/build.py`, and downstream consumers first; do not assume unsupported output-directory flags exist. Preserve the old snapshot and use an isolated preview checkout/output location.

Use the shared `planner_probabilities` path in both evaluation and export. Keep normalization over the full scoring population before filtering to known outcomes or At-Risk systems. Preserve the training-only calibration and artifact/hash checks; rebuild affected artifacts rather than bypassing a stale-artifact error. Never fit a correction to 2025-to-2026 outcomes or select methods using their scores.

Compare old/new funding choices at the existing budget presets and relevant equity/reserve/routing settings. Report systems selected, people served, costs, membership changes and allocation stability, with exact definitions. Describe reach as modeled reach under the chosen objective, not measured intervention benefit. Check that the browser's displayed values and CSV exports use the same refreshed snapshot. Preserve Python/browser optimizer parity. Record source versions, hashes and reproduction commands.

The model supports diagnostic snapshot comparisons only. Do not label the output as a validated annual failure probability. Multi-year conversion `1-(1-p)^h` assumes constant annual risk and is unvalidated. Keep those limits visible wherever forecast-based funding weights or horizon conversions are shown. Do not invent missing historical failure episodes or discard difficult cases to improve results.

## Task 2: make documentation and app claims consistent

Audit README, GRADING, dataset/portability descriptions, app Method/forecast text, setup instructions and result tables against the actual refreshed local outputs. Some older sections still claim a strict temporal test, contain superseded metrics, or duplicate model-comparison rows. The README's earlier run sequence also needs selection/calibration steps before forecast generation.

Replace stale claims; distinguish rank scores, snapshot probabilities and funding weights. Separate the archived-2026 primary result from the exact original November-2026 comparison. Label previously examined 2025-to-2026 outcomes as diagnostic, not an untouched test. Keep costs modeled, routes approximate, and California-only scope explicit. Do not turn inherited self-grades into verified quality measures. Avoid new feature scope such as sensors, groundwater or another geography.

## Established evidence and limits

- Full test suite: 108 passed before handoff; JavaScript syntax and optimizer parity also passed.
- Primary archived assessment: 2,633 systems / 61 positives overall, AUC 0.831; 586 At-Risk systems / 32 positives, AUC 0.764. Mean calibrated predictions: 2.50% overall versus 2.32% observed; 6.54% At-Risk versus 5.46% observed.
- Exact original 582-system / 50-positive At-Risk comparison: AUC 0.756 to 0.739, paired 95% difference interval -0.053 to +0.017. Mean corrected/calibrated prediction 6.58%, versus 8.59% observed. The two outcome vintages are not interchangeable.
- Calibration: positive-slope ridge logistic map selected using nested 5 outer / 4 inner folds within 2024-to-2025 only, 68 events. Ranking is preserved relative to corrected uncalibrated scores. Brier improves in the recorded comparisons; log loss does not improve in every comparison. Do not claim universal calibration improvement.
- Annual validation remains unresolved: assessment status/reference dates differ from July cutoffs; the supplied 2024 risk workbook was modified in June 2025; original publication vintages and complete historical failure membership/episode histories are unavailable. Current failure-start dates cannot recover earlier/recovered episodes.
- Of 2,647 scored systems, 14 have unknown/not-assessed primary outcomes. Eighteen evaluated systems lack stage-1 predictions, handled as documented, with complete-case sensitivity saved. The 2026 `Other` category is a known non-Failing outcome, not missing data.

## Acceptance criteria

Deliver a working local preview, an inspectable old/new allocation comparison, consistent app/docs claims and setup commands, and a concise completion report. Run relevant tests and recheck numerical claims against saved outputs. Update genuine snapshot-dependent regression expectations when justified, but never alter assertions merely to force favorable model performance. Confirm all forecast consumers use the intended snapshot and probability path. Keep everything local and leave a concrete reviewable result before any later release authorization.
