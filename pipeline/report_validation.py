"""Build the concise local audit handoff from saved diagnostic evidence."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    r = json.loads((ROOT/'data/planner_evaluation.json').read_text(encoding='utf-8'))
    c = r['calibration_artifact']
    prior = r['saved_comparison']
    runtime = json.loads((ROOT/'audit/runtime.json').read_text())
    lines = ['# Xylem validation and probability calibration', '',
             '**Ready for local diagnostic review; annual probability claims need revision.** Historical feature handling, selection and calibration are rebuilt locally. The available assessment snapshots do not support a clean annual-onset target or a publication-time backtest.', '',
             '## Revised snapshot results', '',
             'Training: 2024→2025 assessment transition. Diagnostic evaluation: 2025→2026 assessment transition. The primary outcome now uses the archived 2026 affordability assessment, rather than November 2026 current status.', '',
             '| Cohort | Systems / onsets | AUC (95% interval) | Highest 10% capture | Mean probability / observed | Brier / log loss |',
             '|---|---:|---:|---:|---:|---:|']
    for name, cohort in r['cohorts'].items():
        m = cohort['models']['planner_ensemble']; lo, hi = m['auc_ci95']
        lines += [f"| {name} | {cohort['n']} / {cohort['onsets']} | {m['auc']:.3f} ({lo:.3f}–{hi:.3f}) | {m['top10_expected_onsets']:.1f} / {cohort['onsets']} | {m['mean_predicted']:.2%} / {cohort['observed_rate']:.2%} | {m['brier']:.4f} / {m['log_loss']:.4f} |"]
    lines += ['', f"Normalization retains all {r['normalization_n']} eligible baseline systems, including unknown outcomes; subgroup metrics do not renormalize. Reliability bins, baseline comparisons and 1,000 paired stratified bootstrap replicates are in `PLANNER_EVALUATION.md` and the evaluation JSON. Intervals condition on fitted models and prevalence; they exclude retraining, time drift and spatial dependence.", '',
              '## Comparable original population', '',
              '| Cohort | Systems / onsets | Original AUC → repaired AUC | Original mean → repaired calibrated mean | Paired AUC change (95% interval) |',
              '|---|---:|---:|---:|---:|']
    for name, cohort in prior['cohorts'].items():
        old = cohort['models']['saved_pre_audit_planner']; new = cohort['models']['planner_ensemble']
        delta = cohort['paired_auc_comparisons']['saved_pre_audit_planner']; lo, hi = delta['auc_delta_ci95']
        lines += [f"| {name} | {cohort['n']} / {cohort['onsets']} | {old['auc']:.3f} → {new['auc']:.3f} | {old['mean_predicted']:.2%} → {new['mean_predicted']:.2%} | {delta['auc_delta']:+.3f} ({lo:+.3f}–{hi:+.3f}) |"]
    lines += ['', f"All {prior['coverage_of_saved_rows']} original system IDs and their November 2026 outcomes are retained for this paired comparison. {prior['shared_raw_hashes_checked']} original raw-file hashes were checked; {len(prior['changed_raw_files'])} changed. The performance change combines corrected features and training-only model reselection. It does not isolate the effect of each removed source. The different primary population/outcome counts reflect assessment-vintage coverage and changed statuses, not missing rows silently removed by normalization.", '',
              '## What changed', '',
              '- Removed current mutable stage-1 attributes, facilities, all-time lead/copper maxima, demographics, shortage/rate/basin/infrastructure snapshots and current-size substitutes. Historical population/connection counts come only from prior-year affordability archives; missing history stays unknown.',
              '- School-lead inputs require both collection and source load dates before cutoff. Removed eventual wildfire acreage, withheld incomplete early five-year fire windows, corrected January weather windows and past-only climatology, and represented NOAA missing sentinels as unknown.',
              '- Rebuilt stage-1 selection on 2021–2023 forward validation, its probability map on those validation predictions, and stage-2 selection on 2024→2025 cross-validation. Historical 2026 outcomes now come from the 2026 assessment archive.',
              '- Bound feature caches, in-memory forecasts, selection and calibration to source/code hashes and dependency versions. Old or mismatched artifacts fail closed with rebuild instructions. Preprocessing fits on training data.', '',
              '## Probability calibration decision', '',
              f"Selected **{c['method']}** using {c['training_n']} training rows and {c['training_events']} events. Candidates were identity, a one-parameter intercept adjustment, and a positive-slope two-parameter logistic map with fixed ridge shrinkage toward slope one. Nested 5 outer / 4 inner folds exclude validation rows from model and calibration fitting; the lowest mean outer log loss wins, preferring the simpler method within 0.001. Candidate losses were " + ', '.join(f"{name}: {value:.5f}" for name, value in c['candidate_mean_log_loss'].items()) + '.', '',
              f"Final map: `logit(p_calibrated) = {c['calibrator']['intercept']:.6f} + {c['calibrator']['slope']:.6f} * logit(p_base)`; base probabilities are clipped to [0.000001, 0.999999] for the logit. It fits outer out-of-fold predictions only. No held-out prevalence correction, test-year method selection or At-Risk-specific fitting was performed. The same `planner_probabilities` path applies the map in evaluation and forecast export, after full-population normalization. The positive-slope mapping preserves rank comparisons and existing ties. The JSON retains uncalibrated probability metrics alongside calibrated metrics.", '',
              'This uses one training transition and few events. Configuration selection is not nested inside calibration folds, so training validation evidence can be optimistic. Within-year calibration cannot establish transfer under changing prevalence, follow-up duration or final-model refitting. The stage-1 isotonic map has many more violation events, but shares validation folds with model selection and is also not nested.', '',
              '## Material limitations and what remains unverified', '',
              '| Finding | Severity / confidence | Evidence and consequence |', '|---|---|---|',
              '| Annual target and cutoff mismatch | High / established | The 2025 official assessment uses the 2024-12-31 Failing list, queried 2025-03-04, rather than July 2025 membership. The original current-status target runs through November 2026. Assessment-to-assessment probabilities cannot be certified as 12-month onset probabilities. |',
              '| Historical publication vintage | High / established gap | The supplied 2024 risk workbook was modified 2025-06-23. Metadata does not prove changed cells, but original 2024 bytes and publication dates are unverified. Event sources generally have event times rather than first-publication histories. |',
              '| Cohort/location history | Medium / established gap | Current registry/type/deactivation, coordinates and county remain qualified proxies. Historical activation, relocation, reclassification and disappeared-system coverage are unavailable. |',
              '| Selection, repeated development and dependence | High / established | Prior work already examined 2025→2026 outcomes. This is diagnostic evaluation; neither confidence intervals nor training-only calibration restore an untouched test. |',
              '| Five-year probabilities | High / unvalidated | `1-(1-p)^5` assumes constant annual risk. Annual validation would not validate five-year probabilities; the annual target is itself unresolved here. |', '']
    a = prior['cohorts']['at_risk']['recorded_failing_starts']
    lines += [f"Of the original 50 At-Risk snapshot positives, {a['on_or_before_nominal_cutoff']} current failure episodes start on/before July 2025 and {a['after_nominal_window']} after July 2026. Current `FAILING_START_DATE` cannot recover prior/recovered episodes, so filtering that column would not create complete annual labels. Needed evidence: original dated risk/affordability releases, complete Failing-list membership and episode histories at aligned cutoffs, historical registries/locations, and first-availability/source revision history. No annual-rate correction has been invented to fill this gap.", '',
              'Credible within this scope: the saved arithmetic, population-specific snapshot ranking and proper probability scores for these fixed bytes, and comparisons on exact original IDs/outcomes. Not established: prospective leakage-free ranking, calibrated annual failure probabilities, or calibrated five-year risk. Mean predicted-versus-observed differences should be read alongside the horizon mismatch, rather than interpreted purely as probability-model error.', '',
              '## Local delivery and reproduction', '',
              'Branch: `validate/historical-calibration`, based on `'+r['base_commit']+'`. Both source checkouts retain their original status and tracked diffs (`audit/source-preservation.json`). No push, PR or publication was performed. Saved app forecast and funding plans were not regenerated.', '',
              'Run in this isolated checkout using the supplied evaluation environment:', '', '```powershell',
              '$env:OMP_NUM_THREADS = "2"', '$env:OPENBLAS_NUM_THREADS = "2"',
              "$python = 'C:\\Users\\sai71\\XylemEvaluation\\.venv\\Scripts\\python.exe'",
              '& $python -X utf8 pipeline/model_selection.py',
              '& $python -X utf8 pipeline/calibrate_planner.py',
              '& $python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000',
              '& $python -m pytest tests -q --basetemp audit/pytest-final',
              '& $python -X utf8 pipeline/report_validation.py', '```', '',
              'Use preserved raw inputs, not fresh downloads. SHA-256 hashes, model settings, source metadata and library versions are in `data/planner_evaluation.json`; calibration folds/maps and individual predictions are saved in the accompanying JSON/CSV files. `audit/requirements-lock.txt`, `audit/environment-full.txt` and `audit/runtime.json` record dependencies and Python. The bundled Pillow build may require retaining this environment. Source URLs are in `data/extra_sources.json`, `pipeline/fetch_data.py`, and the evaluation input audit.', '',
              'Verification results are recorded in `audit/tests-final.log`. Tests check historical cutoffs/load dates, exclusion invariance, missing history, cache/provenance invalidation, OOF label exclusion, monotone calibration, independent probability/AUC/Brier/log-loss reconstruction, and cohort alignment. Legacy app-snapshot tests remain separate from the revised diagnostic result.', '',
              'References: [State Water Board 2025 Needs Assessment, page 75](https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs/2025needsassessment.pdf); [scikit-learn calibration guidance](https://scikit-learn.org/stable/modules/calibration.html).']
    lines += ['', '## Coverage and calibration qualifications', '']
    overall = r['cohorts']['all_non_failing']
    lines += [f"Of {r['normalization_n']} scored systems, {r['normalization_n']-overall['n']} have unknown/not-assessed 2026 outcomes and are excluded only from metrics. The 2026 archive groups known non-Failing/non-At-Risk systems as Other; these are retained as negative outcomes rather than discarded. The original November comparison retains exactly the original 2,616 systems, including all 582 At-Risk systems.", '',
              f"{r['missing_baselines']['violation_forecast_only']} evaluated systems lack a stage-1 forecast (five are At-Risk; one of the 18 is an onset). The full model uses its training-fitted missing-value handling; the violation-only baseline fills missing scores with zero, as explicitly recorded. The JSON includes a complete-case sensitivity calculation using fixed predictions without refitting or renormalization.", '',
              '| Outcome / cohort | Uncalibrated Brier → calibrated | Uncalibrated log loss → calibrated |', '|---|---:|---:|']
    for name, cohort in r['cohorts'].items():
        a = cohort['models']['uncalibrated_planner_ensemble']; b = cohort['models']['planner_ensemble']
        lines += [f"| Assessment / {name} | {a['brier']:.5f} → {b['brier']:.5f} | {a['log_loss']:.5f} → {b['log_loss']:.5f} |"]
    for name, cohort in prior['cohorts'].items():
        a = cohort['models']['repaired_uncalibrated']; b = cohort['models']['planner_ensemble']
        lines += [f"| Original November / {name} | {a['brier']:.5f} → {b['brier']:.5f} | {a['log_loss']:.5f} → {b['log_loss']:.5f} |"]
    lines += ['', 'Calibration improves Brier score in these comparisons, but it does not improve every proper score: the primary At-Risk log loss worsens slightly, and the original November overall log loss worsens. The selected method is retained because its selection used training-only validation, not these diagnostic outcomes. Mean agreement alone does not establish calibration, and no claim of universal improvement is supported.', '',
              'The complete normalization population is saved in `data/planner_scoring_predictions.csv`; the exact original-population comparison is in `data/planner_original_comparison.csv`. Output hashes are recorded in the result JSON. Local forecast explanatory text now calls the results exploratory and states the constant-annual-risk multi-year assumption. App data is unchanged; no full app export was run. JavaScript syntax and Python/browser optimizer parity were checked.']
    (ROOT/'audit/VALIDATION_REPORT.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
