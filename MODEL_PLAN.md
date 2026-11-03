# SAFER planning model: first implementation

1. **Map the source.** Keep the committed SAFER snapshot as the base. Export all systems as map context, joined by PWSID, with a separate eligible Failing/At-Risk set. Report missing coordinates, boundary coverage, and missing equity components.
2. **Make priorities inspectable.** Use a deterministic weighted-benefit formula. Budget, failing versus at-risk priority, equity, small-system preference, and cost multiplier are visible controls. No trained ML model or causal health prediction is claimed.
3. **Optimize reproducibly.** Python and the browser use the same full-precision equity index and $100,000 cost rounding. Round every project up, enforce the rounded budget, expose the allowance, and set Fund all from rounded costs. Small-system preference is a score multiplier, replacing the old two-stage spending reserve.
4. **Map the trade-offs.** Show selected systems, unfunded failing systems, other SAFER statuses, per-system inputs, county views, and downloadable statewide plans. Population is potential reach, not proven unique beneficiaries.
5. **Stress the selected scenario.** Run 40 reproducible cost scenarios in a worker with the selected budget and weights held fixed. Independent lognormal cost multipliers have an assumed 90% range of 0.5–2. Frequencies are sensitivity results, not calibrated probabilities. Changing a control cancels and invalidates old tests.

## Next model milestones
- Reconcile the 2024 cost-estimation cohort with the 2026 system list; estimate inflation and compare scaled versus unscaled costs.
- Audit the hand-transcribed cost tables and obtain project-level costs, intervention types, completion/readiness, and already-committed funding. Evaluate held-out cost error before claiming accurate remediation recommendations.
- Replace abrupt size-bin cost changes only after selecting and validating an appropriate monotone cost curve or intervention-level model.
- Test correlated county/intervention cost shocks and broader policy scenarios; report sensitivity separately from model uncertainty.
- If a guaranteed spending share is needed, introduce a jointly solved constrained formulation rather than two-stage selection.
- Add intervention choices, capital versus operating costs, and eligible consolidation alternatives when supporting data exists.

## Validation
Run `python pipeline/build.py`, `python -m pytest tests -q`, and `node tests/model.js`.
The legacy precomputed stress-test arrays are retained for compatibility with archived outputs; the new app does not use them to describe a selected scenario.
