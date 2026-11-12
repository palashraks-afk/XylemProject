# Run and verify the California demonstration

The static demonstration and full model training have different requirements. These instructions never fetch source data. Use this release candidate with its frozen results; see [release review](audit/RELEASE_REVIEW.md).

## Static app: Python standard library only

From this repository, with Python 3.12+ on PATH:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Mode Static
python -m http.server 8885 --bind 127.0.0.1 --directory app
```

Open http://127.0.0.1:8885 in Chrome or Edge. Keep the server running during review. Do not open `index.html` as a file: fetching saved data and browser SHA-256 checks need HTTP/HTTPS. No raw input ZIP, machine-learning installation or model rebuild is needed to demonstrate the saved app. The verification checks all 10 data files, the snapshot ID and vendored map-library hashes. Node 18+ additionally runs `node tests/snapshot_parity.js` (110 old/new cases).

The pinned Leaflet 1.9.4 and MapLibre 5.6.0 assets are local. Live 3D style, terrain, imagery and 2D basemap tiles still need internet. If they fail, the app explains the failure and retains the saved 2D boundaries, allocation controls, tables and CSV. This is a California prototype, with modeled costs/reach and approximate routes.

To repeat browser QA while that local server runs, use installed Chrome and Edge and a separate Node tool directory:

```powershell
npm install --prefix ..\qa-tools playwright@1.62.1
$env:NODE_PATH = (Resolve-Path ..\qa-tools\node_modules).Path
node tests/release_browser.cjs
node tests/release_map_failures.cjs
.\.venv\Scripts\python.exe tools/verify_browser_exports.py
```

Check each exit status. The last command needs the Verify environment below. Browser QA writes evidence under `audit/release-qa/`; retain existing evidence before repeating it. No browser installation, raw-data acquisition or remote publication is part of those checks. Normal map checks use live third-party map servers; forced-failure checks also block/stall them deliberately.

## Verify frozen results in an independent environment

Verified platform: Windows x64, Python 3.12.14, Node 24.16.0, Chrome and Edge versions in `audit/release-qa/browser/checks.json`. A separately installed Python 3.12 is suitable; the interpreter's standard library can be shared, but `include-system-site-packages` must be false. Other operating systems/Python versions need their own native wheels and verification.

Transfer these local files together: this repository, `preserved-inputs.zip`, its `.manifest.json` and `.sha256`, and `wheelhouse/`. The wheels include all 22 direct/transitive dependencies. `requirements-reproduction.txt` pins each package and wheel hash. This avoids the prior lock's unpinned transitive packages and unavailable absolute runtime wheel path.

From a fresh checkout without `.venv`, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Mode Verify -Python python -Wheelhouse ..\wheelhouse -InputArchive ..\preserved-inputs.zip
.\.venv\Scripts\python.exe -m http.server 8885 --bind 127.0.0.1 --directory app
```

This creates an isolated environment, installs only verified local wheels, checks dependencies, validates/extracts all 335 preserved raw files, checks the model fingerprint/calibration/selection guards, generates the historical feature panel, runs the test suite and checks Python/browser allocation parity. Different existing input bytes cause failure before extraction writes anything. Existing `.venv` is never overwritten.

Pillow 13.0.0 was obtainable as a Windows CPython 3.12 wheel. Its SHA-256 differs from the original bundled wheel; all 304 preserved terrain images decode to identical RGB pixels, and the independently regenerated 31,740-row / 49-column historical panel matches the preserved panel exactly. The original environment was not modified. Receipts: `audit/release-qa/pillow-comparison.json`, `reproduction.json`, install logs and the wheel manifest.

## Preserve and transfer inputs

The prepared ZIP is about 149 MB (142 MiB), containing the exact 335 raw files in `data/planner_evaluation.json`, plus `SHA256-MANIFEST.json`. Its whole-file SHA-256 is recorded in `audit/release-qa/input-package.json`. It excludes generated pickle caches, environments, Git metadata and unrelated work. Nothing was redownloaded. Raw bytes total 313,425,074. Some are contextual inputs rather than historical model features.

To create another copy from a preserved checkout, use Python without extra packages:

```powershell
python tools/preserved_inputs.py pack C:\path\to\preserved-checkout ..\preserved-inputs-new.zip
python tools/preserved_inputs.py extract ..\preserved-inputs-new.zip C:\path\to\fresh-checkout
python tools/preserved_inputs.py verify C:\path\to\fresh-checkout
```

The pack operation verifies against the frozen receipt first. Extraction rejects duplicate/extra members, path escapes, corrupt members, altered manifest and different destination bytes. It checks the entire archive before writing. Transfer locally or through a recipient-approved file channel; no upload/publication was performed. Confirm any redistribution conditions before broader distribution; the packaging tool does not grant data rights.

## Full model reproduction is a separate operation

No full selection/calibration/model refit was rerun for these presentation fixes. Existing numerical results and all app data are unchanged. Independent setup, source hashing, exact feature regeneration, saved-result arithmetic, artifact guards and allocation parity are verified; a complete clean model-training rerun is **unverified in this release task**. It would take an additional measured compute run; the historical environment logs are not a new timing guarantee.

If input, feature, selection, calibration or scoring code changes, rebuild the affected chain in a disposable checkout with the preserved inputs and pinned dependencies:

```powershell
$env:OMP_NUM_THREADS='2'; $env:OPENBLAS_NUM_THREADS='2'
python -X utf8 pipeline/model_selection.py
python -X utf8 pipeline/calibrate_planner.py
python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
python -X utf8 pipeline/ml.py
python -X utf8 pipeline/build.py
python -X utf8 pipeline/seal_snapshot.py
python -X utf8 pipeline/compare_allocations.py
python -m pytest tests -q --basetemp audit/pytest-rebuilt
node tests/snapshot_parity.js
```

Check each exit status before proceeding. These commands overwrite generated results; do not run them in the reviewed candidate simply to demonstrate the UI. A new evaluation hashes its active UI; the archived presentation-supersession test/receipt must then be deliberately retired or revised as part of reviewing the new result, rather than changing a hash to suppress failure. The release receipt preserves the evaluated original UI bytes and additionally binds the current UI; every original model/source/output hash remains checked.

Previously examined 2025→2026 outcomes remain diagnostic. Annual failure probabilities and constant-annual-risk multi-year conversion remain unvalidated. Missing publication vintages and complete failure histories require external evidence, not an additional coding pass. No diagnostic outcomes may tune the model or calibration.

GitHub Pages remains manual-only. Push, PR creation, deployment, publication and outreach require new explicit authorization.
