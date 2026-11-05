"""The judges' view reads the app's own data files. These tests fail if a data file changes shape in a way that would
break it, if any app script stops parsing, or if the README repeats a table row."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
DATA = APP / "data"


def load(name):
    return json.loads((DATA / f"{name}.json").read_text())


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("script", ["app.js", "map3d.js", "judges.js", "optimizer.js", "worker.js"])
def test_app_scripts_parse(script):
    r = subprocess.run(["node", "--check", str(APP / script)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_judges_view_is_wired_into_the_page():
    html = (APP / "index.html").read_text(encoding="utf-8")
    assert 'src="judges.js"' in html
    js = (APP / "judges.js").read_text(encoding="utf-8")
    for needle in ["Impact", "Challenge fit and feasibility", "Innovation", "Not claimed"]:
        assert needle in js


def test_data_the_judges_view_reads_is_present():
    summary, systems = load("summary"), load("systems")
    row = next(r for r in summary["comparison"] if r["budget_musd"] == 500)
    for k in ("systems", "people", "dac_people"):
        assert k in row["optimizer"]
    assert "people" in row["status_first_baseline"]
    for k in ("spearman_county", "median_abs_pct_error_county_ge10M"):
        assert k in summary["calibration"]
    assert summary["snapshot"]
    assert all("county" in s and "pop" in s and "eq" in s for s in systems)

    models = load("forecast")["metrics"]["models"]
    assert "status_only" in models and (("ensemble" in models) or ("gradient_boosting" in models))
    ens = models.get("ensemble") or models["gradient_boosting"]
    assert len(ens["auc_ci95"]) == 2

    gis = load("gis")
    assert gis["stats"]["morans_i_failing"] is not None and gis["stats"]["morans_p_permutation_999"] is not None
    hub = gis["hubs"][0]
    for k in ("name", "n", "people", "cost", "lat", "lon"):
        assert hub[k] is not None

    by = load("routes")["summary"]["by_status"]
    for k in ("Failing", "At-Risk"):
        assert by[k]["viable"] <= by[k]["total"]


def test_3d_failure_falls_back_to_2d():
    m3, app = (APP / "map3d.js").read_text(encoding="utf-8"), (APP / "app.js").read_text(encoding="utf-8")
    assert "onFail" in m3 and "onFail" in app and "onRecover" in app
    assert "document.hidden" in m3            # the slow-start clock must not run in a background tab


def test_every_system_result_has_a_reason():
    app = (APP / "app.js").read_text(encoding="utf-8")
    assert "Why selected" in app and "Why not selected" in app


def test_readme_has_no_repeated_table_rows():
    rows = [l for l in (ROOT / "README.md").read_text(encoding="utf-8").splitlines() if l.startswith("|") and not re.match(r"^\|[-| ]+\|$", l)]
    dupes = {l[:80] for l in rows if rows.count(l) > 1}
    assert not dupes, dupes
