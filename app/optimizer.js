/* Budget-constrained funding optimizer: exact 0/1 knapsack by dynamic programming.
 * Port of pipeline/optimizer.py; tests/test_optimizer_parity.py checks the two agree. */
(function (root) {
  const UNIT = 250000;       // cost granularity ($); costs round UP so a plan never overspends
  const SMALL_MAX_CONN = 500;

  const units = (c) => Math.max(1, Math.ceil(c / UNIT));

  function knapsack(costs, benefits, budget) {
    const B = Math.floor(budget / UNIT);
    const n = costs.length;
    if (B <= 0 || n === 0) return [];
    const c = costs.map(units);
    const dp = new Float64Array(B + 1);
    const keep = new Uint8Array(n * (B + 1));
    for (let i = 0; i < n; i++) {
      const ci = c[i], bi = benefits[i];
      if (ci > B || bi <= 0) continue;
      const row = i * (B + 1);
      for (let j = B; j >= ci; j--) {
        const cand = dp[j - ci] + bi;
        if (cand > dp[j]) { dp[j] = cand; keep[row + j] = 1; }
      }
    }
    let j = B; const chosen = [];
    for (let i = n - 1; i >= 0; i--) {
      if (keep[i * (B + 1) + j]) { chosen.push(i); j -= c[i]; }
    }
    return chosen.reverse();
  }

  function optimize(costs, benefits, conns, budget, smallReserve) {
    let chosen = [];
    let spentSmall = 0;
    if (smallReserve > 0) {
      const small = [];
      for (let i = 0; i < costs.length; i++) if (conns[i] <= SMALL_MAX_CONN) small.push(i);
      const pick = knapsack(small.map((i) => costs[i]), small.map((i) => benefits[i]), budget * smallReserve);
      chosen = pick.map((k) => small[k]);
      spentSmall = chosen.reduce((s, i) => s + units(costs[i]) * UNIT, 0);
    }
    const taken = new Set(chosen);
    const rest = [];
    for (let i = 0; i < costs.length; i++) if (!taken.has(i)) rest.push(i);
    const pick = knapsack(rest.map((i) => costs[i]), rest.map((i) => benefits[i]), budget - spentSmall);
    chosen = chosen.concat(pick.map((k) => rest[k]));
    return chosen.sort((a, b) => a - b);
  }

  // What a status-first process does: Failing before At-Risk, largest first, until the money runs out.
  function statusFirst(costs, pops, failing, budget) {
    const order = costs.map((_, i) => i).sort((a, b) =>
      (failing[b] - failing[a]) || (pops[b] - pops[a]) || (a - b));
    const chosen = []; let spent = 0;
    for (const i of order) if (spent + costs[i] <= budget) { chosen.push(i); spent += costs[i]; }
    return chosen.sort((a, b) => a - b);
  }

  const api = { UNIT, SMALL_MAX_CONN, knapsack, optimize, statusFirst };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.XylemOpt = api;
})(typeof window !== "undefined" ? window : globalThis);
