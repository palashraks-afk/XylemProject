import json
import sys
from pathlib import Path

import pytest
from shapely.geometry import shape, Point

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from coords import TOLERANCE_DEG, FAR_KM  # noqa: E402


@pytest.fixture(scope="module")
def systems():
    return json.loads((ROOT / "app/data/systems.json").read_text())


@pytest.fixture(scope="module")
def polys():
    gj = json.loads((ROOT / "app/data/boundaries.geojson").read_text())
    return {f["properties"]["id"]: shape(f["geometry"]) for f in gj["features"]}


def test_every_system_is_placed_in_california(systems):
    for s in systems:
        assert 32.4 <= s["lat"] <= 42.1 and -124.6 <= s["lon"] <= -114.1, s["id"]


def test_every_point_sits_inside_its_own_service_area(systems, polys):
    """After correction no system with a boundary may sit more than about half a kilometre outside it."""
    for s in systems:
        g = polys.get(s["id"])
        if g is None:
            continue
        if not g.is_valid:
            g = g.buffer(0)
        assert g.buffer(TOLERANCE_DEG * 1.1).contains(Point(s["lon"], s["lat"])), (s["id"], s["name"])


def test_moved_systems_are_labelled_and_far_moves_flagged(systems):
    moved = [s for s in systems if s.get("loc")]
    assert 0 < len(moved) < 0.1 * len(systems)           # a small minority was moved
    for s in moved:
        assert s["moved"] > 0
        assert (s["loc"] == "polygon_far") == (s["moved"] > FAR_KM)
    for s in systems:
        if not s.get("loc"):
            assert s.get("moved") in (None, 0)
