"""Calibration isolation, proper losses, monotonicity and stale-artifact checks."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from scipy.special import expit, logit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import calibrate_planner as cp
import feature_policy as fp
import ml
import model_zoo
import violation_model as vm
import extra_features as ef
from planner_forecast import apply_calibration, fit_calibration, planner_probabilities


def test_logistic_map_matches_independent_formula_and_keeps_ranks():
    p = np.linspace(.001, .9, 101)
    mapping = {'method': 'logit_ridge', 'intercept': -.3, 'slope': 1.7}
    q = apply_calibration(p, mapping)
    odds = p / (1-p)
    expected = np.exp(-.3)*odds**1.7 / (1+np.exp(-.3)*odds**1.7)
    assert q == pytest.approx(expected)
    assert np.all(np.diff(q) > 0)
    assert planner_probabilities([p], .05, calibrator=mapping) == pytest.approx(
        apply_calibration(planner_probabilities([p], .05), mapping))


def test_intercept_map_fits_training_prevalence_without_class_weights():
    y = np.array([0]*95+[1]*5)
    mapping = fit_calibration(np.full(100, .02), y, 'intercept')
    assert mapping['slope'] == 1
    assert apply_calibration([.02], mapping)[0] == pytest.approx(.05, abs=1e-6)


def test_small_sample_sigmoid_is_monotone_finite_and_uses_fixed_ridge():
    p = np.linspace(.001, .3, 100)
    y = np.zeros(100); y[[12, 30, 42, 72, 99]] = 1
    mapping = fit_calibration(p, y, 'logit_ridge')
    q = apply_calibration(p, mapping)
    assert 0 < mapping['slope'] <= 10
    assert np.all(np.diff(q) > 0) and np.isfinite(q).all()
    assert fit_calibration(p, y, 'identity')['method'] == 'identity'


@pytest.mark.parametrize('method', ['intercept', 'logit_ridge'])
def test_calibration_rejects_one_class_and_invalid_arrays(method):
    with pytest.raises(ValueError):
        fit_calibration([.1, .2], [0, 0], method)
    with pytest.raises(ValueError):
        fit_calibration([np.nan, .2], [0, 1], method)
    with pytest.raises(ValueError):
        apply_calibration([.1], {'method': method, 'slope': -1, 'intercept': 0})


def test_method_selection_uses_validation_loss_with_simple_tie_preference():
    rows = [{'identity': {'log_loss': .1}, 'intercept': {'log_loss': .0995},
             'logit_ridge': {'log_loss': .0992}}]*5
    assert cp.select_method(rows)[0] == 'identity'
    for row in rows:
        row['logit_ridge']['log_loss'] = .09
    assert cp.select_method(rows)[0] == 'logit_ridge'


def test_oof_models_never_see_their_validation_labels(monkeypatch):
    train = pd.DataFrame({'y': [0, 1]*10}, index=[f'CA{i}' for i in range(20)])
    score = pd.DataFrame(index=list(train.index)+['UNKNOWN_OUTCOME'])
    calls = []
    def fake_base(fit, population):
        calls.append(set(fit.index))
        assert population.index.equals(score.index)  # full normalization population
        return np.array([.5 if pid in fit.index else .1 for pid in population.index])
    monkeypatch.setattr(cp, 'base_prediction', fake_base)
    p = cp.oof_base(train, score, 5, 71)
    assert p == pytest.approx(np.full(20, .1))
    assert len(calls) == 5 and all(len(ids) == 16 for ids in calls)


def test_calibration_artifact_rejects_changed_inputs_and_wrong_transition(monkeypatch, tmp_path):
    path = tmp_path/'cal.json'
    monkeypatch.setattr(cp, 'provenance', lambda: {'hash': 'new'})
    saved = {'provenance': {'hash': 'old'}, 'training_transition': [2024, 2025]}
    path.write_text(json.dumps(saved))
    with pytest.raises(ValueError, match='Stale'):
        cp.load_calibration(path)
    saved['provenance'] = {'hash': 'new'}; saved['training_transition'] = [2025, 2026]
    path.write_text(json.dumps(saved))
    with pytest.raises(ValueError, match='exclude diagnostic'):
        cp.load_calibration(path)


def test_policy_matching_selection_still_rejects_changed_content(monkeypatch, tmp_path):
    path = tmp_path/'selection.json'
    path.write_text(json.dumps({'feature_policy': fp.FEATURE_POLICY, 'input_fingerprint': 'stale'}))
    monkeypatch.setattr(model_zoo, 'SELECTION', path)
    monkeypatch.setattr(model_zoo, 'fingerprint', lambda **kwargs: 'fresh')
    with pytest.raises(ValueError, match='model_selection.py'):
        model_zoo.selection()


def test_stage1_in_memory_cache_is_bound_to_selection_and_inputs(monkeypatch):
    signature = ['one']; calls = []
    monkeypatch.setattr(ml, 'fingerprint', lambda **kwargs: signature[0])
    monkeypatch.setattr(ml, 'file_hash', lambda path: 'selection')
    monkeypatch.setattr(vm, 'predict_for_cycle', lambda year, target: (calls.append(year) or pd.Series([.1]), []))
    monkeypatch.setattr(ml, '_STAGE1', {})
    ml.stage1(2024); ml.stage1(2024)
    signature[0] = 'two'; ml.stage1(2024)
    assert calls == [2024, 2024]


def test_2026_historical_status_cannot_fall_back_to_current_registry(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('Historical outcome accessed current registry')
    monkeypatch.setattr(ml.pd, 'read_csv', forbidden)
    monkeypatch.setattr(ml.pd, 'read_excel', lambda path, **kwargs:
        pd.DataFrame({'PWSID': ['CA1'], '2026 SAFER Status': ['At-Risk'],
                      'Disadvantaged Community Status': ['DAC']}))
    s, _ = ml.status(2026)
    assert s.loc['CA1'] == 'At-Risk'


def test_other_is_a_known_non_failing_outcome_not_a_missing_label(monkeypatch):
    ids = pd.Index(['CA1', 'CA2', 'CA3'])
    monkeypatch.setattr(ml, 'scoring_features', lambda year:
        pd.DataFrame({'status0': [0, 2, 2]}, index=ids))
    monkeypatch.setattr(ml, 'status', lambda year:
        (pd.Series(['Other', 'Failing', 'Not Assessed'], index=ids), None))
    panel = ml.panel(2025, 2026)
    assert panel.index.tolist() == ['CA1', 'CA2']
    assert panel.y.tolist() == [0, 1]


def test_calibrated_evaluation_matches_export_rule_and_ignores_test_labels(monkeypatch):
    train = pd.DataFrame({'status0': [0, 2]*10, 'total': np.linspace(0, 1, 20),
                          'ind4': [0]*20, 'y': [0, 0, 0, 1]*5})
    test = train.copy()
    class Model:
        def predict_proba(self, x):
            p = .1+.6*x.total.to_numpy()
            return np.column_stack([1-p, p])
    monkeypatch.setattr(ml, 'FAMILIES', {'gradient_boosting': 'hgb'})
    monkeypatch.setattr(ml, 'fit_family', lambda *args: Model())
    monkeypatch.setattr(ml, 'boot_auc', lambda *args: [0, 1])
    mapping = {'method': 'logit_ridge', 'intercept': .8, 'slope': 1.4}
    _, _, first = ml.evaluate(train, test, planner_bootstrap=5, calibrator=mapping)
    expected = planner_probabilities([Model().predict_proba(test)[:, 1]], float(train.y.mean()), mapping)
    assert first['planner_ensemble'] == pytest.approx(expected)
    test.y = 1-test.y
    _, _, second = ml.evaluate(train, test, planner_bootstrap=5, calibrator=mapping)
    assert second['planner_ensemble'] == pytest.approx(first['planner_ensemble'])


def test_school_sample_is_unavailable_until_recorded_load(monkeypatch, tmp_path):
    samples = pd.DataFrame({'pws_id': ['CA1']*3,
                            'samp_date': [20200101]*3,
                            'samp_loaded': [20240701, 20240702, None],
                            'result': [2., 9999., 99999.],
                            'action_level_exceedance': ['no', 'yes', 'yes']})
    samples.to_csv(tmp_path/'school_lead.csv', index=False)
    monkeypatch.setattr(ef, 'X', tmp_path)
    ef.school_lead_df.cache_clear()
    try:
        f = ef.school_lead_features(pd.Index(['CA1']), '2024-07-01')
        assert f.loc['CA1', 'school_lead_samples'] == 1
        assert f.loc['CA1', 'school_lead_max'] == 2
    finally:
        ef.school_lead_df.cache_clear()


def test_final_fire_acreage_cannot_affect_historical_features(monkeypatch):
    fire = pd.DataFrame({'d': pd.to_datetime(['2025-01-01']),
                         'attr_InitialLatitude': [36.], 'attr_InitialLongitude': [-120.],
                         'poly_GISAcres': [1.]})
    ids = pd.Index(['CA1'])
    monkeypatch.setattr(ef, 'fires_df', lambda: fire)
    monkeypatch.setattr(ef, 'systems', lambda: pd.DataFrame({'lat': [36.], 'lon': [-120.]}, index=ids))
    before = ef.fire_features(ids, '2025-07-01')
    fire.loc[0, 'poly_GISAcres'] = 999999.
    pd.testing.assert_frame_equal(before, ef.fire_features(ids, '2025-07-01'))
    assert ef.fire_features(ids, '2024-07-01').isna().all().all()


def test_saved_calibration_provenance_and_selection_are_consistent():
    saved = cp.load_calibration()
    assert saved['training_transition'] == [2024, 2025]
    chosen, _ = cp.select_method(saved['fold_scores'])
    assert saved['method'] == chosen
    rows = pd.read_csv(cp.ROOT/'data/planner_calibration_oof.csv')
    assert rows.PWSID.is_unique and rows.base_oof.notna().all()
    assert int(rows.actual_failing.sum()) == saved['training_events']
    for fold, maps in enumerate(saved['fold_maps']):
        validation = rows[rows.outer_fold == fold]
        assert len(validation) == maps['validation_n']
        assert int(validation.actual_failing.sum()) == maps['validation_events']
        for method in cp.CALIBRATION_METHODS:
            assert validation[method].to_numpy() == pytest.approx(
                apply_calibration(validation.base_oof.to_numpy(), maps['maps'][method]))
