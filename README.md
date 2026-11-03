# Xylem

**Give it a budget and an equity rule. It returns the set of California drinking water systems that reaches the most people, and shows how stable that answer is.**

Xylem is a web app built on the State Water Board's own SAFER, Affordability and Cost Assessment data. It turns "which water systems are failing" into "where does the next dollar reach the most people", with the trade-offs left visible.

## Run it

```bash
pip install -r requirements.txt
python pipeline/fetch_data.py        # download raw data (or use the committed data/raw)
python pipeline/build.py             # join, cost model, optimizer, stress test, validation (about 20 s)
python pipeline/fetch_boundaries.py  # service-area polygons
python pipeline/routing.py           # consolidation routes (downloads receiver boundaries once, about 30 s)
python -m pytest tests -q            # 30 tests, including Python/JS optimizer parity
cd app && python -m http.server 8765 # open http://localhost:8765
```

Scenarios are shareable: the controls are stored in the URL (for example `#b=1000&l=2&a=0.5&r=0.3`).

## What it does

- **Optimizer.** For a budget, picks the Failing and At-Risk systems that maximize benefit = people served × status weight × (1 + equity weight × equity index). An exact 0/1 knapsack (dynamic programming), run in your browser. Controls: budget, equity weight, how much At-Risk counts relative to Failing, and a share of budget reserved for small systems.
- **Cost model.** The state publishes no per-system remediation cost as data. We apply its published average cost per service connection by system size (2024 Cost Assessment, Table 7) to each system, then scale to the state's $5.386B total.
- **Infrastructure routing.** For each small Failing or At-Risk system, finds the larger healthy system the state's model would connect it to (within 3 miles), draws the route and costs it with the state's own unit costs ($220/ft pipe, service lines, connection fees, CEQA, contingency). Switch it on to let the optimizer use the route cost where it is cheaper. Straight-line distance × 1.3 stands in for the street route, and there is no regional cost adjustment. 491 of 951 eligible systems have a viable route; the state's own 2024 model found consolidation viable for about 44% of Failing and 43% of At-Risk systems, close to our 46% and 46% (different year and list, so agreement is encouraging, not proof). Routing changes the plan modestly: at $2B with a 30% small-system reserve it funds 8 more systems.
- **Uncertainty.** 200 stress-test scenarios vary costs and weights and re-run the optimizer. Each system shows how often it is still funded.
- **Who is left out.** A tab lists the Failing systems the plan does not fund, because pure cost-effectiveness skips small, expensive systems.
- **Map** with the State Water Board's service-area boundaries (1,061 of 1,062 target systems), colored by plan, status or stability.

## Results (2026-11-02 SAFER snapshot, 1,062 Failing or At-Risk systems, 1.93M people)

| Budget | Optimizer reaches | Status-first reaches | Ratio |
|---|---|---|---|
| $100M | 221,298 | 168,274 | 1.32× |
| $250M | 506,981 | 292,238 | 1.73× |
| $500M | 966,559 | 358,300 | 2.70× |
| $1B | 1,549,044 | 406,664 | 3.81× |
| $2B | 1,836,838 | 944,874 | 1.94× |

Status-first means Failing before At-Risk, largest system first. It is a simple stand-in, not the state's real process, which also weighs readiness, willingness and technical-assistance needs. These are modelled results on modelled costs.

## How well is it tested?

| Check | Result |
|---|---|
| Cost model vs the state's 58 county totals | Rank correlation 0.88, Pearson 0.92 |
| Same check, magnitude | Median absolute error about 41% for counties over $10M. The raw model came out 1.47× the state total before scaling. |
| Ranking vs funding awarded since 2017 (AUC, 0.5 = no relationship) | 0.69 need-and-equity score, 0.65 efficiency, 0.65 population alone, 0.63 Failing flag alone |
| Optimizer vs brute force, budget never exceeded, JS port vs Python | Pass (24 tests) |

The AUC values are modest. Past funding reflects need, readiness and politics, not cost-effectiveness, so this shows the ranking is not pointing the wrong way. It does not show the optimizer is right. The county-level cost error is large, which is why every system carries a stability score instead of a single claimed answer.

## Honest limits

- **Costs are modelled, not quotes, and use 2024 averages.** The State Water Board says it did not update the Cost Assessment in 2025 or 2026.
- **179 systems have no SAFER status** and serve about 25M people (mostly the largest utilities). They are outside this analysis, so big-city need is understated.
- **1,028 systems have a missing economic status.** Their equity index uses the remaining components.
- **At-Risk is a score, not a confirmed contaminant**, so it is discounted by default.
- **At $1B and $2B the optimizer's share of people in disadvantaged areas is slightly below the status-first baseline** (73% vs 74%, 69% vs 72%). It reaches far more people overall, but it is not uniformly better on that measure.
- Not modelled: readiness, willingness to consolidate, ongoing operations cost, state small systems and domestic wells.

See [NOVELTY.md](NOVELTY.md) for prior work and what is different here.

## Repository

- `app/`: static web app (`index.html`, `app.js`, `optimizer.js`) and its data
- `pipeline/`: data fetch, cost model, optimizer reference implementation, build, boundaries
- `tests/`: pytest suite and the Node parity script
- `data/raw/`: source files; `data/cost_tables.json`: the state's Tables 7 and 9, transcribed by hand and checked against its totals
- `DataSets.md`: data sources
