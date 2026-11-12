import itertools
import json
import random
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from costmodel import size_bin, per_connection, system_cost, TABLES  # noqa: E402
from optimizer import knapsack, optimize, units, UNIT, greedy_by_population  # noqa: E402


# ---------- cost model ----------
def test_county_transcription_matches_state_totals():
    c = TABLES["county_totals_musd"]
    assert len(c) == 58
    assert round(sum(v[0] for v in c.values())) == 2493   # Table 9 Failing total
    assert round(sum(v[1] for v in c.values())) == 2883   # Table 9 At-Risk total


@pytest.mark.parametrize("conn,idx", [(1, 0), (100, 0), (101, 1), (500, 1), (501, 2), (1000, 2), (1001, 3),
                                      (3300, 3), (3301, 4), (30000, 4), (30001, 5), (500000, 5)])
def test_size_bins(conn, idx):
    assert size_bin(conn) == idx


def test_per_connection_values_from_table7():
    assert per_connection(50, "Failing") == 139954
    assert per_connection(50, "At-Risk") == 252513
    assert per_connection(40000, "Failing") == 1409
    assert per_connection(40000, "At-Risk") == 1409   # state lists N/A; documented assumption
    assert system_cost(200, "Failing") == 200 * 31800


# ---------- optimizer ----------
def brute(costs, benefits, budget):
    best, best_set = 0, ()
    n = len(costs)
    for r in range(n + 1):
        for comb in itertools.combinations(range(n), r):
            if sum(units(costs[i]) * UNIT for i in comb) <= (budget // UNIT) * UNIT:
                v = sum(benefits[i] for i in comb)
                if v > best:
                    best, best_set = v, comb
    return best


def test_knapsack_matches_brute_force():
    rnd = random.Random(1)
    for _ in range(40):
        n = rnd.randint(1, 9)
        costs = [rnd.randint(1, 12) * UNIT for _ in range(n)]
        ben = [rnd.randint(1, 100) for _ in range(n)]
        budget = rnd.randint(1, 40) * UNIT
        pick = knapsack(costs, ben, budget)
        assert sum(units(costs[i]) for i in pick) * UNIT <= budget
        assert sum(ben[i] for i in pick) == pytest.approx(brute(costs, ben, budget))


def test_optimizer_never_overspends_and_is_monotone():
    rnd = random.Random(2)
    costs = [rnd.randint(1, 30) * UNIT for _ in range(60)]
    ben = [rnd.random() * 1000 for _ in range(60)]
    conns = [rnd.randint(5, 900) for _ in range(60)]
    prev = 0
    for b in [5, 10, 20, 40, 80, 160]:
        budget = b * UNIT
        pick = optimize(costs, ben, conns, budget)
        assert sum(units(costs[i]) * UNIT for i in pick) <= budget
        v = sum(ben[i] for i in pick)
        assert v >= prev
        prev = v


def test_small_reserve_funds_small_systems():
    costs = [UNIT * 4] * 4 + [UNIT] * 4
    ben = [100] * 4 + [1] * 4
    conns = [5000] * 4 + [50] * 4
    no = optimize(costs, ben, conns, UNIT * 8, 0.0)
    yes = optimize(costs, ben, conns, UNIT * 8, 0.5)
    assert sum(1 for i in no if conns[i] <= 500) == 0
    assert sum(1 for i in yes if conns[i] <= 500) >= 1


def test_optimizer_beats_status_first_on_people_reached():
    rnd = random.Random(3)
    n = 80
    costs = [rnd.randint(2, 60) * UNIT for _ in range(n)]
    pops = [rnd.randint(10, 20000) for _ in range(n)]
    failing = [rnd.random() < 0.4 for _ in range(n)]
    ben = [p * (1 if f else 0.5) for p, f in zip(pops, failing)]
    budget = sum(costs) * 0.2
    opt = optimize(costs, ben, [100] * n, budget)
    base = greedy_by_population(costs, pops, failing, budget)
    assert sum(ben[i] for i in opt) >= sum(ben[i] for i in base)


def test_js_port_matches_python_reference():
    rnd = random.Random(4)
    n = 120
    costs = [rnd.randint(1, 50) * UNIT + rnd.randint(0, UNIT - 1) for _ in range(n)]
    ben = [round(rnd.random() * 5000, 3) for _ in range(n)]
    conns = [rnd.randint(5, 1500) for _ in range(n)]
    cases = []
    for budget in (10 * UNIT, 100 * UNIT, 400 * UNIT):
        for reserve in (0.0, 0.3):
            cases.append({"budget": budget, "reserve": reserve,
                          "py": optimize(costs, ben, conns, budget, reserve)})
    script = (ROOT / "tests" / "parity.js")
    payload = json.dumps({"costs": costs, "ben": ben, "conns": conns, "cases": cases})
    out = subprocess.run(["node", str(script)], input=payload, capture_output=True, text=True, check=True)
    assert json.loads(out.stdout) == [True] * len(cases)


# ---------- built outputs ----------
@pytest.fixture(scope="module")
def built():
    sysj = json.loads((ROOT / "app/data/systems.json").read_text())
    summ = json.loads((ROOT / "app/data/summary.json").read_text())
    return sysj, summ


def test_outputs_consistent_with_source(built):
    import pandas as pd
    sysj, summ = built
    d = pd.read_csv(ROOT / "data/raw/SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
    target = d[d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"])]
    assert len(sysj) == len(target)
    assert sum(s["pop"] for s in sysj) == int(target.POPULATION.sum())
    assert sum(1 for s in sysj if s["failing"]) == int((target.FINAL_SAFER_STATUS == "Failing").sum())
    assert {s["id"] for s in sysj} == set(target.WATER_SYSTEM_NUMBER)
    assert summ["all_systems"] == len(d)


def test_costs_scaled_to_state_total(built):
    sysj, summ = built
    total = sum(s["cost"] for s in sysj) / 1e6
    assert total == pytest.approx(TABLES["state_total_musd"]["total"], rel=0.001)
    assert all(s["cost"] > 0 and s["lo"] < s["cost"] < s["hi"] for s in sysj)


def test_stability_probabilities_valid_and_monotone_in_budget(built):
    sysj, summ = built
    for s in sysj:
        assert len(s["p"]) == len(summ["budgets_musd"])
        assert all(0 <= x <= 1 for x in s["p"])
    # more budget should not make the average system less likely to be funded
    means = [sum(s["p"][k] for s in sysj) / len(sysj) for k in range(len(summ["budgets_musd"]))]
    assert means == sorted(means)


def test_optimizer_reaches_more_people_than_status_first_at_every_budget(built):
    _, summ = built
    for row in summ["comparison"]:
        assert row["optimizer"]["people"] >= row["status_first_baseline"]["people"]
        assert row["optimizer"]["spent_musd"] <= row["budget_musd"]


def test_polygon_coverage_reported(built):
    cov = json.loads((ROOT / "app/data/boundary_coverage.json").read_text())
    gj = json.loads((ROOT / "app/data/boundaries.geojson").read_text())
    assert cov["with_polygon"] == len(gj["features"])
    assert cov["with_polygon"] / cov["targets"] > 0.95
