"""Evaluate the full planner forecast on all non-Failing and At-Risk systems.

Run: python pipeline/evaluate_planner.py --bootstrap 1000
Outputs are separate from the app's existing forecast snapshot. No model search,
threshold tuning, or recalibration is performed on the held-out outcomes.
"""
import argparse
import hashlib
import importlib.metadata
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score

from planner_forecast import METHOD

ROOT = Path(__file__).resolve().parents[1]
SEED = 7


def top_metrics(y, score, fraction=0.1):
    """Expected capture under random tie-breaking at the top-k boundary."""
    k = max(1, int(len(y) * fraction))
    threshold = np.sort(score)[-k]
    above, tied = score > threshold, score == threshold
    caught = float(y[above].sum() + y[tied].sum() * (k - above.sum()) / tied.sum())
    return {"top10_n": k, "top10_expected_onsets": caught,
            "recall_top10pct": caught / y.sum() if y.sum() else None,
            "precision_top10pct": caught / k}


def metrics(y, score, probability=False):
    y, score = np.asarray(y, dtype=int), np.asarray(score, dtype=float)
    if len(y) == 0:
        return {"auc": None, "avg_precision": None, "reason": "empty cohort"}
    out = {"auc": float(roc_auc_score(y, score)) if len(np.unique(y)) == 2 else None,
           "avg_precision": float(average_precision_score(y, score)) if y.sum() else None,
           **top_metrics(y, score)}
    if probability:
        out.update(mean_predicted=float(score.mean()), brier=float(brier_score_loss(y, score)),
                   log_loss=float(log_loss(y, score, labels=[0, 1])))
    return out


def calibration_bins(y, p):
    edges = [0, .01, .025, .05, .1, .2, 1.00000001]
    bins = []
    for a, b in zip(edges[:-1], edges[1:]):
        mask = (p >= a) & (p < b)
        n = int(mask.sum())
        bins.append({"lower": a, "upper": min(1, b), "n": n,
                     "mean_predicted": float(p[mask].mean()) if n else None,
                     "observed_rate": float(y[mask].mean()) if n else None,
                     "onsets": int(y[mask].sum())})
    return bins


def bootstrap(y, scores, n_boot):
    """Paired stratified bootstrap; fixed test prevalence, no refitting/selection."""
    if len(np.unique(y)) != 2:
        return {}, {}
    rng = np.random.default_rng(SEED)
    pos, neg = np.flatnonzero(y == 1), np.flatnonzero(y == 0)
    samples = {name: {key: [] for key in ("auc", "avg_precision", "recall_top10pct")} for name in scores}
    for _ in range(n_boot):
        ix = np.concatenate([rng.choice(pos, len(pos), replace=True), rng.choice(neg, len(neg), replace=True)])
        for name, score in scores.items():
            r = metrics(y[ix], score[ix])
            for key in samples[name]:
                samples[name][key].append(r[key])
    ci = {name: {key + "_ci95": np.percentile(vals, [2.5, 97.5]).tolist() for key, vals in vals_by_key.items()}
          for name, vals_by_key in samples.items()}
    delta = {}
    for name in scores:
        if name == "planner_ensemble":
            continue
        a = np.asarray(samples["planner_ensemble"]["auc"]) - np.asarray(samples[name]["auc"])
        delta[name] = {"auc_delta": float(roc_auc_score(y, scores["planner_ensemble"]) - roc_auc_score(y, scores[name])),
                       "auc_delta_ci95": np.percentile(a, [2.5, 97.5]).tolist()}
    return ci, delta


def evaluate_predictions(train, test, predictions, n_boot=400, normalization_n=None):
    """Subgroup the already-normalized full-cohort predictions; never renormalize."""
    if n_boot < 1:
        raise ValueError("n_boot must be positive")
    y = test.y.to_numpy(dtype=int)
    rate = float(train.y.mean())
    by_status = train.groupby("status0").y.mean().to_dict()
    scores = {
        "planner_ensemble": np.asarray(predictions["planner_ensemble"], dtype=float),
        "legacy_rank_ensemble": np.asarray(predictions["ensemble"], dtype=float),
        "total_risk_score": test.total.fillna(0).to_numpy(dtype=float),
        "status_training_rate": test.status0.map(by_status).fillna(rate).to_numpy(dtype=float),
    }
    if "p_hbv" in test:
        scores["violation_forecast_only"] = test.p_hbv.fillna(0).to_numpy(dtype=float)
    if "uncalibrated_planner_ensemble" in predictions:
        scores["uncalibrated_planner_ensemble"] = np.asarray(predictions["uncalibrated_planner_ensemble"])
    for name, s in scores.items():
        if s.shape != y.shape or not np.isfinite(s).all():
            raise ValueError(f"Invalid/alignment-mismatched scores for {name}")
    out = {"method": METHOD, "training_rate": rate, "training_n": len(train), "training_onsets": int(train.y.sum()),
           "training_rate_by_status": {str(k): float(v) for k, v in by_status.items()},
           "bootstrap": {"replicates": n_boot, "seed": SEED, "method": "paired stratified system bootstrap, percentile 95% intervals; fixed prevalence; no model refitting"},
           "top10_ties": "Expected capture under random tie-breaking at the top-k boundary; k=floor(0.10*n).",
           "normalization_cohort": "All eligible non-Failing baseline systems, before filtering to known outcomes or At-Risk systems.",
           "normalization_n": normalization_n if normalization_n is not None else len(test),
           "missing_baselines": {"total_risk_score": int(test.total.isna().sum()),
                                  "violation_forecast_only": int(test.p_hbv.isna().sum()) if "p_hbv" in test else None},
           "cohorts": {}}
    for name, mask in {"all_non_failing": np.ones(len(test), dtype=bool), "at_risk": test.status0.to_numpy() == 2}.items():
        yy = y[mask]
        if len(yy) == 0:
            out["cohorts"][name] = {"n": 0, "onsets": 0, "models": {}, "reason": "empty cohort"}
            continue
        ss = {k: s[mask] for k, s in scores.items()}
        rows = {k: metrics(yy, s, k in ("planner_ensemble", "uncalibrated_planner_ensemble", "status_training_rate")) for k, s in ss.items()}
        intervals, deltas = bootstrap(yy, ss, n_boot)
        for k, v in intervals.items():
            rows[k].update(v)
        out["cohorts"][name] = {"n": int(mask.sum()), "onsets": int(yy.sum()), "observed_rate": float(yy.mean()),
                                "training_n": int((train.status0 == 2).sum()) if name == "at_risk" else len(train),
                                "models": rows, "paired_auc_comparisons": deltas,
                                "planner_calibration": calibration_bins(yy, ss["planner_ensemble"])}
    return out


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def input_audit():
    """Inspectable timing evidence; metadata is not proof of release or contents."""
    files = {}
    for path in sorted((ROOT/'data/raw').glob('*.xlsx')):
        book = pd.ExcelFile(path).book
        files[path.name] = {'created': str(book.properties.created),
                            'modified': str(book.properties.modified), 'sha256': sha256(path)}
    current = pd.read_csv(ROOT/'data/raw/SAFER_RA.csv', low_memory=False)
    import violation_model as vm
    panel = vm.panel()
    profile = {str(y): {'n': len(g), 'known_violation_labels': int(g.y.notna().sum()),
                        'missing_population': int(g.lpop.isna().sum()),
                        'missing_connections': int(g.lconn.isna().sum())}
               for y, g in panel.groupby('cycle')}
    return {'workbooks': files, 'stage1_feature_columns': vm.feature_cols(panel),
            'stage1_coverage_by_cycle': profile,
            'registry_created_dates': current.CREATED_DATE.dropna().unique().tolist(),
            'primary_outcome': '2026affordability.xlsx / 2026 SAFER Status',
            'legacy_outcome': 'SAFER_RA.csv / November 2026 snapshot',
            'status_reference_evidence': '2025 Needs Assessment p.75 uses Failing list at 2024-12-31, queried 2025-03-04; annual file names do not establish July status.',
            'sources': ['https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs/2025needsassessment.pdf',
                        'https://scikit-learn.org/stable/modules/calibration.html',
                        'https://www.waterboards.ca.gov/water_issues/programs/grants_loans/docs/2026/draft_fy2026-27_fep_text_0929_clean.pdf']}


def compare_saved(train, scoring, models, calibrator, n_boot):
    """Same original IDs and outcomes; outcome-vintage change kept separate."""
    import ml
    from planner_forecast import planner_probabilities
    prior = pd.read_csv(ROOT/'audit/prior/data/planner_test_predictions.csv').set_index('PWSID')
    if not prior.index.is_unique or not prior.index.isin(scoring.index).all():
        raise ValueError('Original comparison population is not fully covered')
    ix = scoring.index.get_indexer(prior.index)
    cols = ml.Xy(train)[0].columns
    members = [m.predict_proba(scoring[cols])[:, 1] for m in models.values()]
    full_repaired = planner_probabilities(members, float(train.y.mean()))
    full_calibrated = planner_probabilities(members, float(train.y.mean()), calibrator=calibrator)
    repaired, calibrated = full_repaired[ix], full_calibrated[ix]
    outcome = ml.status(2026)[0].reindex(scoring.index)
    known = outcome.isin([*ml.STATUS_ORD, 'Other'])
    pd.DataFrame({'PWSID': scoring.index, 'status0': scoring.status0.to_numpy(),
                  'assessment_outcome': outcome.to_numpy(), 'outcome_known': known.to_numpy(),
                  'uncalibrated_planner_ensemble': full_repaired, 'planner_ensemble': full_calibrated,
                  **{name: member for name, member in zip(models, members)}}).to_csv(ROOT/'data/planner_scoring_predictions.csv', index=False)
    current = pd.read_csv(ROOT/'data/raw/SAFER_RA.csv', low_memory=False).set_index('WATER_SYSTEM_NUMBER')
    start = pd.to_datetime(current.FAILING_START_DATE, errors='coerce').reindex(prior.index)
    pd.DataFrame({'PWSID': prior.index, 'status0': prior.status0.to_numpy(),
                  'actual_failing': prior.actual_failing.to_numpy(),
                  'saved_pre_audit_planner': prior.planner_ensemble.to_numpy(),
                  'repaired_uncalibrated': repaired, 'planner_ensemble': calibrated,
                  'current_episode_start': start.to_numpy()}).to_csv(ROOT/'data/planner_original_comparison.csv', index=False)
    out = {}
    for name, mask in {'all_non_failing': np.ones(len(prior), dtype=bool),
                       'at_risk': prior.status0.to_numpy() == 2}.items():
        y = prior.actual_failing.to_numpy(dtype=int)[mask]
        scores = {'saved_pre_audit_planner': prior.planner_ensemble.to_numpy()[mask],
                  'repaired_uncalibrated': repaired[mask], 'planner_ensemble': calibrated[mask]}
        ci, delta = bootstrap(y, scores, n_boot)
        rows = {k: {**metrics(y, v, probability=True), **ci[k]} for k, v in scores.items()}
        dates = start.to_numpy()[mask]
        failing_dates = pd.Series(dates[y == 1])
        out[name] = {'n': len(y), 'onsets': int(y.sum()), 'models': rows,
                     'paired_auc_comparisons': delta,
                     'recorded_failing_starts': {'on_or_before_nominal_cutoff': int((failing_dates <= pd.Timestamp('2025-07-01')).sum()),
                                                'after_nominal_window': int((failing_dates > pd.Timestamp('2026-07-01')).sum()),
                                                'undated': int(failing_dates.isna().sum())}}
    prior_result = json.loads((ROOT/'audit/prior/data/planner_evaluation.json').read_text(encoding='utf-8'))
    raw_hashes = {name: old for name, old in prior_result['input_and_code_hashes'].items() if name.startswith('data/raw/')}
    changed = {name: {'old': old, 'new': sha256(ROOT/name)} for name, old in raw_hashes.items()
               if (ROOT/name).exists() and sha256(ROOT/name) != old}
    return {'definition': 'Exact original system IDs and November-2026 outcomes, compared to rebuilt-input predictions; configurations were reselected using training/validation only.',
            'shared_raw_hashes_checked': len(raw_hashes), 'changed_raw_files': changed,
            'coverage_of_saved_rows': len(prior), 'cohorts': out}


def write_report(result, path):
    lines = ["# Planner forecast evaluation", "", "Training: 2024 to 2025. Diagnostic snapshots: 2025 to 2026. Full model; model selection rebuilt under historical input policy.", "",
             "The planner probability ensemble is evaluated separately from the previously reported rank ensemble. Its probability calibration uses training outcomes only; the already-examined 2025-to-2026 transition is diagnostic, not an untouched test.", ""]
    for name, c in result["cohorts"].items():
        lines += ["## " + name.replace('_', ' ').title(), "", f"{c['n']} systems; {c['onsets']} onsets; observed rate {c['observed_rate']:.2%}.", "",
                  "| Model | AUC (95% interval) | Average precision | Top-10% recall | Mean forecast | Brier score | Log loss |",
                  "|---|---:|---:|---:|---:|---:|---:|"]
        for label, r in c['models'].items():
            ci = r.get('auc_ci95')
            auc = f"{r['auc']:.3f}" if r['auc'] is not None else 'undefined'
            if ci:
                auc += f" ({ci[0]:.3f} to {ci[1]:.3f})"
            mean = f"{r['mean_predicted']:.2%}" if 'mean_predicted' in r else 'not a failure probability'
            brier = f"{r['brier']:.4f}" if 'brier' in r else '-'
            loss = f"{r['log_loss']:.4f}" if 'log_loss' in r else '-'
            ap = f"{r['avg_precision']:.3f}" if r['avg_precision'] is not None else 'undefined'
            rec = f"{r['recall_top10pct']:.1%}" if r['recall_top10pct'] is not None else 'undefined'
            lines += [f"| {label} | {auc} | {ap} | {rec} | {mean} | {brier} | {loss} |"]
        lines += ["", "Calibration of planner probabilities:", "", "| Probability band | Systems | Mean forecast | Observed onset rate |", "|---|---:|---:|---:|"]
        for b in c['planner_calibration']:
            mean = f"{b['mean_predicted']:.2%}" if b['n'] else '-'
            obs = f"{b['observed_rate']:.2%}" if b['n'] else '-'
            lines += [f"| {b['lower']:.1%} to {b['upper']:.1%} | {b['n']} | {mean} | {obs} |"]
        lines += ["", "Paired AUC differences (planner minus comparator):", ""]
        for label, d in c['paired_auc_comparisons'].items():
            lo, hi = d['auc_delta_ci95']
            lines += [f"- {label}: {d['auc_delta']:+.3f} (95% interval {lo:+.3f} to {hi:+.3f})."]
        lines += ['']
    lines += ["## Interpretation limits", "", *['- ' + v for v in result['limitations']], "",
              "Inputs, file hashes, model settings, library versions and the bootstrap definition are recorded in `data/planner_evaluation.json`; individual diagnostic predictions are in `data/planner_test_predictions.csv`.", ""]
    cal = result.get('calibration_artifact')
    if cal:
        lines += ['## Training-only probability calibration', '',
                  f"Selected `{cal['method']}` from identity, intercept-only logistic offset, and positive-slope ridge logistic calibration, using nested 5 outer / 4 inner folds on {cal['training_n']} training systems and {cal['training_events']} onsets.",
                  '', cal['selection_rule'], '',
                  '| Candidate | Mean validation log loss |', '|---|---:|']
        lines += [f'| {k} | {v:.5f} |' for k, v in cal['candidate_mean_log_loss'].items()]
        lines += ['', 'The final map is fitted to outer out-of-fold predictions. Fold predictions, fold maps and selection evidence are saved in `data/planner_calibration_oof.csv` and `data/planner_calibration.json`. No class weighting is used for calibration. Positive slope preserves ranking apart from existing rounded-score ties. With 68 events, a flexible isotonic failure calibrator is not supported. Training-year folds cannot correct unobserved year-to-year changes in prevalence or follow-up duration.', '']
    comparison = result.get('saved_comparison')
    if comparison:
        lines += ['## Comparison on the original population and outcomes', '', comparison['definition'], '',
                  '| Cohort | Method | N / onsets | AUC | Mean forecast | Brier | Log loss |',
                  '|---|---|---:|---:|---:|---:|---:|']
        for name, c in comparison['cohorts'].items():
            for method, r in c['models'].items():
                lines += [f"| {name} | {method} | {c['n']} / {c['onsets']} | {r['auc']:.3f} | {r['mean_predicted']:.2%} | {r['brier']:.4f} | {r['log_loss']:.4f} |"]
        lines += ['', 'The primary tables use the archived 2026 assessment outcome. These paired tables retain the original November 2026 outcomes; changes here combine historical feature corrections and training-only reselection, rather than a change in outcome vintage. The JSON records paired bootstrap differences. Original snapshots and uncommitted diffs are preserved under `audit/prior/`.', '']
    lines += ['## Reproduce locally', '', 'Use the pinned environment in `audit/requirements-lock.txt` and the preserved raw files (do not redownload for this comparison).', '',
              '```text', 'python -X utf8 pipeline/model_selection.py', 'python -X utf8 pipeline/calibrate_planner.py',
              'python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000',
              'python -m pytest tests -q --basetemp audit/pytest-final', '```', '',
              'These commands rebuild selection, calibration and diagnostic results locally. Then run `pipeline/ml.py`, `pipeline/build.py`, `pipeline/seal_snapshot.py` and `pipeline/compare_allocations.py` to refresh the local app and its comparison. The app uses the same frozen map with hash checks. The reviewed local integration is recorded in `audit/APP_REFRESH_REPORT.md`; evaluation alone does not refresh app data.', '',
              'See `pipeline/HISTORICAL_FEATURES.md` for input-level timing decisions and `audit/VALIDATION_REPORT.md` for the audit findings.', '']
    path.write_text('\n'.join(lines), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bootstrap', type=int, default=1000)
    args = parser.parse_args()
    if args.bootstrap < 1:
        parser.error('--bootstrap must be positive')
    # Import here: ml.evaluate imports the reusable functions above.
    import ml
    if not ml.STAGE1:
        raise RuntimeError('This evaluation requires the full stage-1 model')
    from calibrate_planner import load_calibration
    ml.model_zoo.selection()
    calibration_artifact = load_calibration()
    for year in (2024, 2025):
        for target, _ in ml.STAGE1_COLS:
            print(f'Building full stage-1 forecast: {year} / {target}', flush=True)
            ml.stage1(year, target)
    print('Building transition panels', flush=True)
    train, test = ml.panel(2024, 2025), ml.panel(2025, 2026)
    print(f'Fitting failure models: {len(train)} training, {len(test)} test rows', flush=True)
    evaluation, models, predictions = ml.evaluate(train, test, planner_bootstrap=args.bootstrap, scoring_cohort=ml.scoring_features(2025), calibrator=calibration_artifact["calibrator"])
    result = evaluation['planner_evaluation']
    result['calibration_artifact'] = calibration_artifact
    result['method'] = METHOD + ' followed by training-only ' + calibration_artifact['method']
    result['feature_policy'] = ml.FEATURE_POLICY
    result['input_audit'] = input_audit()
    result['saved_comparison'] = compare_saved(train, ml.scoring_features(2025), models, calibration_artifact['calibrator'], args.bootstrap)
    complete = test.p_hbv.notna().to_numpy()
    result['stage1_complete_case_sensitivity'] = {
        'definition': 'Point estimates on the same fixed predictions after excluding missing stage-1 forecasts; no refitting or renormalization.',
        'cohorts': {}}
    for name, group in {'all_non_failing': np.ones(len(test), bool), 'at_risk': test.status0.to_numpy() == 2}.items():
        mask = complete & group
        result['stage1_complete_case_sensitivity']['cohorts'][name] = {
            'n': int(mask.sum()), 'onsets': int(test.y.to_numpy()[mask].sum()),
            'planner': metrics(test.y.to_numpy()[mask], predictions['planner_ensemble'][mask], probability=True),
            'violation_only': metrics(test.y.to_numpy()[mask], test.p_hbv.to_numpy()[mask])}
    result['limitations'] = [
        'One previously examined assessment transition; intervals condition on the fitted models and observed prevalence and do not capture year-to-year drift, model-selection uncertainty or regional dependence.',
        'Model configurations were already developed with this test year visible. This is a diagnostic re-evaluation of the existing model, not a new untouched test.',
        'Historical features use event-time-v2: mutable snapshots and undated lead/copper excluded; prior-year archived sizes only, no current-size fallback. Source publication dates and retrospective revisions remain unverified.',
        'The supplied 2024 risk workbook was modified 2025-06-23, after its nominal cutoff. Year-labelled workbooks are retrospective proxies, not verified original releases. The 2025 assessment uses December 2024 Failing-list status, not July 2025 status. These are snapshot-transition probabilities; annual failure calibration is unverified.',
        'Probability calibration is selected by nested folds within 2024-to-2025 training data only and frozen before diagnostic evaluation; no 2025-to-2026 outcomes fit or select its map. Normalization still depends on full scoring-cohort covariates. Base configuration selection is not nested.',
        'Systems missing a next-snapshot outcome are excluded from metrics but retained in the probability-normalization cohort. Attrition may still bias measured performance.',
        'The five-year conversion 1-(1-p)^5 assumes constant annual risk and has not been validated on five-year outcomes. Annual failure probabilities also remain unvalidated.',
        'Current registry, system type, deactivation dates, coordinates and county define a retrospective cohort/location proxy; missing historical systems and changed locations remain unverified.',
        'The app snapshot and funding plans are not regenerated by this command. These diagnostic results do not update existing app claims.',
    ]
    result['split'] = {'train': [2024, 2025], 'test': [2025, 2026], 'target': 'non-Failing at baseline, Failing at next known snapshot', 'at_risk_definition': 'status0 == 2 in the baseline snapshot'}
    result['split']['test_outcome_source'] = '2026affordability.xlsx; no November current-status substitution'
    result['model_families'] = list(models)
    result['model_selection'] = ml.model_zoo.selection()
    result['generated_utc'] = datetime.now(timezone.utc).isoformat()
    result['base_commit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    result['library_versions'] = {p: importlib.metadata.version(p) for p in ('numpy', 'pandas', 'scikit-learn', 'scipy', 'openpyxl')}
    paths = list((ROOT/'data'/'raw').rglob('*')) + list((ROOT/'pipeline').glob('*.py')) + [ROOT/'data'/'model_selection.json', ROOT/'data'/'planner_calibration.json', ROOT/'data'/'planner_calibration_oof.csv', ROOT/'data'/'extra_sources.json', ROOT/'audit'/'requirements-lock.txt', ROOT/'audit'/'runtime.json', ROOT/'app'/'data'/'infrastructure.json', ROOT/'app'/'app.js']
    # Cache bytes are implementation-specific; record source inputs, not generated caches.
    paths = [p for p in paths if p.is_file() and p.suffix.lower() in ('.csv', '.xlsx', '.json', '.geojson', '.zip', '.txt', '.png', '.py', '.js')]
    result['input_and_code_hashes'] = {p.relative_to(ROOT).as_posix(): sha256(p) for p in sorted(set(paths))}
    dest = ROOT/'data'/'planner_evaluation.json'
    rows = pd.DataFrame({'PWSID': test.index, 'status0': test.status0.to_numpy(), 'actual_failing': test.y.to_numpy(),
                         **{name: p for name, p in predictions.items()}, 'total_risk_score': test.total.to_numpy(), 'p_hbv': test.p_hbv.to_numpy()})
    rows.to_csv(ROOT/'data'/'planner_test_predictions.csv', index=False)
    result['output_hashes'] = {name: sha256(ROOT/name) for name in
        ('data/planner_test_predictions.csv', 'data/planner_scoring_predictions.csv', 'data/planner_original_comparison.csv')}
    dest.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    write_report(result, ROOT/'PLANNER_EVALUATION.md')
    print(json.dumps({k: {'n': v['n'], 'onsets': v['onsets'], 'observed_rate': v['observed_rate'], 'planner': v['models']['planner_ensemble'], 'risk_score': v['models']['total_risk_score']} for k, v in result['cohorts'].items()}, indent=2), flush=True)
    print('Saved', dest, flush=True)


if __name__ == '__main__':
    main()
