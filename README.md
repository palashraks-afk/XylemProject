# Xylem

**A placement map for water funding. Set a budget and an equity rule; Xylem returns the California drinking water systems that reach the most people, shows how each would be fixed, and says how stable the answer is.**

Built on the State Water Board's own SAFER (2024 to 2026), Affordability and Cost Assessment data, for the Xylem Global Student Innovation Challenge (Water Access).

## Run it

```bash
pip install -r requirements.txt
python pipeline/fetch_data.py        # SAFER 2026 + affordability + cost tables (prior-year risk files: see DataSets.md)
python pipeline/fetch_extra.py       # 23 more public datasets (EPA, State Water Board, DWR, CDC, NOAA, OEHHA, NIFC, Census), about 1 min
python pipeline/ml.py                # failure forecast and temporal backtest (about 1 min)
python pipeline/build.py             # join, cost model, optimizer, stress test, validation (about 20 s)
python pipeline/fetch_boundaries.py  # service-area polygons
python pipeline/routing.py           # consolidation routes (about 30 s first run)
python pipeline/gis.py               # county layer, Moran's I, Gi* hotspots, hubs (about 30 s)
python pipeline/fetch_infrastructure.py   # real canals, aqueducts, plants and towers from OpenStreetMap, for the 3D map
python -m pytest tests -q            # tests, including Python/JS optimizer parity
cd app && python -m http.server 8765 # open http://localhost:8765
```

Scenarios are shareable: the controls are stored in the URL, and a plan can be downloaded as CSV.

## What it does

- **3D map (default).** Real terrain (SRTM), satellite imagery, and every California city's buildings, with the plan placed on it as extruded water towers, plus real canals, aqueducts, tunnels, treatment plants and water towers from OpenStreetMap. The 2D map is one click away. The infrastructure is context only; it does not enter the optimizer or the costs.
- **Judges' view.** A header button (or `?judges=1`) opens a five-step tour that drives the live 3D map, then the three challenge criteria answered with figures read from the app's own data files and a "Not claimed" line for each. Every system's result also carries a plain-language reason. If 3D cannot load (no WebGL, a tile server down) the app falls back to the 2D map.
- **Placement optimizer.** For a budget, picks the Failing and At-Risk systems that maximize benefit = people served × status value × (1 + equity weight × equity index). An exact 0/1 knapsack, run in the browser. Controls: budget (with presets), equity weight, a reserve for small systems.
- **More data.** 23 public datasets are joined to every system (violation and enforcement history, facilities, rates, school lead tests, shortage scores, dry wells, groundwater basins, social vulnerability, CalEnviroScreen, weather and drought, wildfires, terrain, nearby infrastructure). The equity index now has six components, two of them from this data.
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
| $250M | 309,772 | 292,238 | 1.06× |
| $500M | 539,915 | 358,300 | 1.51× |
| $1000M | 1,084,241 | 406,664 | 2.67× |
| $2000M | 1,685,510 | 944,874 | 1.78× |

The optimizer's lead depends on how At-Risk systems are valued: the forecast gives each a chance of failing, so a smoother forecast narrows it. Status-first means Failing before At-Risk, largest system first. It is a simple stand-in, not the state's real process, which also weighs readiness, willingness and technical-assistance needs. At small budgets the optimizer is barely better than that baseline; the advantage appears from about $500M. All results are modelled, on modelled costs.

## How well is it tested?

| Check | Result |
|---|---|
| Failure forecast, trained 2024→2025, tested 2025→2026 (120 onsets in 2,616 systems) | AUC 0.771 (95% interval 0.722 to 0.816) for an ensemble of logistic regression, gradient boosting, random forest, extra trees and a stacked logistic model, vs 0.618 for SAFER status alone and 0.606 for the total risk score. Before the extra public data the same kind of ensemble scored 0.691. Single models: logistic 0.707, boosting 0.761, random forest 0.773, extra trees 0.781, stacked 0.766 |
| Same test, ranking | Observed onset rate rises from 0.4% in the lowest-risk fifth to 12.8% in the highest (ensemble ranking). The top 10% of systems catch 40.0% of onsets, up from 22.5% before the extra data; average precision 0.246 vs 0.101 |
| Same test, levels | Predicted probabilities run low because the onset rate rose from 2.6% to 4.6% between years; forecasts are rescaled and approximate |
| Spatial features (Failing neighbours within 10 and 25 km) added to the forecast | No gain (gradient boosting AUC 0.744 without, 0.739 with) |
| Stage-1 model: new health-based violation in the next 12 months, ensemble tuned on 2021 to 2023 and tested on 2024 and 2025 | AUC 0.91, 0.923, 0.918, 0.929; a plain count of past violations scores 0.869, 0.849, 0.886, 0.874 |
| Model comparison | 20 stage-1 candidates and 31 stage-2 candidates compared; tuning changed little (every well-built stage-1 model within about 0.01 AUC). Within-year cross-validation ranked the logistic model first (CV AUC 0.908) but it scored 0.707 on the held-out year, so the final model is the ensemble of the best of each family. The ensemble's raw scores ran about 3× too high; an isotonic map fitted on 2021 to 2023 only cuts the Brier score on the test years (0.0292 to 0.0141 in 2025) and is applied to the violation chance shown in the app |
| Value of the extra data | Stage 1 with all sources scores AUC 0.9154 vs 0.7705 with system size alone; see the source table in the app's Method tab |
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

## Placement quality control

All 1,062 Failing or At-Risk systems have coordinates inside California and inside their registered county. 27 of the 1,061 that have a service-area polygon had a point more than about 0.5 km outside their own polygon (3 of them by more than 25 km). `pipeline/coords.py` moves those points inside the state's boundary, which is also what the consolidation method measures from, and marks the 3 large moves as uncertain in `systems.json` (`loc: "polygon_far"`), because either the point or the polygon could be wrong. `tests/test_coords.py` checks the result.

## Speed

The exact optimizer runs in a Web Worker (`app/worker.js`), the hidden 2D map is no longer restyled while the 3D map is showing, and the 3D map rebuilds its heavy layers (towers, service areas) only after a slider has been still for 150 ms, reusing prebuilt tower geometry. In one browser run of ten slider moves, main-thread blocking fell from about 1,200 ms (13 long tasks) to about 300 ms (3 long tasks) and mean time to a new plan from 212 ms to 137 ms. A single measurement in one browser pane, not a benchmark.
