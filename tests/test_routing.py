import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from routing import capital_cost, viable  # noqa: E402


def test_capital_cost_matches_hand_calculation_adjacent():
    # 100 connections, adjacent (1,000 ft assumed): pipeline 220k, service 620k, fees 543.7k, admin 15% of construction, CEQA 25k
    construction = 1000 * 220 + 6200 * 100
    subtotal = construction + 5437 * 100 + 0.15 * construction + 25_000
    expected = subtotal * 1.45 * 1.031
    total, parts = capital_cost(100, 0, "intersect")
    assert total == pytest.approx(expected)
    assert parts["pipeline"] == 220_000


def test_route_cost_adds_distance_and_higher_ceqa():
    a, _ = capital_cost(100, 0, "intersect")
    b, parts = capital_cost(100, 5280, "route")   # one mile of route
    assert parts["pipeline"] == (1000 + 5280) * 220
    assert b > a


def test_viability_thresholds():
    assert viable(100, 9_599_999)          # < $96,000 per connection
    assert not viable(100, 9_600_000)
    assert viable(75, 7_199_999)           # <= 75 connections: total under $7.2M
    assert not viable(75, 7_200_000)
    assert not viable(200, 200 * 96_000)


@pytest.fixture(scope="module")
def routed():
    data = json.loads((ROOT / "app/data/routes.json").read_text())
    systems = {s["id"]: s for s in json.loads((ROOT / "app/data/systems.json").read_text())}
    return data, systems


def test_routes_respect_state_rules(routed):
    data, systems = routed
    for pid, r in data["routes"].items():
        s = systems[pid]
        assert s["conn"] <= (1000 if s["failing"] else 500)             # joining-size rule
        if r.get("receiver"):
            assert r["receiver_conn"] > s["conn"]                       # receiver is larger
            assert r["receiver_conn"] > 500
            if r["kind"] == "route":
                assert 0 <= r["route_mi"] <= 3.0   # can round to 0.00 when the point sits just outside a boundary
            if r["viable"]:
                assert viable(s["conn"], r["cost"])
        else:
            assert r["viable"] is False


def test_summary_counts_add_up(routed):
    data, _ = routed
    s = data["summary"]
    assert s["viable"] == sum(1 for r in data["routes"].values() if r["viable"])
    assert s["eligible"] == len(data["routes"])
    for st in s["by_status"].values():
        assert st["viable"] <= st["eligible"] <= st["total"]


def test_viable_share_is_near_the_states_own_modelled_share(routed):
    data, _ = routed
    f = data["summary"]["by_status"]["Failing"]
    a = data["summary"]["by_status"]["At-Risk"]
    # state 2024: consolidation modelled for 44% of Failing and 43% of At-Risk; different year and list, so a loose band
    assert 0.30 <= f["viable"] / f["total"] <= 0.60
    assert 0.30 <= a["viable"] / a["total"] <= 0.60
