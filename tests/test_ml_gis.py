import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "data"


@pytest.fixture(scope="module")
def forecast():
    return json.loads((APP / "forecast.json").read_text())


@pytest.fixture(scope="module")
def systems():
    return json.loads((APP / "systems.json").read_text())


def test_forecast_split_is_temporal_and_sized(forecast):
    m = forecast["metrics"]
    assert m["train_n"] > 2000 and m["test_n"] > 2000
    assert 0.02 < m["test_base_rate"] < 0.10
    assert m["test_positives"] == round(m["test_base_rate"] * m["test_n"])


def test_forecast_beats_status_baseline_and_interval_is_sane(forecast):
    g = forecast["metrics"]["models"]
    assert g["gradient_boosting"]["auc"] > g["status_only"]["auc"]
    lo, hi = g["gradient_boosting"]["auc_ci95"]
    assert lo < g["gradient_boosting"]["auc"] < hi
    assert lo > 0.5            # better than chance on the held-out year


def test_forecast_ranking_is_monotone_enough(forecast):
    cal = forecast["metrics"]["calibration_gb"]
    assert cal[-1]["observed_rate"] > 3 * cal[0]["observed_rate"]
    assert cal[-1]["observed_rate"] == max(c["observed_rate"] for c in cal)


def test_forecast_probabilities_valid_and_attached_to_at_risk_systems(forecast, systems):
    assert all(0 < p < 1 for p in forecast["p_fail"].values())
    for s in systems:
        if s["failing"]:
            assert s["pf"] is None
        else:
            assert s["pf"] is not None and 0 < s["pf"] < 1


def test_gis_outputs(systems):
    gis = json.loads((APP / "gis.json").read_text())
    st = gis["stats"]
    assert st["counties"] == 58
    assert st["morans_p_permutation_999"] < 0.05 and st["morans_i_failing"] > 0
    assert len(gis["z"]) >= 0.99 * len(systems)
    assert all(h["n"] >= 3 for h in gis["hubs"])
    assert st["hotspots_p01"] <= st["hotspots_p05"]
    counties = json.loads((APP / "counties.geojson").read_text())
    assert len(counties["features"]) == 58


def test_summary_defaults_include_forecast_horizon():
    s = json.loads((APP / "summary.json").read_text())
    assert s["defaults"]["horizon_years"] == 5


def test_readme_results_table_matches_summary():
    s = json.loads((APP / "summary.json").read_text())
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for r in s["comparison"]:
        row = re.search(rf"\| \${r['budget_musd']}M \| ([\d,]+) \| ([\d,]+) \| ([\d.]+)×", readme)
        assert row, f"missing README row for ${r['budget_musd']}M"
        assert int(row.group(1).replace(",", "")) == r["optimizer"]["people"]
        assert int(row.group(2).replace(",", "")) == r["status_first_baseline"]["people"]
        ratio = r["optimizer"]["people"] / r["status_first_baseline"]["people"]
        assert float(row.group(3)) == pytest.approx(ratio, abs=0.006)


def test_readme_forecast_numbers_match_metrics(forecast):
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    g = forecast["metrics"]["models"]
    assert f"AUC {g['ensemble']['auc']:.3f}" in readme
    assert f"{g['status_only']['auc']}" in readme
