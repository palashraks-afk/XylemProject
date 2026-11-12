# Evidence and inherited self-grades

Earlier versions contained author-assigned challenge scores and reconstructed rounds. Those subjective opinions were not external evaluations or verified quality measures; they remain in Git history at the pre-refresh commit. No revised numerical grade is claimed here.

## Current evidence

| Area | Supported statement | Remaining gap |
|---|---|---|
| Forecast | Primary archived diagnostic AUC 0.831 overall (2,633 / 61) and 0.764 At-Risk (586 / 32) | Previously examined snapshots; historical availability and annual outcome timing unresolved |
| Comparable old outcomes | Exact original 582 / 50 At-Risk cohort: AUC 0.756→0.739; paired interval −0.053 to +0.017 | Different outcome vintage from the primary archive; no demonstrated improvement |
| Calibration | Training-only nested 5/4-fold ridge logistic map; 68 training events; Brier improves in recorded comparisons | Not every log-loss comparison improves; configuration selection not nested; final refit transfer unvalidated |
| Allocation | Refreshed Python/browser inputs; five budget presets; 55 old/new plans with membership and stability evidence | Reach is modeled population under the objective, not measured intervention benefit |
| Costs and routing | State-table modeled costs; approximate consolidation costs | No actual project quotes, street routing, capacity proof or regional adjustment |
| Reproduction | Hash-bound inputs, artifacts and app snapshot; relevant tests and browser/CSV checks recorded in the refresh report | Preserved raw risk files/extras and the recorded Python environment are required |
| Scope | California-only local prototype; Pages remains manual-only | No new release, user study or other geography is established |

See [the refresh report](audit/APP_REFRESH_REPORT.md), [allocation comparison](audit/allocation-comparison/README.md), [README](README.md) and [diagnostic evaluation](PLANNER_EVALUATION.md) for exact values, definitions, checks and reproduction commands. The pre-refresh validation passed 108 tests; the current test result is reported separately in the refresh report.

Annual failure probabilities and the multi-year conversion `1-(1-p)^h` are unvalidated. No self-score or test count resolves missing historical failure episodes or publication vintages. Future work should obtain those records and real-user evidence before making prospective or impact claims. Deployment requires separate authorization.
