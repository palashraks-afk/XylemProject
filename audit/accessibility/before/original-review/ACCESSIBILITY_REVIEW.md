# Xylem accessibility follow-up — review, not certification

Reviewed 2026-11-11 Pacific / 2026-11-12 UTC against GitHub main `f0fa6006032f6b614276395c5628596a63b966fa`. The repository remains clean and no application files were changed. Findings/evidence live in this sibling directory, outside the committed release receipt. No push, PR, deployment, publication or outreach occurred during this review.

**The physical-phone and spoken screen-reader review is not completed.** There is useful app work the agent can do before asking a human to test. Earlier passing release tests were narrower; they did not establish general accessibility or device conformance.

## What was actually done

- Eight axe-core 4.10.3 scans in installed Chrome 157.0.8103.78 and Edge 119.0.2151.72: default plan, expanded scenario controls, Method and tests, and 320px layout. These were automated browser sessions, not physical mobile devices. The semantic scans deliberately forced the external 3D style to fail and used the saved 2D map; normal live 3D was inspected separately for an overlay issue.
- Automated keyboard/focus checks in both browsers: range input, Tab to a budget preset, tab ArrowRight/Home behavior, opening a system, and closing its card.
- Responsive layout checks at 640 and 320 CSS pixels. Both browsers' document widths equaled their viewport widths. This is a reflow proxy, not actual 200%/400% browser zoom or a physical phone test.
- A real Windows Chrome window exposed named sliders, tabs, a tab panel and table headers in the Windows accessibility tree. The desktop rendering was inspected. Native input was unreliable (a geometry error, then focus did not move to the intended budget control), so no successful native keyboard or spoken-assistive-technology test is claimed. See `native-tree-observation.json`.
- A live 3D view at 960 CSS pixels reproduced a visible map-overlay collision, measured only after the real summary text loaded. See `intermediate-overlay.json` and `intermediate-960px.png`.
- No ADB/iOS command was available in the inspected PATH; NVDA/Firefox were absent from their common install locations, and NVDA/Narrator were not running. These limited checks do not prove that no device or alternative installation exists. No physical phone connection or speech output was accessible through the tools used.

## Findings the agent can repair

| Finding | Evidence | Suggested next work |
|---|---|---|
| Low-contrast status badges | Both desktop browsers: axe flags 10 rendered badges. At-Risk orange is 2.33:1 against its tinted background; Failing red is 4.26:1. These are 12px labels. `chrome-default-axe.json`, `msedge-default-axe.json`; `app/style.css:71–72`. | Darken badge text or adjust background, preserve readable text status and map meanings. Recheck all status instances; do not only fix the first 10 scanned rows. |
| Method tables lack an explicit keyboard scrolling target | Both browsers: `scrollable-region-focusable` on two Method table containers. `chrome-method-axe.json`, `msedge-method-axe.json`; `app/app.js` around the Stage 1/Stage 2 tables. | Give overflow regions appropriate keyboard focusability and accessible names. Verify horizontal and vertical arrow scrolling while focused, without creating a keyboard trap. |
| Closing a system card loses keyboard position | Automated keyboard activation of Close leaves `document.activeElement` as BODY in both browsers. `summary.json`. | Restore focus to the triggering system/search control, with a sensible fallback if the table was rerendered. Test opening, updating and closing a card. |
| Dynamic result/status announcements need design and AT verification | `#kpis`, `#scenOut` and `#detail` have no live/status semantics. DOM fact in `summary.json`; actual spoken behavior is unverified. | Add a concise, non-flooding status announcement for completed plan/scenario updates; preserve focus. Do not make a whole table or every one of 40 progress iterations announce. Verify with a human screen-reader user/tester. |
| Intermediate-width 3D overlay collision | At 960px: view buttons occupy x347–499, summary chip x437–839 at the same y position. Bounding rectangles overlap; live desktop screenshot also showed obscured summary content. | Stack/reposition overlays or adjust the breakpoint. Test 900–1100px, long cost/population labels and narrow 3D views. Preserve map controls and data values. |

The first two are automated rule failures, the third is a directly reproduced focus behavior, the fourth is an observed semantic gap requiring speech validation, and the fifth is a directly measured layout collision. These are distinct from an assertion that a screen reader or physical phone was tested.

Additional review leads: tabs have selected-state/name updates but no `aria-controls` linkage; no meaningful skip-to-results link was present. Treat these as implementation/AT review items rather than automatically claiming separate confirmed WCAG failures. Native range output included numeric slider positions; verify currency/value announcement, including the 3D budget slider, with an actual screen reader.

## Limits of the automated results

The 320px scans happened to return zero violations, but hundreds of text-contrast nodes were listed as **incomplete**, including offscreen table cells/context. Zero returned violations there is not a passing contrast or accessibility certificate. The Method view had separate contrast items requiring manual review. Raw checkbox widgets measured 13×13px, but their associated labels are clickable: that measurement alone does not establish a target-size violation. Assess actual hit areas and spacing.

The agent can fix and retest the code issues, inspect labels/roles/focus, examine zoom/forced-colors behavior where tools permit, rerun the appropriate browser checks, and interpret user-supplied device observations. Estimated initial repairs and targeted regression checks: roughly 1–3 hours, subject to findings. No fix is implemented by this review-only handoff.

## What needs the user or a human tester

Use a physical iPhone with Safari/VoiceOver or Android with Chrome/TalkBack. Testing one platform does not cover the other. A screen-reader-experienced tester is preferable for evaluating the spoken workflow. This agent cannot honestly certify speech, touch ergonomics, OS text scaling, mobile browser behavior or actual downloads without that access and evidence.

First arrange an approved phone-accessible **HTTPS preview of the same build**. `http://127.0.0.1:8890` only serves this computer; it is not a phone review link. The app's browser crypto checks need a secure context, so plain LAN HTTP is not a reliable substitute. Do not test an older Pages build and attribute it to this commit. Creating a hosted preview or deploying still needs explicit authorization. No firewall/security change or upload was performed.

After the agent repairs the findings, budget 15–20 minutes for a basic physical-device smoke test and additional time for an assistive-technology walkthrough:

1. Record phone model, OS, browser/version, build/commit and orientation.
2. In portrait and landscape, choose $100M and $500M; read all controls and totals. Increase text size/pinch zoom and check for hidden text or overlapping controls. Check the 3D view if supported and the 2D fallback.
3. Set the small-system reserve to 30%, inspect a selected system, close it, and check where navigation returns. Try fixed-share mode. Ensure reserve/routing/cost alternatives do not retain stored stability values.
4. Turn on VoiceOver/TalkBack. Navigate/adjust the budget and reserve controls; inspect tabs, table headings and system details. Check whether completed results are announced, whether focus remains sensible, and whether maps can be bypassed to reach the controls/tables. Do not pass based solely on the visual labels.
5. Download the CSV. Confirm a real file reaches Files/Downloads and its budget, count and snapshot metadata match the displayed scenario. Note any browser-specific download prompts or failures.
6. Report the exact steps, expected/actual behavior and device/build. Screenshots or a short recording help; redact unrelated personal content. The agent can then diagnose and repair app defects.

## Evidence and repeat commands

`review.cjs` is the read-only browser audit; `summary.json`, eight `*-axe.json` files, 320/640px screenshots, the intermediate-width evidence and native-tree observation are beside this report. Keep these separate from the older release test count.

Run the original app locally with Python's HTTP server on loopback port 8890. With the already installed task-local packages:

```powershell
$env:NODE_PATH='C:\Users\sai71\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node review.cjs
```

The script expects `../accessibility-tools/node_modules/axe-core/axe.min.js`. Keep old evidence before rerunning. It does not modify the repo or publish results.

Interpretation references: small-text thresholds in [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), the 320 CSS pixel equivalence and map/table exceptions in [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and hit-area/spacing exceptions in [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). These support the test interpretation; they do not turn this scoped review into certification.
