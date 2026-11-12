"""Tests of forecast arithmetic, subgroup evaluation, and held-out label isolation."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from planner_forecast import planner_probabilities
from evaluate_planner import calibration_bins, evaluate_predictions, metrics, top_metrics


def test_planner_rule_matches_independent_existing_export_arithmetic():
    members = [[.1, .2, .3], [.3, .2, .1]]
    # Each row has mean .2; rescaling to .06 gives [.03,.06,.09]
    # and [.09,.06,.03], whose mean is .06 at every system.
    assert planner_probabilities(members, .06) == pytest.approx([.06, .06, .06])
    members = np.array([[.01, .02, .97], [.1, .2, .3]])
    expected = [round(min(.95, sum(row[i] * .1 / (sum(row) / len(row)) for row in members) / 2), 4) for i in range(3)]
    assert planner_probabilities(members, .1) == pytest.approx(expected)


def test_planner_cap_rounding_and_zero_member():
    assert planner_probabilities([[0, 0, 1]], .5) == pytest.approx([0, 0, .95])
    assert planner_probabilities([[0, 0], [.1, .3]], .1) == pytest.approx([.025, .075])
    assert planner_probabilities([[.1, .3]], 0) == pytest.approx([0, 0])


@pytest.mark.parametrize('members,rate', [([], .1), ([[]], .1), ([.1, .2], .1), ([[np.nan]], .1), ([[1.1]], .1), ([[-.1]], .1), ([[.1]], np.nan), ([[.1]], -1)])
def test_invalid_planner_inputs_fail(members, rate):
    with pytest.raises(ValueError):
        planner_probabilities(members, rate)


def frames():
    train = pd.DataFrame({'status0': [0, 0, 2, 2], 'y': [0, 0, 1, 0]})
    test = pd.DataFrame({'status0': [0, 2, 2, 0], 'y': [0, 1, 0, 1], 'total': [.1, .9, .2, .3], 'p_hbv': [.1, .7, .2, .5]})
    return train, test


def test_subgroup_uses_original_full_cohort_normalization():
    train, test = frames()
    raw = [[.05, .1, .2, .65]]
    p = planner_probabilities(raw, train.y.mean())
    r = evaluate_predictions(train, test, {'planner_ensemble': p, 'ensemble': [.1, .2, .3, .4]}, n_boot=20)
    assert r['cohorts']['at_risk']['n'] == 2
    assert r['cohorts']['at_risk']['onsets'] == 1
    assert r['cohorts']['at_risk']['models']['planner_ensemble']['mean_predicted'] == pytest.approx(.15)
    assert p[1:3].mean() != planner_probabilities(np.asarray(raw)[:, 1:3], train.y.mean()).mean()
    assert r['training_rate'] == .25
    assert sum(b['n'] for b in r['cohorts']['at_risk']['planner_calibration']) == 2


def test_metrics_are_independently_checkable():
    r = metrics(np.array([0, 1, 0, 1]), np.array([.1, .8, .4, .3]), probability=True)
    assert r['auc'] == .75
    assert r['brier'] == pytest.approx((.01 + .04 + .16 + .49) / 4)
    assert r['top10_n'] == 1 and r['recall_top10pct'] == .5
    assert r['precision_top10pct'] == 1


def test_ties_do_not_depend_on_workbook_row_order():
    a = top_metrics(np.array([1, 0, 1, 0]), np.ones(4))
    b = top_metrics(np.array([0, 0, 1, 1]), np.ones(4))
    assert a == b
    assert a['top10_expected_onsets'] == .5
    assert a['recall_top10pct'] == .25


def test_probability_bins_include_boundaries_and_represent_empty_bins():
    bins = calibration_bins(np.array([0, 0, 1, 1]), np.array([0, .01, .1, 1]))
    assert sum(x['n'] for x in bins) == 4
    assert bins[0]['n'] == 1 and bins[1]['n'] == 1
    assert bins[-1]['n'] == 1
    assert bins[2]['mean_predicted'] is None


def test_one_class_and_empty_cohorts_are_explicit():
    train, test = frames()
    test['status0'] = 0
    test['y'] = 0
    r = evaluate_predictions(train, test, {'planner_ensemble': [.1] * 4, 'ensemble': [.2] * 4}, n_boot=10)
    assert r['cohorts']['at_risk']['n'] == 0
    assert r['cohorts']['all_non_failing']['models']['planner_ensemble']['auc'] is None
    assert r['cohorts']['all_non_failing']['models']['planner_ensemble']['recall_top10pct'] is None
    assert r['cohorts']['all_non_failing']['paired_auc_comparisons'] == {}


def test_changing_held_out_labels_cannot_change_planner_predictions(monkeypatch):
    import ml
    train = pd.DataFrame({'status0': [0, 2] * 10, 'total': np.linspace(0, 1, 20), 'ind4': [0] * 20, 'y': [0, 0, 0, 1] * 5, 's1': ['unused'] * 20})
    test = train.copy()
    class FakeModel:
        def __init__(self, invert):
            self.invert = invert
        def predict_proba(self, x):
            p = .05 + .7 * x.total.to_numpy()
            p = p[::-1] if self.invert else p
            return np.column_stack([1-p, p])
    monkeypatch.setattr(ml, 'FAMILIES', {'logistic': 'lr', 'gradient_boosting': 'hgb'})
    monkeypatch.setattr(ml, 'fit_family', lambda family, x, y: FakeModel(family == 'lr'))
    monkeypatch.setattr(ml, 'boot_auc', lambda y, p: [0, 1])
    a, _, pa = ml.evaluate(train, test, planner_bootstrap=5)
    test['y'] = 1 - test.y
    b, _, pb = ml.evaluate(train, test, planner_bootstrap=5)
    assert pa['planner_ensemble'] == pytest.approx(pb['planner_ensemble'])
    assert pa['planner_ensemble'] == pytest.approx(planner_probabilities([pa['logistic'], pa['gradient_boosting']], train.y.mean()))
    assert a['models']['planner_ensemble']['mean_predicted'] == b['models']['planner_ensemble']['mean_predicted']

def test_full_scoring_cohort_keeps_systems_without_known_outcomes(monkeypatch):
    import ml
    train = pd.DataFrame({'status0': [0, 2] * 10, 'total': np.linspace(0, 1, 20), 'ind4': [0] * 20, 'y': [0, 0, 0, 1] * 5, 's1': ['unused'] * 20})
    test = train.copy()
    scoring = pd.concat([test, pd.DataFrame({'status0': [2], 'total': [.99], 'ind4': [0]}, index=[20])])
    class FakeModel:
        def predict_proba(self, x):
            p = .05 + .7 * x.total.to_numpy()
            return np.column_stack([1-p, p])
    monkeypatch.setattr(ml, 'FAMILIES', {'gradient_boosting': 'hgb'})
    monkeypatch.setattr(ml, 'fit_family', lambda family, x, y: FakeModel())
    monkeypatch.setattr(ml, 'boot_auc', lambda y, p: [0, 1])
    r, _, p = ml.evaluate(train, test, planner_bootstrap=5, scoring_cohort=scoring)
    full_raw = FakeModel().predict_proba(scoring)[:, 1]
    expected = planner_probabilities([full_raw], train.y.mean())[:20]
    assert p['planner_ensemble'] == pytest.approx(expected)
    assert r['planner_evaluation']['normalization_n'] == 21
    assert r['planner_evaluation']['cohorts']['all_non_failing']['n'] == 20
    assert r['planner_evaluation']['normalization_member_means']['gradient_boosting'] == pytest.approx(full_raw.mean())
    with pytest.raises(ValueError, match='Every evaluated system'):
        ml.evaluate(train, test, planner_bootstrap=5, scoring_cohort=scoring.iloc[1:])

def test_saved_results_reconcile_to_individual_predictions():
    import json
    from scipy.stats import rankdata
    root = Path(__file__).resolve().parents[1]
    result = json.loads((root / 'data/planner_evaluation.json').read_text(encoding='utf-8'))
    rows = pd.read_csv(root / 'data/planner_test_predictions.csv')
    # Independent reconstruction from exported raw member probabilities and the
    # full scoring cohort's raw means, not the production helper.
    means = result['normalization_member_means']
    scaled = np.column_stack([rows[name].to_numpy() * result['training_rate'] / max(1e-9, mean) for name, mean in means.items()])
    expected = np.round(np.minimum(.95, scaled.mean(axis=1)), 4)
    if 'calibration_artifact' in result:
        assert rows.uncalibrated_planner_ensemble.to_numpy() == pytest.approx(expected, abs=1e-12)
        mapping = result['calibration_artifact']['calibrator']
        if mapping['method'] != 'identity':
            base = np.clip(expected, 1e-6, 1-1e-6)
            odds = np.exp(mapping['intercept']) * (base/(1-base)) ** mapping['slope']
            expected = odds/(1+odds)
    assert rows.planner_ensemble.to_numpy() == pytest.approx(expected, abs=1e-12)
    for name, mask in {'all_non_failing': np.ones(len(rows), dtype=bool), 'at_risk': rows.status0.to_numpy() == 2}.items():
        y = rows.actual_failing.to_numpy()[mask]
        p = rows.planner_ensemble.to_numpy()[mask]
        c = result['cohorts'][name]
        r = c['models']['planner_ensemble']
        assert len(y) == c['n'] and int(y.sum()) == c['onsets']
        assert r['mean_predicted'] == pytest.approx(p.mean())
        assert r['brier'] == pytest.approx(np.mean((y - p) ** 2))
        clipped = np.clip(p, np.finfo(float).eps, 1-np.finfo(float).eps)
        assert r['log_loss'] == pytest.approx(-np.mean(y*np.log(clipped)+(1-y)*np.log(1-clipped)))
        # Mann-Whitney rank-sum formula is independent of sklearn's AUC routine.
        n1, n0 = y.sum(), (1-y).sum()
        auc = (rankdata(p)[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
        assert r['auc'] == pytest.approx(auc)
        assert sum(b['n'] for b in c['planner_calibration']) == len(y)
        assert sum(b['onsets'] for b in c['planner_calibration']) == int(y.sum())


def test_saved_scoring_population_reconstructs_normalization_and_exact_old_comparison():
    import json
    root = Path(__file__).resolve().parents[1]
    result = json.loads((root/'data/planner_evaluation.json').read_text(encoding='utf-8'))
    score = pd.read_csv(root/'data/planner_scoring_predictions.csv').set_index('PWSID')
    test = pd.read_csv(root/'data/planner_test_predictions.csv').set_index('PWSID')
    old = pd.read_csv(root/'audit/prior/data/planner_test_predictions.csv').set_index('PWSID')
    paired = pd.read_csv(root/'data/planner_original_comparison.csv').set_index('PWSID')
    assert score.index.is_unique and len(score) == result['normalization_n']
    assert int(score.outcome_known.sum()) == len(test)
    assert set(score.index[score.outcome_known]) == set(test.index)
    members = list(result['normalization_member_means'])
    raw = score[members].to_numpy()
    means = raw.mean(axis=0)
    assert means == pytest.approx(list(result['normalization_member_means'].values()))
    independent = np.round(np.minimum(.95, (raw*result['training_rate']/means).mean(axis=1)), 4)
    assert score.uncalibrated_planner_ensemble.to_numpy() == pytest.approx(independent, abs=1e-12)
    assert score.loc[test.index].planner_ensemble.to_numpy() == pytest.approx(test.planner_ensemble.to_numpy())
    assert paired.index.equals(old.index)
    assert paired.actual_failing.equals(old.actual_failing)
    assert paired.saved_pre_audit_planner.to_numpy() == pytest.approx(old.planner_ensemble.to_numpy())
    assert paired.planner_ensemble.to_numpy() == pytest.approx(score.loc[paired.index].planner_ensemble.to_numpy())


def test_saved_result_hashes_match_supplied_inputs_code_and_prediction_exports():
    import hashlib
    import json
    root = Path(__file__).resolve().parents[1]
    result = json.loads((root/'data/planner_evaluation.json').read_text(encoding='utf-8'))
    for path, expected in {**result['input_and_code_hashes'], **result['output_hashes']}.items():
        assert hashlib.sha256((root/path).read_bytes()).hexdigest() == expected, path
