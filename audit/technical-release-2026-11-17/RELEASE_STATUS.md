# Xylem technical release — November 17, 2026 Pacific

The corrected desktop prototype is verified locally. Public deployment remains blocked by repository administration; this is not a published release.

## Changes

- Corrected CA5610029 from the frozen source label `10/30/2026` to **Vineyard Avenue Acres MWC** in search, cards, tables, maps and CSV. A guarded presentation overlay applies only to that exact ID and bad label. No source data, costs, model predictions, weights or optimization methods were edited.
- Official identity evidence: [California Drinking Water Watch](https://sdwis.waterboards.ca.gov/PDWW/JSP/WaterSystemDetail.jsp?tinwsys_is_number=6171&tinwsys_st_code=CA&wsnumber=CA5610029), verified November 17 Pacific. Original ingestion cause remains unresolved; the raw snapshot is deliberately preserved.
- Added checks before the existing manual Pages deployment: static integrity, JavaScript syntax, label regressions and all 110 saved allocation cases.
- Added `tools/verify_hosted.py` for exact HTTPS file verification after publication. It rejects non-HTTPS/cross-origin redirects and reports a failure if HTML or any asset is modified by the host.
- Refreshed the UI build receipt and presentation provenance. Prior provenance and failed test-run evidence are retained in this directory.

## Verification newly completed

| Check | Result |
| --- | --- |
| Full existing Python suite | **121 passed in 10.18 seconds** |
| New guarded-name regressions | **2 passed** |
| Existing Python/browser allocation parity | **110 matched** |
| Static integrity | **PASS**: 10 saved data files, 6 vendor hashes, full presentation receipt |
| Frozen inputs/results | **PASS**: 51 tracked files under app/data, data and pipeline retain baseline hashes |
| Restored historical inputs | **335 source hashes verified**; copied from preserved local inputs, no source redownload |
| Browser budget examples | **PASS**: $100M = 20 systems / 171,738 modeled people; $500M = 97 / 476,663 |
| Isolated 30% priority example | **PASS**: 112 systems, 70 small systems / 393,742 modeled people |
| Corrected identity | **PASS** in actual search, funded table, card and downloaded CSV |
| Interactive sensitivity | **PASS**: 40 runs completed; 81/97 selected in at least 80% of runs; CA5610029 selected 28/40 |
| 2D map control | **PASS** |
| Real desktop CSV | **PASS**: downloaded through the browser, independently matched in Python on IDs, costs and weights; exact cost $487,919,470 |
| JavaScript syntax and whitespace | **PASS** |

UI build: `340f94b2ae41f9ac9e9077fa581700c0708dec9427079717bf4ac91e83cd9cfa`.
Unchanged data snapshot: `806032f64da14561b81c55e72179ec22f299774fa97b9b5f08c4742909f9c0bd`.
The original app data remains hash-bound. The new label module is bound in the new UI receipt. Existing historical reviews describe their earlier builds and remain preserved.

The first extraction/test attempts encountered Python write failures in the OneDrive checkout. Verification was completed in an isolated C:/workspace checkout, with explicit working and temporary directories. No test expectations or performance thresholds were weakened. See python-tests-attempt-01.log and python-tests-final.log.

## Publication blocker and exact next actions

Fresh GitHub state: `has_pages: false`; connected account has push access, but **admin=false and maintain=false**. The latest historical Pages job fails at configure-pages because Pages is not enabled. Retrying that older run would use old source and will not fix enablement.

1. Existing repository owner **palashraks-afk**, or another current admin/maintainer, opens [Settings → Pages](https://github.com/palashraks-afk/XylemProject/settings/pages).
2. Set **Build and deployment → Source → GitHub Actions**. Reuse the existing workflow.
3. After the corrected commit is on main, open [Deploy app to GitHub Pages](https://github.com/palashraks-afk/XylemProject/actions/workflows/pages.yml) and manually run it on main. Preserve manual-only publication.
4. Verify the successful run's source SHA and actual Pages URL, then run:
   `python tools/verify_hosted.py https://palashraks-afk.github.io/XylemProject/ --output audit/technical-release-2026-11-17/hosted-verification.json`
   This URL is the expected project-site convention, not a currently verified live demo. Use the actual Pages URL if different.
5. Check the HTTPS app in a browser, repeat the $500M plan and real CSV handoff, and verify anonymous judge access.

Public Pages publication and exact hosted verification are **NOT COMPLETED**. The existing private Sites preview was not changed, made public, or offered as the corrected release. Its historical injected-HTML mismatch remains a failure under the retained exact-byte requirement.

## Human/external evidence still unavailable

- Physical-phone behavior, spoken VoiceOver/TalkBack and actual phone downloads remain unverified. Previous emulation/desktop checks are not physical-device evidence.
- Practitioner usefulness and actual water-funding adoption require an intended user.
- Real project costs, receiver capacity, readiness, consent and operating costs require project data.
- Annual and multi-year failure probabilities remain unvalidated. No model retraining was performed. Current findings are diagnostic, and selected-system population is not measured clean-water benefit.

These are evidence limits, not missing dashboard features. The code is ready for the demonstrated desktop scope; it is not a validated funding recommendation or construction design.
