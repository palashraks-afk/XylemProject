$ErrorActionPreference = 'Stop'
$previewRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $previewRoot
$python = 'C:\Users\sai71\XylemEvaluation\.venv\Scripts\python.exe'
$env:OMP_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
# Uses preserved raw inputs. No acquisition, remote writes or publication.
foreach ($script in @('model_selection.py', 'calibrate_planner.py')) {
    & $python -X utf8 "pipeline/$script"
    if ($LASTEXITCODE) { throw "Failed: $script" }
}
& $python -X utf8 pipeline/evaluate_planner.py --bootstrap 1000
if ($LASTEXITCODE) { throw 'Evaluation failed' }
foreach ($script in @('ml.py', 'build.py', 'seal_snapshot.py', 'compare_allocations.py')) {
    & $python -X utf8 "pipeline/$script"
    if ($LASTEXITCODE) { throw "Failed: $script" }
}
& $python -m pytest tests -q --basetemp audit/pytest-reproduction
if ($LASTEXITCODE) { throw 'Tests failed' }
node --check app/app.js
if ($LASTEXITCODE) { throw 'JavaScript syntax check failed' }
Write-Host 'Start preview: python -m http.server 8876 --bind 127.0.0.1 --directory app'
