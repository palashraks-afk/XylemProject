# Xylem

**A placement map for water funding. Set a budget and an equity rule; Xylem returns the California drinking water systems that reach the most people, shows how each would be fixed, and says how stable the answer is.**

Built on the State Water Board's own SAFER (2024 to 2026), Affordability and Cost Assessment data, for the Xylem Global Student Innovation Challenge (Water Access).

## Run it

```bash
pip install -r requirements.txt
python pipeline/fetch_data.py        # SAFER 2026 + affordability + cost tables (prior-year risk files: see DataSets.md)
python pipeline/ml.py                # failure forecast and temporal backtest (about 1 min)
python pipeline/build.py             # join, cost model, optimizer, stress test, validation (about 20 s)
python pipeline/fetch_boundaries.py  # service-area polygons
python pipeline/routing.py           # consolidation routes (about 30 s first run)
python pipeline/gis.py               # county layer, Moran's I, Gi* hotspots, hubs (about 30 s)
python -m pytest tests -q            # tests, including Python/JS optimizer parity
cd app && python -m http.server 8765 # open http://localhost:8765
```

Scenarios are shareable: the controls are stored in the URL, and a plan can be downloaded as CSV.

## What it does

- **Placement optimizer.** For a budget, picks the Failing and At-Risk systems that maximize benefit = people served × status value × (1 + equity weight × equity index). An exact 0/1 knapsack, run in the browser. Controls: budget (with presets), equity weight, a reserve for small systems.
- **Forecast (machine learning).** At-Risk systems are valued at their forecast chance of becoming Failing within a look-ahead you choose, instead of an arbitrary discount. Strict temporal backtest below.
- **Cost model.** The state publishes no per-system remediation cost as data. We apply its published average cost per service connection by system size (2024 Cost Assessment, Table 7) and scale to its $5.386B total.
- **Infrastructure routing.** For each small Failing or At-Risk system, finds the larger healthy system the state's model would connect it to (within 3 miles), draws the route and costs it with the state's own unit costs. Switch it on to let the optimizer use the route cost where cheaper.
- **GIS.** Service-area polygons, county shading, Moran's I clustering test, Getis-Ord Gi* hotspots, and regional hubs (healthy systems that could absorb three or more neighbours).
- **Uncertainty.** 200 stress-test scenarios vary costs, equity weight and forecast horizon; each system shows how often it is still funded.
- **Who is left out.** A tab lists the Failing systems a plan does not fund.

## Results (2026-11-02 SAFER snapshot, 1,062 Failing or At-Risk systems, 1.93M people)

| Budget | Optimizer reaches | Status-first reaches | Ratio |
|---|---|---|---|
| $100M | 171,738 | 168,274 | 1.02× |
| $250M | 309,928 | 292,238 | 1.06× |
| $500M | 763,047 | 358,300 | 2.13× |
| $1000M | 1,313,200 | 406,664 | 3.23× |
| $2000M | 1,805,051 | 944,874 | 1.91× |

Status-first means Failing before At-Risk, largest system first. It is a simple stand-in, not the state's real process, which also weighs readiness, willingness and technical-assistance needs. At small budgets the optimizer is barely better than that baseline; the advantage appears from about $500M. All results are modelled, on modelled costs.

## How well is it tested?

| Check | Result |
|---|---|
| Failure forecast, trained 2024→2025, tested 2025→2026 (120 onsets in 2,616 systems) | AUC 0.685 (95% interval 0.638 to 0.728) vs 0.618 for SAFER status alone and 0.606 for the total risk score |
| Same test, ranking | Observed onset rate rises from 0.6% in the lowest-risk fifth to 9.2% in the highest |
| Same test, levels | Predicted probabilities run low because the onset rate rose from 2.6% to 4.6% between years; forecasts are rescaled and approximate |
| Spatial features (Failing neighbours within 10 and 25 km) added to the forecast | No gain (AUC 0.683 to 0.685) |
| Cost model vs the state's 58 county totals | Rank correlation 0.88, Pearson 0.92; median absolute error about 41%; raw model 1.47× the state total before scaling |
| Routing vs the state's own consolidation share | Viable for 46% of Failing and 46% of At-Risk systems vs the state's 44% and 43% (different year and list) |
| Ranking vs funding awarded since 2017 (AUC) | 0.72 for the need-and-equity score |
| Clustering of Failing systems | Moran's I = 0.094, permutation p = 0.001: significant but weak |
| Optimizer vs brute force, budget never exceeded, JS port vs Python | Pass (see `tests/`) |

The forecast gain is modest and most failing onsets are not predicted. Past funding reflects need, readiness and politics, so the funding check shows the ranking is not pointing the wrong way, not that the optimizer is right.

## Honest limits

- **Costs are modelled, not quotes, and use 2024 averages.** The State Water Board says it did not update the Cost Assessment in 2025 or 2026.
- **179 systems have no SAFER status** and serve about 25M people (mostly the largest utilities). They are outside this analysis, so big-city need is understated.
- **1,028 systems have a missing economic status.** Their equity index uses the remaining components.
- **Routes are straight-line × 1.3 stand-ins for street routes**, with no regional cost adjustment, and receiver capacity is not modelled.
- **California only.** The method needs a per-system status, population, location and a unit-cost source. See `PORTABILITY.md` for what other regions would need; nothing outside California is built.
- **No real-user feedback yet.**
- Not modelled: readiness to build, willingness to consolidate, ongoing operations cost, state small systems and domestic wells, sensors and groundwater.

See [NOVELTY.md](NOVELTY.md) for prior work, [GRADING.md](GRADING.md) for the scored self-assessment and what was fixed, and [PORTABILITY.md](PORTABILITY.md).

## Repository

- `app/`: static web app (`index.html`, `app.js`, `optimizer.js`) and its data
- `pipeline/`: data fetch, cost model, optimizer reference implementation, forecast, build, routing, GIS
- `tests/`: pytest suite and the Node parity script
- `data/raw/`: source files; `data/cost_tables.json`: the state's Tables 7 and 9, transcribed by hand and checked against its totals
- `DataSets.md`: data sources
