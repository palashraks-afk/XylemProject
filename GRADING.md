# Self-grading, weaknesses and fixes

Graded with the project scoring template (0 to 10, evidence required, a gap named for every score below 8). Profile fit is left out because the team background was not provided, so the mean is over 10 criteria. The challenge's own judging criteria are Impact, Challenge Fit and Feasibility, and Innovation; they are mapped at the end.

These scores are the author's (Claude's) judgment from the repository, test output and the running app, not an outside judge's. Earlier rounds are summarised, not reproduced: round 1 (6.4) and round 2 (7.1) predate the 3D terrain map, the 23 added data sources, the two-stage forecast and model comparison.

## Round 3 critique (what was wrong when this round started)

Each item was checked, not assumed.

| # | Weakness | Evidence | Fix |
|---|---|---|---|
| 1 | **No live link.** A judge cannot open the project. | `https://palashraks-afk.github.io/XylemProject/` returns HTTP 404 (checked 2026-11-04) | Workflow is in the repo; the repository owner must enable Pages (below). Not fixable from code. |
| 2 | **No guided path for a judge.** The app opens on a dense control panel; the story and the criteria are spread over seven tabs. | Reading the page | **Judges' view** (`app/judges.js`): a five-step tour that drives the live 3D map, and the three criteria answered with figures read from the app's own data files, each with a "Not claimed" line. Open with the header button or `?judges=1`. |
| 3 | **The 3D map is a single point of failure.** It needs WebGL and three outside servers (style, terrain, imagery). If any fails during judging the page shows nothing. | Code review of `map3d.js` | Falls back to the 2D map on no WebGL, unreachable style, or a slow start, and offers 3D again if it recovers. Tested by simulating an unreachable style server and missing MapLibre. The slow-start clock does not run in a background tab. |
| 4 | **Results were unexplained.** A system was "Selected" or not with no reason. | `showDetail` in `app.js` | "Why selected / why not selected" line built from the same numbers the optimizer used ($/person against the plan median, status weight, equity). |
| 5 | **Documentation drift.** README repeated a table row; this file quoted superseded numbers. | `tests/test_judges_view.py` found the duplicate | Row removed, file rewritten, a test now fails if rows repeat. |
| 6 | **The optimizer's advantage is smaller than first claimed.** | README results table | Stated plainly in the README and in step 3 of the tour: about equal to a status-first plan at $250M or less, 1.5× at $500M, 2.7× at $1B. |

## Round 3 scores

| Criterion | Score | Evidence | Gap and what would fix it |
|---|---|---|---|
| Impact | 7 | 1.93M people at risk (state data); plan CSV; per-system reason, cost, $/person, stability; Local view for any county | No real-user feedback; California only; costs are planning estimates. Fix: one practitioner reply (draft in `OUTREACH.md`) |
| Creativity | 8 | Real-terrain 3D map with towers placed on actual systems, real canals and plants, guided tour | Visual novelty is easy to match. Fix: user story from a real place |
| Novelty | 6 | No tool found combining exact budget optimizer, forecast-valued prevention and state-method routing (limited search, see `NOVELTY.md`) | Prior art is close. Novelty is the combination |
| Fit to the brief | 8 | Water Access: affordability, equity and small-system priority are in the objective; uses the state's own methods | "Global" not addressed beyond `PORTABILITY.md` |
| Scientific rigor | 8 | Strict temporal backtest (ensemble AUC 0.771 vs 0.618 for status alone, with intervals); 51 candidate models compared; county cost calibration reported with its error; routing checked against the state's own share; failures and null results reported | Costs ±41% typical county error; forecast gain modest; levels approximate. Fix: a 2027 backtest year |
| Depth of real data | 8 | Three years of SAFER risk files, affordability, 23 public datasets, terrain, OpenStreetMap infrastructure, state boundaries | Remediation costs are modelled, not observed; none published |
| Feasibility | 6 | 62 automated tests including a Python/JavaScript optimizer parity check; works in a browser; 2D fallback | **No live link; no pilot.** Fix: enable Pages, one practitioner trial |
| Interactive and visual | 8 | 3D terrain, tour, presets, layers, CSV, shareable links, reasons | **Rendering not re-verified this round**: the browser pane stopped painting during testing (zero animation frames), so the tour's logic was tested but its camera moves and layers were not seen. Look at it on a real desktop and phone |
| Technical depth | 8 | Exact optimizer in a worker, ensemble forecast, spatial statistics, state-method routing, coordinate quality control | Sensors and groundwater not built |
| Uniqueness | 8 | A judge can fly to their own area and see why a system was or was not funded | Still one state |
| **Mean (10)** | **7.5** | | Not 9. The three things that would move it most are outside the code: a live link, a practitioner's reaction, and a result outside California |

## Against the challenge's three criteria

| Criterion | Score | Why |
|---|---|---|
| Impact | 7 | Real reach in California, actionable output; no user evidence; global market unproven |
| Challenge fit and feasibility | 7 | Direct fit and a working, tested tool; no live deployment, routes approximate |
| Innovation | 7.5 | New combination on public data with an honest backtest; prior art is close |

## How to put the link live (owner only)

On GitHub: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**, then **Actions → Deploy app to GitHub Pages → Run workflow** (or push to `main`). The workflow in `.github/workflows/pages.yml` publishes `app/`. The link will be `https://palashraks-afk.github.io/XylemProject/`; add `?judges=1` to open the Judges' view.

## Top open gaps

| Gap | Criterion | Fix | Owner | Due |
|---|---|---|---|---|
| No live link | Feasibility | Enable Pages (above) | Repository owner | Before submission (Nov 20, 1:00 PM PT) |
| No practitioner feedback | Impact, Feasibility | Send `OUTREACH.md`; quote any reply with permission | Rahul | Nov 13 |
| Rendering not seen this round | Interactive | Open the live link on a desktop and a phone; screenshot for the submission | Rahul | After Pages |
| California only | Impact, Fit | Say so in the pitch, or prove the method on one other dataset | Rahul | Nov 16 |
| Sensors and groundwater not built | Technical depth | Decide what they mean; build one | Rahul / Claude | Nov 15 |
