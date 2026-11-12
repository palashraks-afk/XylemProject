"""Budget-constrained funding optimizer (0/1 knapsack, exact dynamic programming).

Reference implementation. app/optimizer.js is a port of this and tests/test_optimizer_parity.py
checks the two agree on the same inputs.
"""
import math
import numpy as np

UNIT = 250_000  # cost granularity in dollars; costs are rounded UP so a plan never overspends
SMALL_MAX_CONN = 500


def units(cost):
    return max(1, math.ceil(cost / UNIT))


def knapsack(costs, benefits, budget):
    """Return indices of the chosen items maximizing total benefit with total cost <= budget."""
    B = int(budget // UNIT)
    n = len(costs)
    if B <= 0 or n == 0:
        return []
    c = [units(x) for x in costs]
    dp = np.zeros(B + 1)
    keep = np.zeros((n, B + 1), dtype=bool)
    for i in range(n):
        ci = c[i]
        if ci > B or benefits[i] <= 0:
            continue
        cand = dp[:-ci] + benefits[i]
        better = cand > dp[ci:]
        keep[i, ci:] = better
        dp[ci:] = np.where(better, cand, dp[ci:])
    j, chosen = B, []
    for i in range(n - 1, -1, -1):
        if keep[i, j]:
            chosen.append(i)
            j -= c[i]
    return chosen[::-1]


def optimize(costs, benefits, conns, budget, small_reserve=0.0):
    """Optionally reserve a share of the budget for small systems (<= 500 connections)."""
    chosen = []
    spent_small = 0
    if small_reserve > 0:
        small = [i for i in range(len(costs)) if conns[i] <= SMALL_MAX_CONN]
        pick = knapsack([costs[i] for i in small], [benefits[i] for i in small], budget * small_reserve)
        chosen += [small[k] for k in pick]
        spent_small = sum(units(costs[i]) * UNIT for i in chosen)
    taken = set(chosen)
    rest = [i for i in range(len(costs)) if i not in taken]
    pick = knapsack([costs[i] for i in rest], [benefits[i] for i in rest], budget - spent_small)
    chosen += [rest[k] for k in pick]
    return sorted(chosen)


def greedy_by_population(costs, pops, status_failing, budget):
    """Baseline: what a status-first process does. Failing systems before At-Risk, largest first."""
    order = sorted(range(len(costs)), key=lambda i: (not status_failing[i], -pops[i]))
    chosen, spent = [], 0
    for i in order:
        if spent + costs[i] <= budget:
            chosen.append(i)
            spent += costs[i]
    return sorted(chosen)
