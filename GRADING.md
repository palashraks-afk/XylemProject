# Self-grading, weaknesses and fixes

Graded with the project scoring template (0 to 10, evidence required, a gap named for every score below 8). The profile-fit criterion is left out because the team background was not provided, so the mean is over 10 criteria. The challenge's own judging criteria are Impact, Challenge Fit and Feasibility, and Innovation; they are mapped at the end.

Scores are the author's (Claude's) judgment from the repository and test output, not an outside judge's. Round 1 is a reconstruction of the state before this loop.

## Round 1 (before the ML, GIS and UX pass)

| Criterion | Score | Weakness found |
|---|---|---|
| Impact | 7 | Real data, 1.93M people; no user has seen it |
| Creativity | 7 | Optimizer plus routing is a good combination |
| Novelty | 5 | SAFER dashboard and Pacific Institute analysis exist |
| Fit to the brief | 7 | Fits Water Access; the "global" angle is unaddressed |
| Scientific rigor | 6 | At-Risk valued at an arbitrary 0.5; no real backtest; county cost error about 41% |
| Depth of real data | 7 | One year of status data |
| Feasibility | 5 | Runs locally only; not hosted |
| Interactive and visual | 7 | Long control panel; no presets; no export |
| Technical depth | 7 | Spatial analysis was only a map |
| Uniqueness | 6 | Hard to tell apart from the state's dashboard at a glance |
| **Mean (10)** | **6.4** | |

## What was changed

| Weakness | Fix | Evidence |
|---|---|---|
| Arbitrary At-Risk weight, no backtest | Failure forecast, strict temporal split (train 2024→2025, test 2025→2026). At-Risk valued at forecast chance of failing within a chosen horizon | AUC 0.685 (0.638 to 0.728) vs 0.618 for status alone; ranking monotone by quintile (0.6% to 9.2%); `pipeline/ml.py`, Method tab |
| Spatial analysis shallow | Moran's I, Getis-Ord Gi* hotspots, county layer, regional hubs | I = 0.094, p = 0.001; 132 hotspots at p<0.05; 50 hubs; `pipeline/gis.py` |
| Does space help the forecast? | Tried Failing-neighbour counts at 10 and 25 km | AUC 0.683 to 0.685: no gain, reported |
| Control overload, no presets or export | Grouped collapsible controls, budget presets, CSV download, county shading, layer toggles | `app/index.html`, app verified in browser |
| Global angle unaddressed | `PORTABILITY.md` states exactly what another region needs, and that nothing outside California is built | File |
| Not hosted | GitHub Pages workflow added (`.github/workflows/pages.yml`); needs the repository owner to enable Pages | File; not yet live |
| README numbers could drift from results | Test compares the README results table to `summary.json` | `tests/test_ml_gis.py` |

## Round 2 (now)

| Criterion | Score | Evidence | Gap and what would fix it |
|---|---|---|---|
| Impact | 7 | 1.93M people at risk; $/person and plan CSV a funder can use | No real-user reaction. Fix: one reply from a water-board or community-water contact (draft in `OUTREACH.md`) |
| Creativity | 7 | Placement optimizer + forecast-valued prevention + state-method routing in one map | Components are individually standard. Fix: a sharper user-facing story |
| Novelty | 6 | No tool found combining budget optimizer, forecast and state-method routing (two searches, not proof) | Prior art exists; novelty is the combination |
| Fit to the brief | 8 | Water Access; affordability and equity built in; the state's own method | "Global" unaddressed beyond `PORTABILITY.md` |
| Scientific rigor | 7 | Temporal backtest with intervals and ablation; county cost calibration; routing checked against the state's share; failures reported | Forecast gain modest; levels drift; costs 2024-based. Fix: a second backtest year when 2027 data exists |
| Depth of real data | 8 | Three years of SAFER risk files, affordability, state cost tables, 1,061 polygons, county layer | Costs are modelled, not observed |
| Feasibility | 6 | 38 tests pass; runs in a browser | Not hosted; no user trial; routes are straight-line stand-ins. Fix: enable Pages, one trial |
| Interactive and visual | 7 | Map, presets, layers, CSV, shareable links; no console errors | Judged from the author's own screenshots in a narrow pane; needs a real look at desktop and phone |
| Technical depth | 8 | Exact optimizer with a Python/JS parity test, ML backtest, spatial statistics, routing | Sensors and groundwater are not built |
| Uniqueness | 7 | "Set a budget, see where it goes" is memorable | Still a California-only demo |
| **Mean (10)** | **7.1** | | Not 9. A 9 needs a real user, a live link, and a result that holds up outside California |

## Newly found weakness (worth stating plainly)

With forecast-based values, **at budgets of $100M and $250M the optimizer reaches only 1.02× and 1.06× the people a status-first process does**; the advantage appears from about $500M (2.1×). An earlier version of this README claimed 1.3× to 3.8× using an arbitrary At-Risk discount. That claim was withdrawn.

## Against the challenge's three criteria

| Criterion | Score | Why |
|---|---|---|
| Impact | 7 | Real reach in California; no user evidence; global market unproven |
| Challenge fit and feasibility | 7 | Direct fit; works now; not hosted, routes approximate |
| Innovation | 6.5 | New combination on public data; prior art is close |

## Top open gaps

| Gap | Criterion | Fix | Owner | Due |
|---|---|---|---|---|
| No live link | Feasibility | Enable GitHub Pages (workflow is in the repo) | Repository owner | Before submission |
| No user feedback | Impact, Feasibility | Send the outreach note; quote any reply | Rahul | Nov 13 |
| California only | Impact, Fit | Prove the method on one non-California dataset, or say so in the pitch | Rahul | Nov 16 |
| Sensors and groundwater not built | Technical depth | Decide what they mean; build one | Rahul / Claude | Nov 15 |
| Look at the app on a real desktop and phone | Interactive | Open the live link on both | Rahul | After Pages |
