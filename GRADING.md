# Self-grading, written from a judge's point of view

This is the author's (Claude's) own critique, written as a skeptical judge would read the project. It is not a feature of the app. Graded with the project scoring template (0 to 10, evidence required, a gap named for every score below 8). Profile fit is left out because the team background was not provided, so the mean is over 10 criteria. The detailed list of critiques and fixes, with evidence tags, is in [AUDIT.md](AUDIT.md).

Scores are judgment from the repository, test output and measurements, not an outside judge's. Round 1 scored 6.4 and round 2 scored 7.1, before the 3D terrain map, the 23 added data sources and the two-stage forecast existed.

## What a skeptical judge would say, by official criterion

**Impact.** "Real data, real people, a usable plan. But nobody who funds water has used it, it covers one state, and the costs it ranks by are modelled with about 41% typical county error." True. No practitioner has seen it; that is the single biggest gap.

**Challenge fit and feasibility.** "It answers Water Access with the state's own methods, and it runs. But I cannot open it: there is no live link. The 3D map needs three outside servers, and the app feels slow." Checked: the Pages address returns 404. The lag is not in the JavaScript (plan update about 55 ms, heaviest table 48 ms); it is graphics load. This round added graphics tiers and a frame-time governor, but I could not watch them run, because the test browser did not paint.

**Innovation.** "An exact budget optimizer with a forecast and state-method routing on one map is a new combination. The forecast is only modestly better than the state's own status." Checked: within At-Risk systems, the systems the app actually scores, the base-feature forecast reaches AUC 0.633 (0.558 to 0.713), against a headline 0.689. Two ideas I tried to improve it (last-year status, training on the At-Risk population) gave no gain beyond noise.

## Scores

| Criterion | Score | Evidence | Gap and what would fix it |
|---|---|---|---|
| Impact | 7 | 1.93M people at risk; actionable plan with reasons, cost, $/person, stability; county views | No practitioner feedback; California only. Fix: one reply (`OUTREACH.md`) |
| Creativity | 8 | Real-terrain 3D placement map, towers on actual systems, real canals and plants | Visual novelty is easy to match |
| Novelty | 6 | No tool found combining these (limited search; `NOVELTY.md`) | Prior art is close |
| Fit to the brief | 8 | Water Access: affordability, equity, small-system priority in the objective; the state's own methods | "Global" only in `PORTABILITY.md` |
| Scientific rigor | 8 | Strict temporal backtest with intervals; 51 candidate models; cost calibration error reported; null results kept; within-At-Risk accuracy disclosed | Within-At-Risk AUC not yet computed for the deployed model; costs ±41%; 120 test onsets |
| Depth of real data | 8 | Three SAFER years, affordability, 23 public datasets, terrain, OpenStreetMap, boundaries | Remediation costs are modelled; none are published |
| Feasibility | 6 | 63 tests, optimizer parity check, 2D fallback | **No live link, no pilot** |
| Interactive and visual | 7 | 3D terrain, presets, layers, CSV, reasons, graphics tiers | **Rendering and the tiers were not seen running** (test browser painted zero frames). Verify on a real desktop and phone |
| Technical depth | 8 | Exact optimizer in a worker, ensemble forecast, spatial statistics, routing, coordinate QA, quality governor | Sensors and groundwater not built |
| Uniqueness | 7 | A judge can fly to their own area and see why a system was or was not funded | One state; the 3D idea is not unique |
| **Mean (10)** | **7.3** | | Not above 8 |

Against the challenge's three criteria: Impact 7, Challenge Fit and Feasibility 7, Innovation 7.

## Why it is not above 8, and what would honestly get it there

I will not score it above 8 on my own say-so; the evidence does not support it. Three things move the number, and none of them is code I can write:

| Change | Moves | By about |
|---|---|---|
| A live link (enable Pages) | Feasibility 6 → 7 | +0.1 on the mean |
| Seeing it render smoothly on a real desktop and phone | Interactive 7 → 8 | +0.1 |
| One practitioner's reaction, quoted with permission | Impact 7 → 8 | +0.1 |
| A result outside California | Impact, Novelty | +0.1 to +0.2 |

Even with all four, about 7.7 to 7.9. An outside judge's scores could differ in either direction.

## Put the link live (owner only)

On GitHub: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**, then **Actions → Deploy app to GitHub Pages → Run workflow** (or push to `main`). The workflow in `.github/workflows/pages.yml` publishes `app/`. The address will be `https://palashraks-afk.github.io/XylemProject/`.

## Top open gaps

| Gap | Criterion | Fix | Owner | Due |
|---|---|---|---|---|
| No live link | Feasibility | Enable Pages | Repository owner | Before Nov 20, 1:00 PM PT |
| No practitioner feedback | Impact | Send `OUTREACH.md`; quote a reply with permission | Rahul | Nov 13 |
| Rendering and graphics tiers unseen | Interactive | Open the live link on a desktop and a phone; screenshot | Rahul | After Pages |
| Within-At-Risk accuracy of the deployed model | Rigor | Run on a machine with the extra datasets and enough disk | Rahul / Claude | Nov 12 |
| California only | Impact | Say so in the pitch, or add one other dataset | Rahul | Nov 16 |
