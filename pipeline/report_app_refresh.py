"""Verify local delivery evidence and write the app integration receipt."""
import csv
import hashlib
import io
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = '946881dd3f8ad1635598d51401b3e2a2246170ca'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def git(path, *args):
    return subprocess.check_output(['git', '-c', 'safe.directory=*', '-C', str(path), *args])


def main():
    snapshot = read('app/data/snapshot.json')
    evaluation = read('data/planner_evaluation.json')
    plans = read('audit/allocation-comparison/plans.json')
    summary = read('app/data/summary.json')
    forecast = read('app/data/forecast.json')
    preservation = {}
    prior = read('audit/source-preservation.json')
    for name, previous in prior.items():
        source = Path('C:/Users/sai71')/name
        diff = git(source, 'diff', '--binary')
        archived_diff = (ROOT/'audit/prior'/f'{name}.patch').read_bytes()
        status = git(source, 'status', '--short').decode('utf-8').strip()
        archived_status = (ROOT/'audit/prior'/f'{name}-status.txt').read_text(encoding='utf-8-sig').strip()
        record = {'path': str(source), 'branch': git(source, 'branch', '--show-current').decode().strip(),
                  'status_unchanged': status.replace('\r\n','\n') == archived_status.replace('\r\n','\n'),
                  'tracked_diff_unchanged': diff.replace(b'\r\n', b'\n') == archived_diff.replace(b'\r\n', b'\n'),
                  'untracked_hashes_unchanged': all(digest(source/p) == h for p,h in previous['current_untracked_hashes'].items())}
        assert record['status_unchanged'] and record['tracked_diff_unchanged'] and record['untracked_hashes_unchanged'], record
        preservation[name] = record
    source = Path(read('audit/input-copy.json')['source'])
    preservation['validation_checkout'] = {'path': str(source), 'head': git(source, 'rev-parse', 'HEAD').decode().strip(),
        'main': git(source, 'rev-parse', 'refs/remotes/origin/main').decode().strip(),
        'status': git(source, 'status', '--short').decode().strip()}
    assert preservation['validation_checkout']['head'] == BASE
    assert preservation['validation_checkout']['status'] == ''
    raw = {p:h for p,h in evaluation['input_and_code_hashes'].items() if p.startswith('data/raw/')}
    assert all(digest(ROOT/p) == h == digest(source/p) for p,h in raw.items())
    preservation['raw_files_verified'] = len(raw)
    (ROOT/'audit/preview-preservation.json').write_text(json.dumps(preservation, indent=2)+'\n')
    evidence = []
    for label, filename in [('default', 'default-500.csv'),
                            ('equity_reserve_routes', 'equity-reserve-routes-500.csv')]:
        path = ROOT/'audit/browser'/filename
        text = path.read_text(encoding='utf-8-sig')
        rows = list(csv.DictReader(io.StringIO('\n'.join(l for l in text.splitlines() if not l.startswith('#')))))
        expected = next(p for p in plans if p['setting'] == label and p['budget_musd'] == 500)['new']
        assert snapshot['id'] in text.splitlines()[0]
        assert sorted(r['water_system_id'] for r in rows) == expected['selected_ids']
        assert sum(int(r['people']) for r in rows) == expected['people']
        assert sum(int(r['cost_usd']) for r in rows) == expected['cost_usd']
        if label != 'default':
            assert all(r['stability_pct'] == '' for r in rows)
        systems = {s['id']:s for s in read('app/data/systems.json')}
        for row in rows:
            s = systems[row['water_system_id']]
            assert float(row['allocation_weight']) == (1 if s['failing'] else 1-(1-s['pf'])**5)
            if not s['failing']:
                assert float(row['snapshot_probability']) == s['pf']
        evidence.append({'setting': label, 'budget_musd': 500, 'rows': len(rows),
                         'people': expected['people'], 'cost_usd': expected['cost_usd'], 'csv_sha256': digest(path)})
    # Values observed in the live browser through its budget controls.
    observed = [(100,20,171738),(250,51,310205),(500,97,476663),(1000,196,941150),(2000,409,1600548)]
    for budget,n,people in observed:
        p=next(p for p in plans if p['setting']=='default' and p['budget_musd']==budget)['new']
        assert (p['systems'], p['people']) == (n,people)
    browser = {'default_presets_observed': observed, 'csv_reconciliation': evidence,
               'console_error_sample': [], 'screenshot': 'audit/browser/preview-desktop.png',
               'scope': 'Desktop local preview, five default budgets, Method text, 2D and 3D map rendering, default CSV and combined equity/reserve/routing CSV. No mobile or user-study claim.'}
    (ROOT/'audit/browser/checks.json').write_text(json.dumps(browser, indent=2)+'\n')
    test_line = next(line for line in (ROOT/'audit/tests-preview.log').read_text().splitlines() if ' passed in ' in line)
    hashes = {p:digest(ROOT/p) for p in ['app/data/forecast.json','app/data/systems.json','app/data/summary.json',
        'data/model_selection.json','data/planner_calibration.json','data/planner_evaluation.json',
        'audit/app-before/data/forecast.json','audit/allocation-comparison/summary.csv']}
    text = f'''# Local app refresh completion

Ready within the reviewed local scope. The forecast, dependent plans, summary and 200-scenario stress tests are rebuilt. README, GRADING, Method/forecast text, result tables, datasets, portability and reproduction instructions now match these outputs. The original app bytes remain in `app-before/`.

## Checkout and source preservation

- Base: `{BASE}` from `main`; isolated branch `preview/refreshed-forecast`.
- Local checkout: `{ROOT}`.
- Local preview: http://127.0.0.1:8876 (loopback only).
- No applicable nonempty repository `AGENTS.md` was found. The full handoff was read before implementation.
- Both legacy checkouts retain their statuses, tracked diffs and untracked hashes. The validation checkout remains clean at the requested commit. `{len(raw)}` raw input hashes match both that checkout and the refreshed diagnostic record. See `preview-preservation.json` and `input-copy.json`.
- The local review completed without redownload, push, PR, deployment or publication. The user subsequently authorized committing and pushing this work to GitHub. Pages remains manual-only; PR creation, deployment and other publication still require separate authorization.

## Integration decisions

The shared `planner_probabilities` path, full-population normalization, frozen training-only calibration and stale-artifact rejection remain intact. Selection and calibration were rebuilt after the hash-bound export code changed. The selected method and numerical coefficients match the audited map. No diagnostic outcomes selected a correction or method.

The current export refits base models on both assessment transitions: 5,266 system-years / 129 snapshot positives, normalized over 2,574 eligible current systems. The calibration map remains frozen from 2024→2025; transfer to this refit is unvalidated. One current At-Risk system (`{summary['fallback_at_risk_systems'][0]}`) lacks a model forecast and now uses the training At-Risk snapshot rate, {forecast['metrics']['fallback_at_risk_probability']:.8%}, instead of a diagnostic outcome rate.

Python plans previously used hidden precision while exported equity components and estimates were rounded. Both now receive the same full-precision optimizer inputs. A pending control change is flushed before CSV creation. `seal_snapshot.py` checks forecast lineage and creates a data manifest; the browser checks loaded SHA-256 values and rejects mixed files. CSV metadata records that same snapshot ID and limitations. Fixed-share exports report the chosen fixed weight rather than a forecast horizon weight. Stored stress stability is suppressed for reserve, route or cost-multiplier alternatives.

## Allocation changes

The inspectable comparison is [allocation-comparison/README.md](allocation-comparison/README.md), with `summary.csv`, full selected-ID sets in `plans.json`, named membership changes and hashes. It covers 55 old/new plans: five budgets and 11 existing control settings. Old plans are recomputed from old exported browser values; the old Python summary remains archived separately. The comparison combines the corrected forecast, fallback and precision repair; it does not isolate their causal contributions.

Default $500M: 90→97 systems, 539,915→476,663 modeled people, $488.417M→$487.919M costs; 12 added and 5 removed, Jaccard 83.3%. Default $1B: 171→196 systems, 1,084,241→941,150 modeled people. More selected systems can accompany lower unweighted reach under the refreshed weighted objective. These are modeled allocations, not measured intervention benefits or a guaranteed effectiveness gain. Per-system stored selection frequencies retain two-decimal snapshot precision; they describe sensitivity to the saved 200 scenarios, not outcome probabilities.

## Diagnostic evidence and limits

Archived primary: 2,633 systems / 61 positives overall, planner AUC 0.831; 586 / 32 At-Risk, AUC 0.764. Mean estimates 2.50% / 6.54%, observed 2.32% / 5.46%. The exact original November comparison remains separate: 582 / 50 At-Risk, AUC 0.756→0.739, paired 95% difference interval −0.053 to +0.017, mean corrected estimate 6.58% versus 8.59% observed. Rerunning the diagnostic calculation preserved the calibrated predictions; raw member scores can differ by floating-point summation order below 1e-15.

Previously examined 2025→2026 outcomes are diagnostic, not an untouched test. Annual failure probabilities remain unvalidated because historical availability and outcome dates are unresolved. Complete historical failure membership/episodes and original publication vintages are unavailable. Multi-year `1-(1-p)^h` assumes constant annual risk and is unvalidated. Brier improves in recorded comparisons; log loss does not always improve. Costs remain modeled, routes approximate and implementation California-only. Inherited self-grades are not quality evidence.

## Verification

- `{test_line.strip()}` (pre-refresh audit: 108 passed). Added checks cover exact exported forecast precision and training fallback, default-plan reproduction, preserved old bytes, 55-plan reconciliation, 110-case Python/browser parity and rejection of mixed artifacts. The source-drop expectation was updated from legacy mutable-source coverage to the exact nine historical-policy sources; no performance threshold was weakened.
- JavaScript syntax passed for `app.js`, `optimizer.js` and `map3d.js`; `git diff --check` passed.
- Browser displayed all five default budget totals and the primary archived/November diagnostic distinctions. Default $500M CSV: 97 systems / 476,663 people / $487,919,470; combined equity 2 + reserve 30% + routing: 114 / 394,101 / $485,850,493. Both CSVs match exact IDs, populations, effective costs and full-precision weights. The combined CSV has no incompatible stored stability values. No console errors were observed in the final sample.
- Screenshot and browser evidence are in `browser/`. Desktop checks only; no mobile test or user study is claimed.

## Hashes and reproduction

Snapshot ID: `{snapshot['id']}`.

| File | SHA-256 |
|---|---|
'''
    text += '\n'.join(f'| `{p}` | `{h}` |' for p,h in hashes.items())
    text += '''

The tracked and unignored delivery-file manifest is `preview-sha256.json`; raw source hashes and versions are in `../data/planner_evaluation.json`, with environment details in `runtime.json`, `requirements-lock.txt` and `environment-full.txt`. The app manifest is `../app/data/snapshot.json`.

Run from the isolated checkout, using preserved input bytes:

```powershell
$env:OMP_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
$python = 'C:\\Users\\sai71\\XylemEvaluation\\.venv\\Scripts\\python.exe'
& $python -X utf8 pipeline/model_selection.py
& $python -X utf8 pipeline/calibrate_planner.py
& $python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
& $python -X utf8 pipeline/ml.py
& $python -X utf8 pipeline/build.py
& $python -X utf8 pipeline/seal_snapshot.py
& $python -X utf8 pipeline/compare_allocations.py
& $python -m pytest tests -q --basetemp audit/pytest-reproduction
node tests/snapshot_parity.js
node --check app/app.js
& $python -m http.server 8876 --bind 127.0.0.1 --directory app
```

`reproduce-preview.ps1` runs the rebuild and checks without fetching sources. Stop an existing preview server before binding the same port. The captured browser CSVs and screenshot document this reviewed snapshot; refresh them after a changed snapshot before rerunning `pipeline/report_app_refresh.py`. Source/model/scoring changes require rebuilding the affected artifacts rather than editing recorded hashes to suppress errors. Numerical dependency and preserved input availability are prerequisites; do not replace unavailable sources with newer downloads.
'''
    (ROOT/'audit/APP_REFRESH_REPORT.md').write_text(text, encoding='utf-8')
    names = git(ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').decode('utf-8').split('\0')
    paths = {ROOT/name for name in names if name and name != 'audit/preview-sha256.json'}
    (ROOT/'audit/preview-sha256.json').write_text(json.dumps({p.relative_to(ROOT).as_posix():digest(p) for p in sorted(paths) if p.is_file()}, indent=2)+'\n')
    print(test_line.strip())
    print('Snapshot:', snapshot['id'])
    print('Report:', ROOT/'audit/APP_REFRESH_REPORT.md')


if __name__ == '__main__':
    main()
