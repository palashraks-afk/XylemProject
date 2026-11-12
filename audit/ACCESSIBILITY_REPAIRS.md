# California v1 accessibility repairs â€” local candidate

The five handoff findings are repaired and verified within the local scope below. **Physical phones, spoken VoiceOver/TalkBack, real OS text scaling and device downloads remain UNVERIFIED. This is not accessibility certification.**

Prepared across November 11â€“12, 2026 Pacific. Base and GitHub main rechecked: `f0fa6006032f6b614276395c5628596a63b966fa`, with no newer commits at the final comparison. Local branch: `fix/california-v1-accessibility`, isolated checkout `XylemAccessibility` beside the current chat's artifacts. No push, PR, deployment, preview exposure, publication, firewall change or outreach occurred. Pages remains manual-only.

The complete supplied NEXT_CHAT_PROMPT, accessibility review, raw findings, native-tree observation and repository handoffs/README/GRADING/SETUP were inspected before repair. No nonempty applicable AGENTS.md was found. The prior release checkout was clean before and after; the separate supplied work repositories were not modified.

## Before / after

| Finding | Before | After and local verification | Result |
|---|---|---|---|
| Status badges | At-Risk 2.33:1; Failing 4.26:1 | Opaque backgrounds and darker text: **5.62798:1 / 6.47629:1** respectively. All 97 rendered default-plan badges checked in each browser, covering both shared style combinations; scoped axe failures removed. Map/status meanings unchanged. | PASS locally |
| Method overflow | Two `scrollable-region-focusable` violations | All six Method table containers have focus targets and distinct names. Arrow scrolling exercised on actual horizontal/vertical overflow at 1280/320px; Tab and Shift+Tab leave each region. | PASS locally |
| System-card focus | Closing by keyboard left BODY focused | Explicit opening focuses the named heading, then Tab reaches Close. Refreshes preserve heading/Close focus. Closing resolves the original control, a replacement button with the same system ID after redraw, or the search fallback if the row is gone. Search invocation also returns to search. | PASS locally |
| Completed-update announcements | No concise plan/scenario status target | One persistent polite atomic status, delayed 350ms and coalesced. Eight rapid slider changes produced one summary. Forty scenarios produced one completion summary, without progress flooding. Cancellation produced current-plan/cancellation information and no stale completion. Busy trigger stays focusable with guarded `aria-disabled`; focus remained at the trigger. Card fields refresh without making the whole card/table live. | PASS for DOM/focus; speech UNVERIFIED |
| 3D overlays | Filled 960px summary overlapped view buttons | Summary and HUD now flow beneath the view buttons and wrap within the actual map column. Tested live MapLibre sources with **1,062 allocation features**, ten widths per browser, actual/long labels: **40 measured layout cases**, including 900/920/960/1000/1040/1100px. No measured summary/view/HUD/navigation collision or page overflow. | PASS locally |

Additional handoff leads addressed: selected tabs now link to their panel; a visible-on-focus skip-to-results link bypasses the maps; the 3D budget exposes currency `aria-valuetext`, including while focused. Their DOM/keyboard behavior passed; human speech/virtual-cursor behavior is still unverified.

The small-text contrast target used for interpretation is 4.5:1 ([W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). The status design follows short, non-disruptive completion messages ([W3C Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). Narrow viewports are reflow proxies, not native zoom or phone evidence ([W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Verification and evidence

| Check on final UI build | Outcome | Evidence |
|---|---|---|
| Targeted accessibility/keyboard/layout | **32 PASS / 0 FAIL**, installed Chrome 157.0.8103.78 and Edge 119.0.2151.72 | [verified/checks.json](accessibility/verified/checks.json), [runner](../tests/accessibility_browser.cjs) |
| axe-core 4.10.3 | Eight scoped scans; zero returned violations | Losslessly compressed raw `*-axe.json.gz` under [verified](accessibility/verified/checks.json). **Incomplete cases remain:** 724 default/expanded contrast nodes, 782 narrow nodes, 28 Method nodes per browser, plus inherited aria/link review items. This does not pass all contrast or accessibility. |
| Existing broader release regressions | **37 PASS / 0 FAIL** | [release-verified/checks.json](accessibility/release-verified/checks.json): budgets, combinations, scenarios/cancellation, details/popups, controls, maps, emulated mobile layouts, mixed-snapshot rejection and deliberate failure fallbacks |
| Fresh browser CSVs independently reproduced by Python | **34 / 34 PASS** | [export-reconciliation-final.json](accessibility/export-reconciliation-final.json). Exact membership, populations, effective costs, weights, snapshot and rounded-budget feasibility. Browser assertions also check the new UI build metadata. These are desktop/emulated download captures. |
| Python suite | **121 PASS**, 11.37s | [python-tests-final.log](accessibility/python-tests-final.log) |
| Existing old/new optimizer parity | **110 / 110 matched** | [parity-final.log](accessibility/parity-final.log) |
| Original diagnostic/source/output hashes | **367 / 367 PASS**, including **335 raw inputs** | [integrity.json](accessibility/integrity.json) |
| Static data, vendor and presentation bytes | **10 data files, 6 vendor assets, 23 bound app assets PASS** | [static-final.log](accessibility/static-final.log), [build.json](../app/build.json) |
| JavaScript syntax / whitespace | PASS for app, map, optimizer and browser runners; `git diff --check` | Reproduction below |
| Fresh Git checkout exact-byte verification | Recorded in the external final-delivery receipt beside this checkout | All staged delivery bytes and the static build are compared after a fresh clone; original model/data/workflow paths remain unchanged. |
| Real phone, Safari/iOS, VoiceOver/TalkBack speech, OS text scaling, native zoom, actual device file saving | **UNVERIFIED â€” human required** | [PHONE_TEST.md](PHONE_TEST.md) |
| Practitioner workflow usefulness / scientific annual-risk validation | **UNVERIFIED** | Unchanged research/practitioner evidence gaps |

The two installed browsers share Chromium ancestry; this is not independent engine coverage. Semantic scans deliberately used the saved 2D fallback; live 3D checks were run separately. Stalled-style/tile tests from the old release were preserved, not newly claimed in this 37-check run.

## Failures retained and resolved

- The first broad run was **35/37**: both live route checks timed out with `ERR_NETWORK_ACCESS_DENIED` from public map servers. [Initial run](accessibility/release-regressions/checks.json). Read-only map access resolved this; a targeted recheck and both complete later runs passed. No preview was exposed.
- The first accessibility run was **26/32**. Four live 3D failures came from that network denial. Two focus assertions incorrectly clicked a sort control and then expected focus to remain on Close; sorting intentionally focuses its sort control. The corrected regression triggers an actual control-driven redraw. [Original failures](accessibility/after-initial/checks.json) and original run logs remain intact.
- That initial evidence also showed scenario completion left focus on BODY because the native button was disabled. The repair uses `aria-disabled` with an explicit duplicate-run guard; final tests assert focus stays on the trigger. Existing scenario waits were updated to observe that intended busy state, retaining all scenario/result checks.
- The final keyboard walkthrough was tightened so Tab from the newly focused card heading reaches Close in normal order. Close keeps its upper-right visual placement. The CSV now records the same UI build shown in the header. Complete final runs were repeated after these edits.

No failed attempt was discarded or relabeled. Verbose new axe scans are losslessly stored as `.json.gz`; [archive receipts](accessibility/axe-archive.json) bind both original and compressed bytes. The supplied before evidence remains in its original format. Earlier passing intermediate builds are under `after-final` / `release-final`; authoritative final evidence is under **verified / release-verified**, for UI build below. The original review and four original `f0fa600` UI files are under [before](accessibility/before/original-review/ACCESSIBILITY_REVIEW.md). The supplied review's entire hash manifest matches the retained copy.

## Frozen results and build identity

UI build: **`efb5e6e0e986178bef4bb6c9d3810854623d0c8947d3ecb631c80accda6c7a1b`**. Header short form: **`efb5e6e0e986`**.

Forecast snapshot: **`806032f64da14561b81c55e72179ec22f299774fa97b9b5f08c4742909f9c0bd`**.

`app/data`, `data`, `pipeline` and `.github` retain their base bytes. Training-only calibration, full-population normalization, model selection/artifact guards and all original hash assertions remain intact. No raw source was redownloaded and no production model was rebuilt. The exact preserved input archive was extracted locally for verification; the supplied environment was used without installation or modification.

The evaluated original `audit/release-baseline/app.js` still matches the original diagnostic hash. The active presentation receipt was deliberately updated, retaining the previous `f0fa600` UI hash. Historical release manifests/reports retain their original scope; the new [build/package receipt](accessibility/build-and-package.json) binds this candidate. `.gitattributes` covers the new hash-bound `app/build.json`; existing audit/tools/tests byte rules cover the other additions.

A **24-file static preview ZIP**, including `build.json`, is prepared beside the checkout. It was read back and compared byte-for-byte; SHA-256 is `3edd4ad7c698057798b700e9872baacafc548b957482092ae2d9f6f2b5eee006`. It contains the app only, no raw input archive, environment or audit recordings. Nothing has been uploaded.

## Reproduce locally

Use the preserved environment and current [SETUP](../SETUP.md); no raw downloads or model build commands are needed. Serve `app` on loopback port 8891. The header identifies the UI build; that local address is not a phone preview.

```powershell
node --check app/app.js
node --check app/map3d.js
node --check app/optimizer.js
python tools/verify_static.py
python tools/verify_accessibility_integrity.py
python -m pytest tests -q --basetemp audit/pytest-accessibility-repeat
node tests/snapshot_parity.js
```

For browser regressions, use the already-installed task-local Playwright and axe-core, set `NODE_PATH`, `XYLEM_AXE`, `XYLEM_QA_URL=http://127.0.0.1:8891`, and distinct evidence directories (`XYLEM_A11Y_OUT` / `XYLEM_QA_OUT`) before each run. The default paths are documented in the scripts. Public map reads are needed for live 3D checks. Preserve previous evidence before repeating.

```powershell
node tests/accessibility_browser.cjs
node tests/release_browser.cjs
python tools/verify_browser_exports.py --input-dir audit/accessibility/release-verified --output audit/accessibility/export-reconciliation-repeat.json
git diff --check
```

After deliberate UI edits, review the diff before regenerating `python tools/presentation_build.py --write` and the active presentation receipt; preserve the archived evaluated UI and rerun relevant checks. Never regenerate a receipt merely to hide a failed integrity check.

## Human review and next authorization

Use [PHONE_TEST.md](PHONE_TEST.md) for the 15â€“20-minute physical-phone smoke test, separate spoken AT walkthrough and observation log. An approved HTTPS preview of **this exact build** must be established and remotely hash-verified first. A deployment, old Pages address, browser emulation, DOM mutation or accessibility-tree inspection cannot substitute for that review.

Fresh authorization is required before pushing this local candidate, creating a PR, manually deploying/publishing or sending outreach. The prepared Pages path would publish the app publicly and replace the existing repository site; it remains manual-only. No such authorization is inferred from the old `f0fa600` push.

Annual failure probabilities and constant-annual-risk multi-year conversion remain unvalidated. Reach and costs remain modeled; routes approximate. Missing publication vintages and complete historical failure episodes require external evidence, not these UI repairs.
