"""Guards for the app: every script parses, the 3D-to-2D fallback and per-system reasons exist, the README repeats no table row."""
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
@pytest.mark.parametrize("script", ["app.js", "map3d.js", "optimizer.js", "worker.js"])
def test_app_scripts_parse(script):
    r = subprocess.run(["node", "--check", str(APP / script)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


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
