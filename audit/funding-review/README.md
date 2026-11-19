# Public-record funding review

The prototype can now show a **simulated new-award shortlist alongside documented project scopes**. Open [Funding review](../../app/funding-review.html) from the allocation planner. Keep the $500M budget and 30% small-system priority to reproduce the examples below.

- **Track East Orosi only** reproduces the original three-system case. Four systems enter and three leave, including East Orosi itself.
- **Track sample construction scopes** runs the comparison across six systems with documented construction funding for the shown scopes.
- To check a separate project, add a dated source and scope as a local record. Local records stay in the browser and are labeled in the CSV. Use the checkboxes to track individual scopes.

## What the sample covers

The app joins its preserved November 2 snapshot to **12 reviewed system IDs**, including nine additions to the original three examples. This purposive sample exercises different funding stages using dated public records. It is a test of the workflow with contrast cases. Statewide project coverage, current eligibility, and practitioner use remain unverified.

| Public evidence | Systems | Modeled action |
|---|---|---|
| Construction funding documented | East Orosi, London, Elk Creek, Son Shine Properties, Fuller Acres, Hidden Lake Estates | Track the documented scope separately if the reviewer chooses. Check for any distinct remaining need. |
| Interim support documented | Daggett, Lake Morena Views | Confirm permanent scope and financing. |
| Planning support documented | Malaga, Blythe, Vierra Meadows | Check readiness and construction financing. |
| Current project funding unverified | San Ardo and systems without a funding record | Verify the current project and funding status. |

The project-level amounts describe their particular source scopes. Fuller Acres and Athal share one agreement. A system ID can have multiple projects. This prototype carries one review record per system and uses a temporary system-level screen as a proxy for reviewing the documented scope. A separate unmet need at the same system can warrant a separate project.

[State Water Board June 2 report, pp. 8, 12 and 20](https://www.waterboards.ca.gov/board_info/agendas/2026/jun/06022026-7edrpt.pdf) · [State Water Board November 4 report, pp. 8, 10 and 11](https://www.waterboards.ca.gov/board_info/agendas/2026/nov/11042026-5edrpt.pdf) · [East Orosi construction update](https://tularecounty.ca.gov/rma/news/east-orosi-water-infrastructure-groundbreaking-initiative) · [All record citations](../../app/funding-review-records.json)

## Results at 30% small-system priority

Both screened methods use the same budget, candidate pool, benefit weights, $250,000 upward cost rounding, and two-pass small-system priority. The comparator fills those two passes in order of weighted benefit per rounded dollar. The full-plan metric is the sum of weighted benefits in each shortlist. The allocation's two-pass priority is a heuristic across the whole budget.

| Budget | Documented construction rows selected before tracking | Entered / left after tracking | Screened allocation weighted score | Screened ranking weighted score |
|---|---:|---:|---:|---:|
| $100M | 0 | 0 / 0 | 253,669 | 253,669 |
| $250M | 2 | 7 / 2 | 453,143 | 452,644 |
| $500M | 4 | 5 / 5 | 619,771 | 619,748 |
| $1B | 4 | 9 / 4 | 744,990 | 744,968 |
| $2B | 4 | 6 / 4 | 826,814 | 826,814 |

At $500M, the original allocation selects **112 systems**, including four rows with documented construction scopes. Tracking all six sample scopes puts five different systems on the shortlist and leaves five out. The result still has 112 systems, and its reported population sum moves from 393,742 to 393,196. **109 of the 112 selected systems have unverified funding status.** The simple ranking achieves within **0.004%** of the screened allocation's weighted score. Both methods omit the tracked rows by construction, and we have no estimate of how many potentially overlapping projects exist outside this sample. The demonstrated value is making candidate eligibility assumptions visible and checking how they affect membership.

Run `node tools/evaluate_funding_review.cjs` from the repository root for exact totals and system IDs, or download the CSV from the app to inspect a custom scenario. The underlying snapshot and original three-system scenario are separately reproducible. [Original case study](../three-system-case-study/Xylem_Three_System_Case_Study.md)

## Submission wording

> Using a $500 million modeled budget, we checked 12 water systems against public records. Four systems in the original shortlist had documented construction funding for particular scopes. We tracked those scopes separately in an experimental rerun, which changed ten selections. The screened allocation and a simpler cost-ranked comparison had nearly identical weighted scores, so the key demonstration is how public evidence changes who is considered for review. This is a decision-support prototype, and selected populations are modeled totals.

## Verification

- Chrome and Edge passed navigation from the original planner, both screening presets, links from changed systems to records, CSV reconciliation, local record save and removal, keyboard tracking, and a 320 px viewport check.
- All 121 existing Python tests passed. The seven JavaScript tests passed, including the two previously existing name checks. All 110 original browser and Python allocation parity cases matched.
- A separate Python replay matched the modeled totals and every changed ID in the five-budget comparison. The static integrity check verified the frozen snapshot and current app build.
