"""Regression tests for historical inputs; synthetic data, no downloads required."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import extra_features as ef
import ml
import model_selection as ms
import model_zoo
import violation_model as vm
from feature_policy import FEATURE_POLICY


def write_sizes(root, year, population, connections, ids=("CA1",)):
    pd.DataFrame({"PWSID": ids, "Population": population,
                  "Number of Service Connections": connections}).to_excel(
        root / f"{year}affordability.xlsx", sheet_name="Affordability Assessment", index=False)


def test_sizes_use_prior_year_archive_without_filling_from_future(monkeypatch, tmp_path):
    monkeypatch.setattr(ef, "RAW", tmp_path)
    write_sizes(tmp_path, 2023, [50, 70], [10, 14], ("CA1", "CA2"))
    write_sizes(tmp_path, 2024, [100], [20])
    write_sizes(tmp_path, 2025, [999999], [999999])
    pw = pd.Index(["CA1", "CA2"])
    result = ef.historical_size_features(pw, "2025-07-01")
    assert result.loc["CA1", "lpop"] == pytest.approx(np.log1p(100))
    assert result.loc["CA1", "lconn"] == pytest.approx(np.log1p(20))
    assert result.loc["CA2"].isna().all()
    write_sizes(tmp_path, 2025, [1], [1])
    assert_frame_equal(result, ef.historical_size_features(pw, "2025-07-01"))
    assert_frame_equal(result, ef.historical_size_features(pw, "2025-01-01"))


def test_missing_size_history_stays_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(ef, "RAW", tmp_path)
    write_sizes(tmp_path, 2024, [100], [20])
    assert ef.historical_size_features(pd.Index(["CA1"]), "2024-07-01").isna().all().all()


def test_invalid_archived_sizes_are_unknown(monkeypatch, tmp_path):
    monkeypatch.setattr(ef, "RAW", tmp_path)
    write_sizes(tmp_path, 2024, [-1], ["unknown"])
    assert ef.historical_size_features(pd.Index(["CA1"]), "2025-07-01").isna().all().all()


def test_model_feature_path_does_not_read_mutable_snapshots(monkeypatch):
    pw = pd.Index(["CA1"])
    def forbidden(*args, **kwargs):
        pytest.fail("Historical model accessed an unversioned snapshot")
    for name in ("static_features", "lead_copper_features", "facility_features", "tract_features",
                 "sdwis_static", "shortage_features", "infra_features", "rate_features", "basin_features"):
        monkeypatch.setattr(ef, name, forbidden)
    monkeypatch.setattr(ef, "asof_features", lambda ids, cutoff: pd.DataFrame({"dated": [1.]}, index=ids))
    monkeypatch.setattr(ef, "terrain_features", lambda ids: pd.DataFrame({"elev_m": [2.]}, index=ids))
    monkeypatch.setattr(ef, "historical_size_features", lambda ids, cutoff: pd.DataFrame({"lpop": [3.], "lconn": [4.]}, index=ids))
    result = ef.historical_features(pw, "2024-07-01")
    assert result.loc["CA1"].to_dict() == {"dated": 1., "elev_m": 2., "lpop": 3., "lconn": 4.}


def test_school_samples_on_cutoff_included_later_and_undated_excluded(monkeypatch, tmp_path):
    monkeypatch.setattr(ef, "X", tmp_path)
    path = tmp_path / "school_lead.csv"
    samples = pd.DataFrame({"pws_id": ["CA1"] * 4, "samp_date": [20240630, 20240701, 20240702, None],
                            "samp_loaded": [20240630, 20240701, 20240702, None], "result": [2., 3., 1000., 2000.], "action_level_exceedance": ["no", "no", "yes", "yes"]})
    try:
        samples.to_csv(path, index=False)
        ef.school_lead_df.cache_clear()
        before = ef.school_lead_features(pd.Index(["CA1"]), "2024-07-01")
        assert before.loc["CA1", "school_lead_samples"] == 2
        assert before.loc["CA1", "school_lead_max"] == 3.
        samples.loc[2:, "result"] = 999999.
        samples.to_csv(path, index=False)
        ef.school_lead_df.cache_clear()
        assert_frame_equal(before, ef.school_lead_features(pd.Index(["CA1"]), "2024-07-01"))
    finally:
        ef.school_lead_df.cache_clear()


@pytest.mark.parametrize("cutoff", ["2017-01-01", "2017-07-01"])
def test_weather_future_records_do_not_change_past_features(monkeypatch, cutoff):
    pw = pd.Index(["CA1"])
    weather = {(1, y): [float(y - 2000)] * 12 for y in range(1991, 2026)}
    monkeypatch.setattr(ef, "noaa", lambda kind: weather)
    monkeypatch.setattr(ef, "county_fips", lambda: {"ALPHA": 1})
    monkeypatch.setattr(ef, "systems", lambda: pd.DataFrame({"county": ["ALPHA"]}, index=pw))
    before = ef.weather_features(pw, cutoff)
    if cutoff == "2017-01-01":
        assert before.loc["CA1", "precip_36m"] == pytest.approx(15.)
    c = pd.Timestamp(cutoff)
    for year in range(c.year, 2026):
        for month in range(1, 13):
            if year > c.year or month >= c.month:
                weather[(1, year)][month - 1] = 999999.
    assert_frame_equal(before, ef.weather_features(pw, cutoff))


@pytest.mark.parametrize("attrs", [{}, {"feature_policy": "old"},
                                   {"feature_policy": FEATURE_POLICY, "cycles": [1900]}])
def test_panel_rebuilds_legacy_cache_and_ignores_current_population(monkeypatch, tmp_path, attrs):
    cache = tmp_path / "panel.pkl"
    legacy = pd.DataFrame({"future_population": [999999.]})
    legacy.attrs.update(attrs)
    legacy.to_pickle(cache)
    monkeypatch.setattr(vm, "CACHE", cache)
    monkeypatch.setattr(vm, "CYCLES", [2024, 2026])
    pw = pd.Index(["CA1"])
    monkeypatch.setattr(vm, "spine", lambda: pd.DataFrame({"deact": [pd.NaT], "POPULATION": [999999.]}, index=pw))
    calls = []
    def features(ids, cutoff):
        calls.append(cutoff)
        return pd.DataFrame({"dated": [1.], "lpop": [np.nan], "lconn": [np.nan]}, index=ids)
    monkeypatch.setattr(ef, "historical_features", features)
    monkeypatch.setattr(vm, "label", lambda ids, year: pd.Series(0, index=ids))
    result = vm.panel()
    assert calls == ["2024-07-01", "2026-07-01"]
    assert result.lpop.isna().all() and "future_population" not in result
    assert result.attrs["feature_policy"] == FEATURE_POLICY
    assert result.loc[result.cycle == 2026, "y"].isna().all()
    assert_frame_equal(result, vm.panel())
    assert len(calls) == 2


@pytest.mark.parametrize("saved_policy", [None, "old"])
def test_old_model_selection_and_calibration_require_retraining(monkeypatch, tmp_path, saved_policy):
    path = tmp_path / "selection.json"
    path.write_text(json.dumps({"feature_policy": saved_policy, "stage1": {"calibrator": {"x": [0, 1], "y": [0, 1]}}}))
    monkeypatch.setattr(model_zoo, "SELECTION", path)
    with pytest.raises(ValueError, match="model_selection.py"):
        model_zoo.selection()


def test_ml_rejects_old_calibration_before_building_panel(monkeypatch, tmp_path):
    path = tmp_path / "selection.json"
    path.write_text("{}")
    monkeypatch.setattr(model_zoo, "SELECTION", path)
    monkeypatch.setattr(ml, "panel", lambda *args: pytest.fail("Must reject incompatible artifacts before building data"))
    with pytest.raises(ValueError, match="historical feature policy"):
        ml.main()


@pytest.mark.parametrize("cycle, expected", [(2022, .25), (2023, .25), (2024, .3)])
def test_calibration_never_uses_later_validation_labels(monkeypatch, cycle, expected):
    monkeypatch.setattr(model_zoo, "selection", lambda: {"stage1": {"folds": {"val": [2021, 2022, 2023]},
        "calibrator": {"x": [0., 1.], "y": [.1, .9]}}})
    assert vm.calibrate(np.array([.25]), cycle)[0] == pytest.approx(expected)


def test_selection_writes_policy_before_stage2_reads_artifact(monkeypatch, tmp_path):
    path = tmp_path / "selection.json"
    monkeypatch.setattr(ms, "OUT", path)
    monkeypatch.setattr(model_zoo, "SELECTION", path)
    monkeypatch.setattr(ms, "select_stage1", lambda: ({"chosen": "hgb", "chosen_config": {"family": "hgb"}}, {}, None))
    def panel(*args):
        assert model_zoo.selection()["feature_policy"] == FEATURE_POLICY
        return pd.DataFrame({"feature": [1.], "y": [0]})
    monkeypatch.setattr(ml, "panel", panel)
    monkeypatch.setattr(ms, "select_stage2", lambda *args: {"chosen": "ensemble"})
    ms.main()
    assert json.loads(path.read_text())["feature_policy"] == FEATURE_POLICY
    assert "stage2" in model_zoo.selection()


def test_stage1_training_excludes_current_and_future_label_windows(monkeypatch):
    panel = pd.DataFrame({"cycle": [2023, 2024, 2025], "dated": [1., 2., 3.], "y": [0., 1., np.nan]}, index=["CA1"] * 3)
    trained = []
    class Model:
        def fit(self, X, y):
            trained.append((X.dated.tolist(), y.tolist()))
            return self
        def predict_proba(self, X):
            return np.tile([.8, .2], (len(X), 1))
    monkeypatch.setattr(model_zoo, "stage1_members", lambda: [("hgb", {})])
    monkeypatch.setattr(model_zoo, "make", lambda *args, **kwargs: Model())
    prediction, _ = vm.predict_for_cycle(2024, panel, calibrate_output=False)
    assert trained == [([1.], [0.])]
    assert prediction.iloc[0] == pytest.approx(.2)


def test_size_baseline_handles_years_without_archives():
    X = pd.DataFrame({"lpop": [np.nan] * 20, "lconn": [np.nan] * 20})
    y = np.array([0, 1] * 10)
    model = model_zoo.make("hgb", max_iter=5).fit(X, y)
    assert np.allclose(model.predict_proba(X)[:, 1], .5)


def test_empty_history_remains_constant_when_new_values_arrive():
    history = pd.DataFrame({"dated": [1., np.nan, 3.], "size": [np.nan] * 3})
    imputer = model_zoo.EmptyHistoryImputer().fit(history)
    current = pd.DataFrame({"dated": [np.nan, 4.], "size": [1000., 2000.]})
    result = imputer.transform(current)
    assert np.isnan(result[0, 0]) and result[1, 0] == 4.
    assert (result[:, 1] == 0).all()
    assert current["size"].tolist() == [1000., 2000.]
