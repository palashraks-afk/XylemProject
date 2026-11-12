# California v1 local release candidate

**Ready for a local demonstration and practitioner review, with the limits below.** This candidate is based on current GitHub `main`, `7e3b6d9a6b38e6cfed2fea1ee1a102caeb9dd008`, rechecked during this task with no newer changes. Prepared 2026-11-11 Pacific; machine receipts use UTC. At local review completion, nothing had been pushed, put in a PR, deployed, published or sent. The user subsequently authorized committing and pushing this candidate; [PUSH_HANDOFF.md](PUSH_HANDOFF.md) records that scope. Pages remains manual-only (`workflow_dispatch`).

Local branch: `release/california-v1-qa`. Checkout: `C:\Users\sai71\.codex\visualizations\2026\11\12\01a1ce77-724c-75d3-8916-457d3d586b04\release-work\XylemRelease`. This report records the prepared local review state before the subsequently authorized commit/push. No nonempty applicable `AGENTS.md` was found. The handoff, refresh report, README, GRADING, historical-input policy and diagnostic report were read first. The two separate work repositories and the earlier preview/validation checkouts retain their saved statuses, diffs and input hashes; see [preservation receipt](release-qa/preservation.json).

Start with [the executable setup](../SETUP.md), [the five-minute walkthrough and practitioner checklist](DEMO_REVIEW.md), and the local preview at http://127.0.0.1:8885 while its server is running.

## Demonstrated defects and repairs

| Finding | Result |
|---|---|
| Selected-system card retained old cost/selection/stability after controls changed | Every completed control update refreshes the active card and any already-open 2D popup. Incompatible stored stability disappears from the card/popup as well as the plan/table/export. |
| Interactive 40-run sensitivity loop read changing controls between asynchronous steps | Capture costs, benefits, budget and reserve together; cancel and invalidate on control changes. Completed and cancelled runs checked in both browsers. |
| Fixed-share popups still showed a forecast-horizon weight | Popup now uses the chosen fixed share; CSV independently reconciles to that same share. |
| Map color buttons and select could disagree; 3D colors/legend could imply a different mode | One synchronized control state, mode-appropriate colors and legend. |
| 3D map drew viable consolidation routes even when their costs were not used or the route-display checkbox was off | Both maps draw only the funded, effective cheaper routes and obey the checkbox. Matching route counts and off-state zeros are checked. |
| Desktop/table inspection and sorting depended on pointer clicks | Keyboard-operable system buttons and sortable headers, visible focus, concise slider names/value text, pressed states, selected tab semantics and arrow/Home/End tab navigation. |
| 2D zoom buttons overlapped map-view buttons on narrow screens | Zoom moved to the right; 320px and 390px bounds checked for overlap and page overflow. |
| Map-library CDN or 3D failures could stop or stall the demo without a useful recovery | Local pinned map libraries with licenses/hashes. Visible warnings; fallback to saved 2D context on missing 3D library/WebGL/style or stalled tiles. Style timeout 12s; tile-loading deadline 20s. |
| Malformed shared numeric controls could disagree with sanitized slider values | Finite values are clamped and snapped to their supported ranges; invalid values use defaults. |
| Large preset said “All” despite cost rounding/assumption changes preventing all systems being funded | Renamed “Max”; no promise that the maximum range funds every system. |
| Fractional cost assumptions could make individually rounded CSV costs disagree with exact totals | Export effective costs at their computation precision, with exact budget/count/population/cost/scenario/snapshot metadata. Rounded screen values remain clearly summaries. |
| Ratio text could say “same as” for plans below the comparator | Display the actual ratio, including ratios below one. |

A final open-popup regression found and fixed stale stability in an already-open popup; `release-qa/open-popup-check.json` preserves the failing observation, and the targeted browser recheck verifies the correction. Baseline evidence is retained in `release-qa/baseline.json` and baseline screenshots. Review changes with `git diff`; [release file hashes](release-qa/release-file-sha256.json) bind the finished local files.

## QA checklist

Final evidence aggregates **40 unique browser checks with no unresolved failure**: 37 main checks plus three deliberate map-stall/imagery checks. The last full matrix was 36/37 because a 160ms test delay read a card before its queued update. That failed check was re-run successfully in Chrome and Edge using the completed scenario update; the current runner uses a bounded completion check. [Main run](release-qa/browser/checks.json), [targeted recheck](release-qa/targeted-detail/checks.json), [extra map failures](release-qa/map-failures.json), and [final combined checklist](release-qa/final-browser-checks.json) preserve this distinction. Earlier failed attempts remain under `browser-initial`, `browser-second`, `browser-third` and their logs; no failed attempt is deleted or relabeled as a pass.

| Check | Status | Evidence/scope |
|---|---|---|
| Desktop Chrome | PASS | 1440×1000; Chrome 157.0.8103.78, real 3D canvas and all 1,062 allocation features. Final capture had background requests idle and no map warning. |
| Another browser: Edge | PASS | Edge 119.0.2151.72; same calculations, controls, exports and 3D allocation features. This is an installed older Chromium browser, not a distinct browser engine or a current-browser certification. |
| Mobile layout | PASS, emulated | Touch/mobile viewports 390×844 and 320×844; no page overflow or map-button overlap. Tables/tabs intentionally scroll horizontally within their containers. Actual phones/iOS/Safari unverified. |
| Keyboard navigation/labels | PASS, scoped | Range keyboard input, named/value-text controls, tab arrows/Home, table sorting and system inspection. Full WCAG/screen-reader audit unverified. |
| Normal 3D/2D map loading | PASS | Final desktop screenshots and live source features in both browsers. Third-party tile availability is not guaranteed. |
| External network offline, style 503, missing 3D library, missing WebGL | PASS | Visible notice, 2D fallback, working controls and CSV; no reliance on public library CDNs. |
| Stalled style / stalled tiles / imagery 503 | PASS | Fallback at approximately 12.7s / 20.7s / 20.7s respectively in the recorded Chrome run. Default selection remains 97 systems / 476,663 people. |
| Mixed saved data | PASS | Changed `systems.json` byte rejected by SHA-256, export disabled. |
| Budgets | PASS | $25M minimum, five presets $100M–$2B and approximately $5.385B maximum; exact metadata and selected IDs checked. Maximum is not “all.” |
| Equity/reserve/routing/cost combinations | PASS | Equity 0–3, reserve 0–60%, routing on/off, costs 0.5×/0.55×/1×/2×, horizons including 10; reviewed individual and combined cases. This is a finite matrix, not every possible state. |
| Fixed share | PASS | 50% and 100% examples; hidden horizon control, popup and export weights agree. |
| Rapid changes followed by immediate CSV | PASS | Export flushes pending changes; controls, hash, counts, selected IDs, costs and weights agree. |
| Incompatible stored stability | PASS | Blank in CSV and absent from active card/table/robustness for reserve, routing, fixed-share and altered cost multipliers. Display explains the mismatch. |
| Interactive cost stability | PASS | Complete 40 runs and cancel on changed controls in both browsers; actual $500M demonstration recorded. |
| CSVs versus Python | PASS | **40 captured CSVs**, including demo and failure cases, independently reproduce exact selected IDs in Python. Populations, effective costs, weights and rounded-budget feasibility agree; formulas use 1e-12 floating tolerance for weights. [Reconciliation](release-qa/export-reconciliation.json). |
| Existing old/new allocation parity | PASS | All 110 Python/browser cases match; the 55 saved old/new comparisons remain unchanged. |
| Python tests | PASS | **121 passed**, including all existing checks plus five transfer-integrity/path checks. [Final log](release-qa/tests-final.log). No performance thresholds were relaxed. |
| JavaScript syntax / whitespace | PASS | `app.js`, `map3d.js`, `optimizer.js`; `git diff --check`. |
| Physical devices, Safari/Firefox, screen readers | UNVERIFIED | No such testing is claimed. |
| Practitioner usability / real funding usefulness | UNVERIFIED | Checklist prepared; no contact sent, feedback obtained or endorsement claimed. |

The extra map checks distinguish live rendered overlays from the background-request idle flag. An earlier Edge idle wait timed out; the final capture rendered every allocation feature and reached idle. When third-party resources actually stall, bounded fallback is verified rather than assuming the network will recover.

## Independent setup and preserved inputs

The supplied environment uses shared system packages. Two fresh environments were therefore created under this task's writable release workspace, with `include-system-site-packages = false`; the supplied environment was not installed into or changed. The short `setup.ps1 -Mode Verify` procedure itself was executed successfully, including offline hash-pinned installation, input extraction, artifact guards, tests and optimizer parity. Static setup was executed separately and needs no ML packages or raw ZIP.

- Preserved raw inputs: **335 files**, **313,425,074 raw bytes**, all matched against the original diagnostic receipt and both source checkouts. Actual prepared ZIP: **148,701,354 bytes**, SHA-256 `234aef98d32fdb157de07b8771c8c50a63cca9d8223790a79af91ce45aab68d7`. The ZIP and its `.manifest.json`/`.sha256` sit in the checkout's parent directory. [Inspect the manifest](release-qa/preserved-inputs.manifest.json). It contains original source bytes, not new downloads.
- Transfer tool checks the complete archive before extraction, rejects corrupt/extra/duplicate/path-traversing members, and refuses different existing destination bytes. The actual package was extracted and all input hashes rechecked.
- The sibling `wheelhouse/` contains **22** Windows CPython 3.12 dependency wheels (86,770,543 wheel bytes), pinned with all transitive dependencies and SHA-256 in `requirements-reproduction.txt` and [wheel manifest](release-qa/wheel-manifest.json). This replaces dependence on an absolute bundled wheel path. Other OS/Python combinations remain unverified.
- Pillow 13.0.0 was available; its wheel differs from the original bundled build. **All 304 preserved terrain tiles decode identically**, and the clean **31,740×49** feature panel matches the preserved panel exactly. [Pixel comparison](release-qa/pillow-comparison.json), [independent feature regeneration](release-qa/reproduction-independent.json).
- The numerical library versions, feature fingerprint `adadd344e5b8b679e3249220903e05306a5ea8db194eb0961521c61b34edffff`, training-only calibration and selection guards match. **Full model selection/calibration/refitting was not rerun.** Frozen outputs were reused, as requested. Independent setup and exact input/feature/arithmetic reproduction do not constitute a new full training run or scientific validation.

App snapshot ID remains `806032f64da14561b81c55e72179ec22f299774fa97b9b5f08c4742909f9c0bd`. All ten `app/data` files, model/calibration artifacts, pipeline scoring code and diagnostic outputs retain their baseline bytes. The old evaluation also hashed its UI source: that evaluated source is preserved byte-for-byte in `release-baseline/app.js`, and the test checks both its original hash and the current UI's hash in [presentation provenance](release-qa/presentation-provenance.json). No original model/source/output hash was skipped or overwritten to silence a stale-artifact failure.

## Review package and claims

The [walkthrough](DEMO_REVIEW.md) includes actual screenshots, three CSVs and a short practitioner checklist. The isolated 30% reserve example changes 48→70 small systems while modeled population changes 476,663→393,742 at the same $500M budget; it plainly describes the tradeoff. Current scenario stability is distinguished from the saved 200-scenario frequencies.

README and DataSets point to the verified setup and qualify unsupported availability claims. NOVELTY no longer asserts that other tools lack features or that a short search establishes uniqueness. OUTREACH remains an unsent draft, removes unverified sender/challenge claims, and states the scientific limits. The app no longer claims a globally optimal reserve-constrained plan or a validated next-year violation probability. Historical audit documents are retained as historical evidence rather than silently rewritten.

Previously examined 2025→2026 outcomes remain diagnostic. Annual failure probabilities and the constant-annual-risk multi-year conversion remain unvalidated. Training-only calibration, full-population normalization and artifact checks are preserved. There was no tuning to diagnostic outcomes, manufacture of episodes, source redownload, cohort removal or weakening of performance tests. Modeled reach is selected population under the objective, with unresolved overlap, not measured intervention benefit.

## Remaining gates and estimated effort

| Gate/gap | Blocks what | Estimated remaining effort |
|---|---|---|
| Owner review and explicit new authorization | PR creation, deployment, publication or outreach; push has since been authorized | Push authorization is recorded in PUSH_HANDOFF.md. Other release actions still require separate authorization. Pages remains manual-only. No unresolved code defect from the reviewed matrix blocks the disclosed local demonstration. |
| Practitioner review | Claims of real workflow usefulness, endorsement or funding suitability | 30–60 minutes of review plus scheduling, often 1–3 business days. Outreach draft only; no response is assumed. |
| Physical phone, Safari/Firefox and assistive-technology review | Broader device/accessibility support claims | About 2–4 hours with suitable devices/reviewers; findings may add work. |
| Full clean model-training rerun | Claim that this task independently reran the entire training chain | Reserve roughly 2–6 compute hours plus 30–60 minutes of review, unmeasured/hardware-dependent. Not necessary for the unchanged-result local demo; rerun after relevant model/source changes. |
| Historical releases, first-publication evidence and complete failure episode/membership histories | Prospective or validated annual-failure claims, and any validation of the multi-year conversion | External record acquisition and study design; potentially weeks/months, with timing unknown until data access is established. **Additional coding alone cannot resolve this.** |
| Real quotes, capacity, readiness, willingness, O&M and intervention follow-up | Engineering feasibility, actual funding recommendations or measured benefit | Practitioner/project data work; scope and timing depend on partners. Outside this California demonstration. |

Live map services remain external dependencies. Their network availability is a demonstration risk, with tested fallback to saved context. No additional sensor, geography or model feature scope was added.
