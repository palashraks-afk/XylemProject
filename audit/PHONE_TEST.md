# Physical phone and spoken assistive-technology review

Status: **NOT RUN — human tester required.** Local automation is recorded separately in [ACCESSIBILITY_REPAIRS.md](ACCESSIBILITY_REPAIRS.md). Testing one platform does not cover the other.

## Preview gate

The exact static candidate is identified by **UI build `efb5e6e0e986`** in the header; its full identifier and all served asset hashes are in [../app/build.json](../app/build.json). The forecast snapshot starts `806032f64da1`. CSV comments now include the full UI build and forecast snapshot identifiers.

No phone-accessible preview has been published. `http://127.0.0.1:8891` serves this computer only. Plain LAN HTTP is unsuitable for the app's secure-context crypto checks. An older Pages site is not this build.

The prepared publication path is: obtain explicit owner authorization to push this reviewed candidate and manually run the existing Pages workflow on that exact commit. Keep `workflow_dispatch` as its only trigger. Confirm the intended repository Pages address/settings before running it; do not imply a private preview if the resulting site is public. This replaces the app served at that Pages address. An owner-approved alternative HTTPS host can use the prepared static ZIP instead.

After authorization and publication, the agent must fetch the HTTPS `build.json` and every file in its `sha256` map, verify their exact bytes against the local candidate, check that the page is a secure context and that the manifest loads, then smoke-test the default plan and a CSV. Only then provide the verified phone URL. A successful deployment job alone is insufficient. If main changes while approval is pending, inspect/reconcile and retest before pushing; never force-push.

## Record before testing

| Field | Tester entry |
|---|---|
| Tester / date | |
| Phone model | |
| OS / version | |
| Browser / version | |
| VoiceOver or TalkBack / version | |
| Approved HTTPS URL / commit | |
| Full UI build from `build.json` | |
| Header UI build / forecast snapshot | |
| Text size / zoom / orientation | |

Use a physical iPhone with Safari/VoiceOver and a physical Android with Chrome/TalkBack when both are available. Mark the unavailable platform **UNVERIFIED**. A screen-reader-experienced tester should assess the spoken workflow.

## Phone smoke test — about 15–20 minutes

1. Confirm the HTTPS page loads without a snapshot error. Record header build `efb5e6e0e986` and snapshot `806032f64da1`; do not attribute observations from another build to this candidate.
2. At default priorities, choose **$100M**: expect **20 systems / 171,738 modeled people**. Choose **$500M**: expect **97 systems / 476,663 modeled people**, approximately **$488M** spent (CSV exact cost **$487,919,470**). These are frozen modeled allocations, not measured benefit.
3. Repeat in portrait and landscape. Enlarge OS/browser text and pinch zoom. Check control labels, totals, table content and the 3D summary/view buttons. Table scrolling is intentional; other content should remain readable. Record actual settings and any obscured content.
4. Set the small-system reserve to **30%**. Inspect a system from the table and from search; close the card and verify navigation returns to the invoking system or search. Change costs while a card is open; check its values update. If its original row disappears, search is the intended fallback.
5. Try **Fixed share → 50%**, then routing and cost alternatives. Stored stability should be unavailable for incompatible settings. The card, popup, totals and CSV must describe the same controls. Restore defaults before comparing the numbers in step 2.
6. Try 3D where supported and switch to 2D. If live map resources fail, the notice, saved boundaries, controls, tables and export should remain usable. Do not report a forced browser failure test as a real phone network failure.
7. Download **Download plan (CSV)**. Confirm an actual file arrives in Files/Downloads or the browser's documented download location. Open it: match UI build, snapshot, budget, selected-system count, modeled population, costs and scenario metadata to the visible plan. Record any prompt, missing file, bad filename or inability to open it. A download-event assertion on a desktop browser does not pass this step.

## Spoken VoiceOver / TalkBack walkthrough — additional time

1. Navigate by touch exploration and next/previous controls. Confirm budget and reserve names and values are understandable; the 3D budget should announce currency rather than only a 0–100 slider position. Adjust the range with the platform's screen-reader gestures.
2. Change several priorities in quick succession. Expect one short settled plan summary, no reading of entire tables and no announcement for each intermediate slider movement. Check the timing, actual words and whether the current control retains focus. Record missing, duplicate, truncated or disruptive speech verbatim where possible.
3. Run the 40 cost scenarios. Expect one completion summary, no stream of forty progress messages, and focus retained at the trigger. Run again and change a control during execution: expect cancellation/current-plan information, with no stale completion announcement.
4. Open a system. The heading is the initial keyboard focus target; Close follows it. Confirm the card is discoverable, fields make sense, refreshes preserve position, and closing returns sensibly. Actual speech and virtual-cursor behavior must be observed, not inferred from DOM focus.
5. Inspect tab names/selected state, table headings and Method tables. Try scrolling to offscreen columns/rows and leaving those regions. Confirm that the skip-to-results path and normal navigation can bypass the maps without becoming trapped in their application regions.
6. Complete the CSV workflow with the screen reader enabled, including OS download prompts and locating/opening the saved file.

## Observation log

Use one row per actual observation; leave unperformed checks UNVERIFIED. A missing announcement, overlap or lost position is a failure even if an automated scan passed.

| Platform / build | Steps and settings | Expected | Actual words / behavior | PASS / FAIL / UNVERIFIED | Evidence / issue |
|---|---|---|---|---|---|
| iPhone / Safari / VoiceOver | | | | UNVERIFIED | |
| Android / Chrome / TalkBack | | | | UNVERIFIED | |
| Actual device download | | | | UNVERIFIED | |
| OS text scaling / zoom | | | | UNVERIFIED | |

Record exact reproduction steps; screenshots or a short recording help. Redact unrelated personal content. The agent can diagnose observations and prepare further local repairs. No practitioner contact, endorsement or outreach is implied.

Annual failure probabilities and the constant-annual-risk multi-year conversion remain unvalidated. Reach and costs remain modeled; routes approximate. Physical accessibility review does not resolve those scientific limits.
