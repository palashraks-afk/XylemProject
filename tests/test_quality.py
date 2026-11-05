import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


@pytest.fixture(scope="module")
def q():
    r = subprocess.run(["node", str(ROOT / "tests" / "quality_check.js")], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def test_starting_tier_follows_the_device(q):
    t = q["tiers"]
    assert t["desktop"] == "high"
    assert t["laptop4"] == "balanced"
    assert t["phone"] == "balanced" or t["phone"] == "low"
    assert t["lowphone"] == "low"
    assert t["saveData"] == "low"
    assert t["userLow"] == "low"            # an explicit choice always wins
    assert t["unknown"] == "high"           # no information: do not penalise


def test_each_lower_tier_does_less_work(q):
    h, b, lo = q["settings"]["high"], q["settings"]["balanced"], q["settings"]["low"]
    assert h["pixelRatio"] > b["pixelRatio"] > lo["pixelRatio"] == 1
    assert h["terrain"] and b["terrain"] and not lo["terrain"]
    assert h["hillshade"] and not b["hillshade"] and not lo["hillshade"]
    assert h["buildings"] < b["buildings"] and lo["buildings"] is False
    assert h["unfundedTowers"] and b["unfundedTowers"] and not lo["unfundedTowers"]
    assert h["antialias"] and not b["antialias"]
    assert lo["maxPitch"] < h["maxPitch"]


def test_governor_steps_down_only_when_slow(q):
    assert q["lower"] == ["balanced", "low", "low"]
    assert q["smooth"] is False
    assert q["slowFiresAt"] == 9 and q["slowFiresOnce"] == 1
    assert q["mixedFiresWithinWindow"] is True
    assert q["stallsIgnored"] is True


def test_quality_script_is_loaded_before_the_map():
    html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    assert html.index("quality.js") < html.index("map3d.js")
