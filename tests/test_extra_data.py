"""Extra public datasets, the as-of discipline, and the two-stage forecast."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
APP = ROOT / "app" / "data"
RAW = ROOT / "data" / "raw" / "extra"
needs_raw = pytest.mark.skipif(not (RAW / "sdwis_violation.csv").exists(), reason="run pipeline/fetch_extra.py first")


def test_at_least_twenty_extra_sources_downloaded():
    m = json.loads((ROOT / "data" / "extra_sources.json").read_text())["sources"]
    ok = [s for s in m if s.get("ok")]
    assert len(ok) >= 20, [s["name"] for s in m if not s.get("ok")]
    assert len({s["owner"] for s in ok}) >= 8                       # not twenty tables from one place


@needs_raw
def test_violation_features_only_use_records_on_or_before_the_cutoff():
    import extra_features as ef
    v = ef.violations()
    pw = v[v.is_health_based_ind == "Y"].pwsid.iloc[:200].unique()
    early = ef.violation_features(pd.Index(pw), "2018-07-01")
    late = ef.violation_features(pd.Index(pw), "2025-07-01")
    assert (late.yrs_violation_history >= early.yrs_violation_history - 1e-9).all()
    # a violation that begins after the early cutoff must not appear in its counts
    after = v[(v.b > "2018-07-01") & (v.b <= "2018-12-31") & (v.is_health_based_ind == "Y")].pwsid.unique()
    only_after = [p for p in after if v[(v.pwsid == p) & (v.b <= "2018-07-01")].empty][:20]
    if only_after:
        f = ef.violation_features(pd.Index(only_after), "2018-07-01")
        assert (f.viol_5y == 0).all() and (f.viol_health_5y == 0).all()


@needs_raw
def test_lead_service_line_inventory_paperwork_is_not_counted_as_health_based():
    import extra_features as ef
    v = ef.violations()
    lsl = v[(pd.to_numeric(v.contaminant_code, errors="coerce") == 5200) & (v.violation_code.astype(str) == "2E")]
    assert len(lsl) > 500 and (lsl.is_health_based_ind == "N").all()


@needs_raw
def test_stage1_label_window_is_the_twelve_months_after_the_cutoff():
    import extra_features as ef
    import violation_model as vm
    v = ef.violations()
    hb = v[(v.is_health_based_ind == "Y") & (v.b > "2021-07-01") & (v.b <= "2022-07-01")].pwsid.iloc[0]
    out = v[(v.is_health_based_ind == "Y") & (v.b > "2022-07-01")].pwsid.iloc[0]
    lab = vm.label(pd.Index([hb, "CA_NOT_A_SYSTEM"]), 2021)
    assert lab[hb] == 1 and lab["CA_NOT_A_SYSTEM"] == 0
    assert vm.label(pd.Index([out]), 2021).iloc[0] in (0, 1)       # defined; a later violation alone cannot make the 2021 label 1
    sub = v[(v.pwsid == out) & (v.is_health_based_ind == "Y") & (v.b > "2021-07-01") & (v.b <= "2022-07-01")]
    assert vm.label(pd.Index([out]), 2021).iloc[0] == int(len(sub) > 0)


def forecast():
    return json.loads((APP / "forecast.json").read_text())


def test_stage1_beats_the_violation_count_baseline_every_test_year():
    s1 = forecast()["metrics"]["stage1_model"]
    assert set(s1) >= {"2022", "2023", "2024", "2025"}
    for y, r in s1.items():
        assert r["auc"] > r["auc_baseline_violation_count"], y
        assert r["auc"] > 0.85, y


def test_extra_data_improves_the_failure_forecast_on_the_held_out_year():
    m = forecast()["metrics"]
    assert m["models"]["ensemble"]["avg_precision"] > m["without_stage1"]["ensemble"]["avg_precision"]
    assert m["models"]["ensemble"]["recall_top10pct"] > m["without_stage1"]["ensemble"]["recall_top10pct"]
    lo, hi = m["models"]["ensemble"]["auc_ci95"]
    assert lo > 0.5 and lo < m["models"]["ensemble"]["auc"] < hi


def test_source_value_table_covers_the_sources_and_all_beats_size_only():
    sv = forecast()["metrics"]["source_value"]
    assert sv["all_sources"] > sv["size_only"] + 0.05
    assert len(sv["drop_one"]) >= 15


def test_violation_probabilities_are_valid_and_attached_to_systems():
    f = forecast()
    assert f["p_violation"] and all(0 <= p <= 1 for p in f["p_violation"].values())
    systems = json.loads((APP / "systems.json").read_text())
    with_pv = [s for s in systems if s.get("pv") is not None]
    assert len(with_pv) > 300 and all(not s["failing"] for s in with_pv)


def test_equity_index_has_six_components_in_range():
    systems = json.loads((APP / "systems.json").read_text())
    assert all(len(s["eq"]) == 6 for s in systems)
    vals = [x for s in systems for x in s["eq"] if x is not None]
    assert min(vals) >= 0 and max(vals) <= 1
    assert sum(s["eq"][4] is not None for s in systems) > 0.9 * len(systems)       # tract social vulnerability joined for nearly all
