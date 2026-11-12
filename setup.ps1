param(
    [ValidateSet('Static','Verify')][string]$Mode = 'Static',
    [string]$Python = 'python',
    [string]$Wheelhouse = '',
    [string]$InputArchive = ''
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Run-Python([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE) { throw "Python step failed: $($Arguments -join ' ')" }
}
if ($Mode -eq 'Static') {
    Run-Python $Python @('tools/verify_static.py')
    Write-Host 'Serve app: python -m http.server 8885 --bind 127.0.0.1 --directory app'
    Write-Host 'Open http://127.0.0.1:8885 (use HTTP on loopback, not a file URL).'
    exit
}
if (!$Wheelhouse -or !$InputArchive) { throw 'Verify needs -Wheelhouse and -InputArchive; see SETUP.md.' }
$wheelPath = (Resolve-Path -LiteralPath $Wheelhouse).Path
$inputPath = (Resolve-Path -LiteralPath $InputArchive).Path
if (Test-Path -LiteralPath '.venv') { throw 'Use a fresh checkout: .venv already exists and will not be overwritten.' }
Run-Python $Python @('-m','venv','.venv')
$envPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
Run-Python $envPython @('-m','pip','install','--no-index','--find-links',$wheelPath,'--require-hashes','-r','requirements-reproduction.txt','--disable-pip-version-check')
Run-Python $envPython @('-m','pip','check')
Run-Python $envPython @('tools/preserved_inputs.py','extract',$inputPath,$PSScriptRoot)
$env:OMP_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
Run-Python $envPython @('tools/verify_static.py')
Run-Python $envPython @('tools/check_reproduction.py')
Run-Python $envPython @('-m','pytest','tests','-q','--basetemp','audit/pytest-setup')
node tests/snapshot_parity.js
if ($LASTEXITCODE) { throw 'Optimizer parity failed' }
Write-Host 'Verified frozen results and feature generation. Full model training was not rerun.'
Write-Host 'Serve app: .venv/Scripts/python.exe -m http.server 8885 --bind 127.0.0.1 --directory app'
