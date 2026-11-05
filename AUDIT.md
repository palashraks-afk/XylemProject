# Audit: critiques and fixes in five areas

How to read this. Each row is one critique with its fix. **Evidence tags:** `V` = verified by running or measuring it, `R` = from reading the code or docs, `A` = an assumption or judgment call. **Status:** `Fixed` (in this branch), `Null` (tried, no gain, kept as a finding), `Open` (not done). Nothing here is padded to hit a count: 20 real items per area, not 100.

The author is Claude. The scores in `GRADING.md` are the author's judgment.

## 1. The forecast and placement model

| # | Critique | Evidence | Fix | Status |
|---|---|---|---|---|
| 1 | The headline AUC mixes easy cases (Not At-Risk vs At-Risk) with the ones the app actually uses | `V`: base-feature ensemble 0.689 on all non-failing systems but **0.633 (0.558 to 0.713) within At-Risk**; total-risk-score baseline falls to 0.49 there | Report the within-At-Risk AUC beside the headline | Open (needs the extra datasets to compute for the deployed model; disk was full) |
| 2 | Adding last year's status (change and sticky-failing flags) might capture momentum | `V`: 0.633 to 0.637 within At-Risk; overall fell 0.689 to 0.670 | None | Null |
| 3 | The model is trained on all systems, not on the population it scores | `V`: training on At-Risk and Potentially At-Risk only gives 0.646 within At-Risk, inside the noise (0.572 to 0.722) | None | Null |
| 4 | Lag features plus subset training together | `V`: 0.632 | None | Null |
| 5 | Only 120 failing onsets in the test year, so intervals are wide (0.722 to 0.816 for the deployed ensemble) | `R` README | Add a third backtest year when 2027 data exists | Open |
| 6 | Onset rate moved from 2.6% to 4.6% between years, so predicted levels run low | `R` README | Recalibrate yearly; report calibration per year | Open |
| 7 | Forecasts are rescaled to the pooled onset rate, so levels are approximate | `R` | Say so wherever a probability is shown | Fixed in docs |
| 8 | Spatial neighbour counts added nothing (0.744 to 0.739) | `R` README | Keep as a finding | Null |
| 9 | Valuing prevention at "chance of failing within N years × full benefit" is an assumption | `A` | The look-ahead slider exposes it; stress tests vary it | Fixed |
| 10 | The optimizer maximizes expected people; it ignores risk aversion | `A` | A risk-averse objective option | Open |
| 11 | No placement-level backtest (would the plan have chosen systems that later failed?) | `R` | Run the optimizer on 2025 data and score the picks on 2026 outcomes | Open |
| 12 | Equity index is an unweighted mean of components with hand-set scores (DAC = 1, 0.67, 0) | `R` | Sensitivity analysis on the component weights | Open |
| 13 | "Failing" reflects compliance and reporting, not only water safety | `A` | State it; add a health-based-only target (stage 1 already has one) | Open |
| 14 | The panel drops systems that enter or leave the list between years | `R` (3,202, 3,178 and 3,186 systems across files) | Report how many were dropped | Open |
| 15 | No uncertainty interval on a single system's forecast | `R` | Bootstrap intervals per system | Open |
| 16 | Remediation cost is a size-bin average, ignoring source type and treatment need | `R` | Use well count and source type from the facilities data | Open |
| 17 | The optimizer ignores shared pipelines (a hub serving ten systems is cheaper than ten routes) | `A` | Optimize hub bundles | Open |
| 18 | Model selection changed little: 51 candidates within about 0.01 AUC | `R` | Stop tuning; get new information instead | Fixed (decision) |
| 19 | Cost error (about 41% median by county) dominates forecast error in the plan | `V` earlier | Stress tests carry it; no new fix | Fixed (disclosed) |
| 20 | The "status-first" baseline is a stand-in, not the state's real process | `R` | Keep the caveat next to every comparison | Fixed |

## 2. Mapping and GIS

| # | Critique | Evidence | Fix | Status |
|---|---|---|---|---|
| 21 | 27 of 1,061 systems had a point outside their own service area | `V` | Moved inside the boundary (`pipeline/coords.py`); tested | Fixed |
| 22 | 3 of those moved more than 25 km, so either the point or the polygon is wrong | `V` | Flagged `polygon_far` in the data | Fixed |
| 23 | Routes are straight lines times 1.3, not street routes | `R` | Street routing for the funded set | Open |
| 24 | Receiver capacity is not modelled; a hub may not be able to take ten systems | `R` | Capacity check from facilities data | Open |
| 25 | No regional (RSMeans) cost adjustment, so high-cost areas are understated | `R` | Adopt the state's multipliers if published as data | Open |
| 26 | Service-area polygons simplified to about 300 m | `R` | Zoom-dependent detail | Open |
| 27 | Hotspot z-scores are not corrected for multiple testing | `R` | False-discovery-rate control | Open |
| 28 | Hotspots use people counts, not rates, so they track population | `A` | Rate-based statistic | Open |
| 29 | The 25 km neighbourhood is arbitrary | `A` | Report 10, 25, 50 km | Open |
| 30 | Moran's I is weak (0.094) | `V` earlier | Stated everywhere it appears | Fixed |
| 31 | No spatial cross-validation for the forecast; neighbours leak across the split | `A` | Leave-one-region-out evaluation | Open |
| 32 | 179 unassessed systems (about 25M people) are outside the analysis | `R` | Show them on the map as a distinct layer | Open |
| 33 | Overlapping service areas are drawn on top of each other | `R` | Transparency and outline only | Open |
| 34 | Only the 15 largest hubs are drawn | `R` | Paging for all 50 | Open |
| 35 | Point-in-county check used a 3 km tolerance on simplified county outlines | `V` | Fine for the audit; note it | Fixed (noted) |
| 36 | The consolidation rule is the state's 3-mile limit, not an optimum | `R` | Sensitivity on distance | Open |
| 37 | Systems with no polygon (1 of 1,062) are placed by the state's point only | `V` | Flag it | Open |
| 38 | Groundwater basin polygons were downloaded but are not used as a spatial feature | `R` | Basin-level features | Open |
| 39 | No uncertainty shown on the map for cost | `R` | Colour by stability (exists) | Fixed |
| 40 | Straight-line route cost may under- or over-state terrain effects | `A` | Use slope along the route from the terrain data | Open |

## 3. 3D graphics and performance

| # | Critique | Evidence | Fix | Status |
|---|---|---|---|---|
| 41 | The app feels laggy | `V`: not the JavaScript. Plan update about 55 ms, tab render at most 48 ms, hidden 2D map about 16 ms. The load is GPU | Quality tiers below | Fixed (see 42) |
| 42 | No way to match graphics cost to the device | `R` | Auto, High, Balanced, Low tiers chosen from cores, memory, pointer type, pixel density and save-data; user override saved | Fixed, unit-tested; not seen running |
| 43 | Nothing reacts when the map still stutters | `R` | Frame-time governor steps down one tier when the average frame exceeds 38 ms while moving, with a notice | Fixed, unit-tested; not seen running |
| 44 | Pixel ratio unbounded on dense screens | `R` | Capped at 2 (High), 1.25 (Balanced), 1 (Low) | Fixed |
| 45 | Anti-aliasing always on | `R` | High only | Fixed |
| 46 | Terrain, hillshade and 3D buildings always on | `R` | Off or later zoom on lower tiers | Fixed |
| 47 | Not-funded systems drawn as full towers (about 2,700 shapes) | `V` earlier: 8,496 shapes before, about 3,600 after | Lighter towers, none on Low | Fixed |
| 48 | Heavy layers rebuilt on every slider tick | `V` earlier | Rebuild after 150 ms idle; cache by plan signature and tier | Fixed |
| 49 | The optimizer blocked the page | `V` earlier | Web Worker | Fixed |
| 50 | The hidden 2D map was restyled on every change | `V` earlier | Only the visible map updates | Fixed |
| 51 | Terrain elevation tiles are fetched twice (two identical sources) | `R` | Share one source | Open |
| 52 | Two satellite layers draw at once | `R` | One imagery layer by zoom | Open |
| 53 | Each rebuild re-tiles whole GeoJSON in a worker | `R` | Partial updates | Open |
| 54 | Towers are fill-extrusion polygons, not instanced meshes | `R` | Instanced custom layer | Open |
| 55 | No frame-rate readout for diagnosis | `R` | Optional debug overlay | Open |
| 56 | Rendering could not be verified in the test browser (zero animation frames) | `V` | Verify on a real desktop and phone | Open |
| 57 | Three outside servers (style, terrain, imagery) are single points of failure | `R` | 2D fallback exists; add an offline basemap | Fixed (partly) |
| 58 | Slow starts used to wipe the map | `V` | Non-destructive fallback; recovery offer; clock runs only in a visible tab | Fixed |
| 59 | First load downloads about 1.2 MB of data plus map tiles | `V` | Lazy-load infrastructure and routes | Open |
| 60 | No reduced-motion handling for the fly-to animations | `R` | Respect `prefers-reduced-motion` | Open |

## 4. Data

| # | Critique | Evidence | Fix | Status |
|---|---|---|---|---|
| 61 | No published project-cost data exists, so remediation cost is modelled | `R` DataSets.md | State it on every cost; stress tests | Fixed (disclosed) |
| 62 | Costs use 2024 averages; the state did not update them in 2025 or 2026 | `R` | Disclosed | Fixed |
| 63 | County calibration error about 41% median | `V` | Disclosed; used in stress tests | Fixed |
| 64 | Cost tables were typed in by hand from a PDF | `V` | Sums checked against the state's totals (58 counties) | Fixed |
| 65 | 1,028 systems have no economic status | `V` | Equity index uses remaining components | Fixed (disclosed) |
| 66 | Snapshot dated 2026-11-02 changes as the state updates | `R` | Scheduled refresh | Open |
| 67 | Raw risk workbooks are not committed (size) | `R` | `fetch_data.py` downloads them | Fixed |
| 68 | Reproducing everything needs the extra datasets and several GB of disk | `V` (disk filled during this work) | Document disk needs | Open |
| 69 | Seven of the 23 extra sources are old (for example 2014-15 rates) | `R` | Date each source in the Method tab | Open |
| 70 | Licensing differs by source (ODbL, public domain, state terms) | `R` | Per-source licence table | Open |
| 71 | No checksum or version of each downloaded file | `R` | Record hashes at fetch time | Open |
| 72 | The 2023 file labels failing systems "HR2W", a different name | `V` | Mapped to Failing in the experiment | Fixed (experiment) |
| 73 | System names and IDs could change between years | `R` | Join on PWSID only (already) | Fixed |
| 74 | Population is as reported, county is where registered | `R` | Disclosed | Fixed |
| 75 | Missing-value handling differs by model | `R` | One documented policy | Open |
| 76 | Hand-set thresholds (3 miles, 500 connections, $96,000 per connection) come from the state's method | `R` | Cited | Fixed |
| 77 | The 2017 funding flag is binary and unlabelled by program | `R` | Split by program if published | Open |
| 78 | OpenStreetMap infrastructure is crowd-sourced and incomplete | `R` | Label it as context, not inventory | Open |
| 79 | Not enough information to model readiness or willingness | `A` | Interview data from a practitioner | Open |
| 80 | No sensor or groundwater-quality time series | `R` | Decide scope with Rahul | Open |

## 5. Product, evidence and everything else

| # | Critique | Evidence | Fix | Status |
|---|---|---|---|---|
| 81 | No live link: Pages returns 404 | `V` | Owner enables Pages (steps in `GRADING.md`) | Open |
| 82 | No practitioner has seen it | `R` | `OUTREACH.md` | Open |
| 83 | California only | `R` | `PORTABILITY.md`; one other dataset | Open |
| 84 | A system's result had no reason | `V` | "Why selected / not selected" line | Fixed |
| 85 | Documentation drift (a repeated README row, stale grading) | `V` | Removed; a test now fails on repeated rows | Fixed |
| 86 | I built a second 3D map from a stale clone | `V` | Dropped it; fetch GitHub before building | Fixed (process) |
| 87 | I put a "judges' view" in the app when you meant a view for me | `V` | Removed from the app and tests | Fixed |
| 88 | The optimizer's lead over a status-first plan is small at low budgets | `V` | Stated in the README | Fixed |
| 89 | No CI runs the tests | `R` | Add a test workflow | Open |
| 90 | No end-to-end browser test | `R` | Headless test on a machine that paints | Open |
| 91 | Red and green encode funded versus failing | `R` | Add shape or label redundancy for colour-blind users | Open |
| 92 | Keyboard use of the 3D map is limited | `R` | Focusable controls and a list alternative (the tables exist) | Open |
| 93 | The README is long | `R` | Split into overview and method | Open |
| 94 | CSV export could carry a leading "=" from a name | `R` | Prefix with an apostrophe | Open |
| 95 | Mobile layout is untested on a real phone | `R` | Test on a phone | Open |
| 96 | No error reporting from real users | `R` | Optional opt-in log | Open |
| 97 | No explanation of the equity weight in plain language beside the slider | `R` | Worked example | Open |
| 98 | Scenario links do not record the graphics tier | `R` | Intentional: device-specific | Fixed (decision) |
| 99 | The disk filled during this work and stopped it | `V` | Document disk needs; avoid copying the repo | Fixed (process) |
| 100 | The self-score is the author's, not an outside judge's | `A` | Ask a teacher or mentor to score it with the template | Open |

## What this changes

Fixed this round (code): quality tiers and the frame-time governor, the 3D-to-2D fallback, per-system reasons, and tests for all of them. Tried and found no gain: lag-status features and subset training for the forecast. The biggest items still open are outside the code: a live link, a practitioner reaction, seeing it render on a real screen, and computing the within-At-Risk accuracy for the deployed model.
