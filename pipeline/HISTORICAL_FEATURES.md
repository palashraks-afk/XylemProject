# Historical input audit

Policy: `historical-event-time-v2`. Generated app forecast and funding-plan files remain the original snapshots.

## Input decisions

| Input | Historical treatment | Remaining qualification |
|---|---|---|
| SAFER risk assessments, including population, connections and underlying indicators | Use the year-labelled workbook; all 21 underlying headers were checked to match across 2024/2025/2026 | 2024 risk workbook modified 2025-06-23; original 2024 publication bytes unavailable. Annual vintage is a retrospective proxy, not a verified as-of release. |
| SAFER status and DAC | Archived affordability workbooks for every historical year, including 2026; no fallback to the current registry for historical outcomes | The 2025 report uses the Failing list at 2024-12-31, queried 2025-03-04. It does not establish July 2025 membership. Workbook-specific status/reference dates and change histories are incomplete. |
| Stage-1 population / connections | Latest prior-year archived affordability workbook; no current-size substitution, no filling missing IDs from older years | Earliest supplied size archive is 2024. Following-year eligibility is a conservative convention; exact first publication is not independently verified. |
| Violations / enforcement | Event begins or enforcement date at/before July cutoff; label windows strictly after cutoff through the following July | No first-publication timestamps. Later corrections/classifications and reporting delays remain possible. An end date after cutoff counts as unresolved at cutoff. |
| School lead | Require sample date AND recorded `samp_loaded` date at/before cutoff. Missing either date excludes the row | Recorded source load date improves availability evidence but is not proof that an identical public release existed then. No load-time fallback to sample date. |
| Undated lead/copper results | Exclude entirely from model path | Supplied table has pwsid, sample_id, sar_id and measurements, but no measurement or publication date. No dated join evidence supplied. |
| Dry-well reports | CREATE DATE at/before cutoff, trailing windows | Coordinates and later record revisions are unversioned. |
| Wildfire | Discovery date at/before cutoff; five-year features unavailable before 2025 because source begins late 2019 | Final wildfire acreage removed: it can postdate discovery/cutoff. Publication history remains unknown. |
| NOAA weather | Only complete months before cutoff; climatology ends at min(2020, prior year); missing-value sentinels become unknown | Monthly publication lag and revisions are unarchived. January's 36-month rollback is corrected. |
| Terrain | Retain elevation, relief and slope as fixed geographic proxies | Contemporary tiles and coordinates are used; no historical relocation/version proof. |
| System type / deactivation / location / county | Current registry defines the stage-1 cohort and fixed location proxies | Historical registries, activation dates, type changes and disappeared systems unavailable; survivorship and location bias remain. |
| Facilities, sanitary surveys, system attributes, service areas, demographics, CalEnviroScreen, shortage scores, water rates, basin priority, infrastructure and neighbour sizes | Exclude from historical stage-1 model path; retain existing current descriptive utilities | Source vintage or historical feature availability not established. |

Stage 2 uses archived risk-assessment population/connection counts, not the current counts previously used by stage 1. Annual risk workbook inputs remain qualified as described above; excluding every unverified archived input would leave no comparable full model. These limitations prohibit a prospective, publication-time or annual-probability validation claim.

The 2026 assessment uses `Other` for known non-Failing, non-At-Risk systems. It is included as a negative historical outcome, while `Not Assessed` remains unknown. The [State Water Board FY2026–27 draft funding plan](https://www.waterboards.ca.gov/water_issues/programs/grants_loans/docs/2026/draft_fy2026-27_fep_text_0929_clean.pdf) explicitly defines this category (page 16). It is not mapped to an invented earlier-year ordinal status.

## Preprocessing, selection and calibration

Imputation and scaling fit on training rows only. Gradient boosting makes training columns with entirely missing history constant unknowns, so later values cannot acquire a learned effect. Partly missing columns retain native missingness. Random forest/extra trees use training medians; logistic models use training medians, missing indicators and standardization.

Stage-1 candidates are selected on forward cycles 2021/2022/2023; their label windows close by July 2024. Stage-1 isotonic calibration is refitted on those validation predictions only and can be applied only after the latest validation label window closes. Those validation folds also select configurations, so the stage-1 calibration evidence is not nested and can be optimistic. Earlier-cycle stage-1 diagnostic tables use a later-selected configuration and are not as-of forecasts for 2021-2023.

Stage-2 configurations are reselected on repeated five-fold CV within 2024-to-2025 training outcomes. The pre-existing equal-family ensemble policy remains fixed. The test transition is scored for diagnostic tables after selection; it does not select models or probability maps. Prior development already examined these outcomes, so this is not an untouched test.

Planner probability candidates are identity, an intercept-only logistic offset, and a positive-slope logistic map with a fixed ridge penalty shrinking slope toward one. Nested five outer / four inner folds exclude outer validation rows from both base fitting and calibrator fitting. The smallest model within 0.001 of the lowest mean outer-fold log loss wins. The final map fits outer out-of-fold predictions. No class balancing, test prevalence matching, subgroup correction, or five-year fitting occurs. Base configuration selection is not nested inside calibration folds; only one training transition and 68 onsets are available.

Both evaluation and forecast export call `planner_probabilities` with this saved map. Member normalization occurs over the full scoring population before known-outcome/subgroup filtering. The map is then applied without renormalization. The 2026 export uses the saved current registry for current eligibility; the historical 2026 outcome uses its assessment archive. The map remains frozen from 2024-to-2025 even if the export base model refits on both transitions; calibration transfer to that refit is unvalidated.

## Cache and artifact contract

The stage-1 panel uses a new filename and binds its policy, cycles, raw-file bytes, feature code and numerical dependency versions. On rebuild, in-process source loaders and label caches are cleared. In-memory stage-1 predictions also bind the selection artifact and content fingerprint; coordinate caching binds the registry hash. Legacy caches cannot satisfy the new checks.

Model selection binds the input/feature fingerprint plus model-construction, selection and failure-model code. Missing, old-policy or mismatched artifacts fail with a rebuild instruction. Probability calibration additionally binds the exact selection JSON and prediction/calibration code. A change of inputs, dependencies, model selection or scoring code therefore cannot silently reuse the old calibration.

## Timing evidence and unresolved requirement

The [2025 State Water Board Needs Assessment](https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs/2025needsassessment.pdf), page 75, specifies the prior December Failing-list reference. The supplied risk workbook metadata says: 2024 modified 2025-06-23; 2025 modified 2025-06-23; 2026 modified 2026-09-01. Metadata does not prove that a particular cell changed; it does prevent treating these bytes as verified original releases. Affordability metadata is recorded separately in `data/planner_evaluation.json`.

The original November 2026 snapshot comparison also contains failures with recorded starts before the nominal July 2025 cutoff or after July 2026. Current FAILING_START_DATE describes current failing episodes and cannot recover systems that failed and recovered, disappeared, or had earlier episodes. It must not be used to manufacture complete annual labels.

A true annual backtest needs original dated releases and complete Failing-list membership/event histories at aligned forecast cutoffs, including recovered systems, plus archived registries/locations and availability timestamps for event sources. None is fully supplied. The implemented calibration is defensible for the specified retrospective snapshot target; annual failure calibration remains unverified. The conversion `1-(1-p)^5` assumes constant annual risk and is not validated by annual or snapshot evaluation.

## Reproduction

Preserve the supplied bytes rather than downloading mutable replacements. See `audit/requirements-lock.txt`, `audit/runtime.json`, `data/planner_evaluation.json` and `PLANNER_EVALUATION.md` for exact versions, hashes and commands. `pipeline/ml.py` is an optional local export and has not been run; the app snapshot and funding plans have not been regenerated.
