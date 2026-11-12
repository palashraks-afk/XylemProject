Continue Xylem's California v1 accessibility work. Complete the code-level repairs you can verify locally, then give me a short physical-phone checklist and state clearly what requires me or a human tester. Do not call browser emulation, an accessibility-tree dump, or automated checks a real-phone or spoken screen-reader review.

Repository: https://github.com/palashraks-afk/XylemProject
Latest verified main: f0fa6006032f6b614276395c5628596a63b966fa. Inspect newer changes, applicable AGENTS.md, status and diffs first. Use an isolated checkout and preserve existing work. Read audit/NEXT_CHAT_HANDOFF.md, audit/PUSH_HANDOFF.md, audit/RELEASE_REVIEW.md, audit/APP_REFRESH_REPORT.md, README, GRADING and SETUP.md.

Read this new local review and its evidence before coding:
C:\Users\sai71\.codex\visualizations\2026\11\12\01a1ce77-724c-75d3-8916-457d3d586b04\release-work\accessibility-review\ACCESSIBILITY_REVIEW.md

Its sibling NEXT_CHAT_PROMPT.md is this prompt. Evidence includes summary.json, eight axe-core 4.10.3 scan JSONs, screenshots, native-tree-observation.json, and intermediate-overlay.json. The review did not modify the repository or push anything. Original repo checkout:
C:\Users\sai71\.codex\visualizations\2026\11\12\01a1ce77-724c-75d3-8916-457d3d586b04\release-work\XylemRelease

Confirmed/reproducible repair tasks:
1. Status badges: At-Risk contrast 2.33:1 and Failing 4.26:1 for 12px labels in both desktop browsers; app/style.css around lines 71–72. Repair all instances and retest actual foreground/background combinations.
2. Two Method tables were flagged scrollable-region-focusable. Give overflow regions appropriate keyboard focus and accessible names, then verify scrolling without traps.
3. Closing a system card by keyboard leaves focus on BODY. Restore it to the invoking system/search control, including after table rerendering.
4. Completed plan/scenario/detail updates have no live/status targets. Design concise, non-flooding announcements and preserve focus. DOM absence is confirmed; actual speech is unverified and needs human validation.
5. At 960px, filled 3D summary and view buttons overlap. Fix intermediate widths, long labels and narrow map layouts. Check 900–1100px in addition to mobile/desktop presets.
Review tab-to-panel linkage, a skip-to-results path and the 3D budget slider's announced value as follow-up items; do not mislabel unverified speech as a confirmed failure.

Keep all model/data/scoring bytes frozen unless a genuinely relevant change requires regeneration. Preserve training-only calibration, full-population normalization and artifact/hash checks. The old evaluation hashes its UI: the preserved original is audit/release-baseline/app.js, while audit/release-qa/presentation-provenance.json binds the active UI too. Update presentation provenance deliberately after real UI edits and retain original checks; do not bypass tests. Exact-byte rules in .gitattributes must cover new hash-bound files. Do not rebuild models or redownload raw sources for these UI repairs.

Existing evidence: 121 Python tests, 110 Python/browser allocation matches, 40 resolved release browser checks, 40 reconciled CSVs and 335 preserved raw hashes. These are not accessibility certification. This later audit found the issues above. Hundreds of axe contrast cases were incomplete; zero returned violations at 320px is not an all-clear. Native Windows UIA inspection succeeded, but native input was unreliable; no successful native keyboard/zoom or spoken screen-reader test was established. Physical phones, iOS/Safari, TalkBack/VoiceOver and actual device downloads remain unverified.

The sibling release-work directory contains an independent Python environment, wheelhouse, preserved-input ZIP/manifest and XylemPushVerify. The existing release checkout has .venv/Scripts/python.exe. Leave C:\Users\sai71\XylemEvaluation and C:\Users\sai71\XylemProject untouched. Use current SETUP.md rather than reinstalling into the supplied environment.

Run targeted accessibility/keyboard/contrast/layout checks, appropriate existing regressions, allocation/export consistency checks after UI changes, and a fresh Git-checkout hash check when needed. Retain before/after findings and a clear pass/fail/unverified table. Finish with a concrete local candidate and concise report, not merely a plan.

I or a tester must do the physical-device and spoken-screen-reader part unless genuine device access becomes available. Arrange an approved HTTPS preview of the same build before asking us to test. Loopback 127.0.0.1 is this computer only, plain LAN HTTP can fail browser-crypto checks, and old Pages must not be assumed to contain the current code. After local repairs, guide a 15–20-minute phone smoke test plus an assistive-technology walkthrough: portrait/landscape, text size/zoom, budget/reserve/fixed share, system inspect/close, map fallback, announced result updates and CSV download/metadata. Record device, OS, browser, build and exact observations.

The previous push authorization covered the completed f0fa600 candidate. Do not push new work, create a PR, deploy, publish, expose a preview, change security/firewall settings or send outreach without new explicit authorization. Keep Pages manual-only. Proceed autonomously with reversible local repairs and tests; prepare concrete work before requesting release approval.

Scientific limits stay visible: previously examined 2025→2026 outcomes are diagnostic, annual failure probabilities and the constant-annual-risk multi-year conversion remain unvalidated, modeled reach is selected population under the objective rather than measured intervention benefit, costs are modeled and routes approximate. Missing historical validation requires external evidence, not coding alone.
