$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:BENCH_ENABLE_RUN = '0'
$env:BENCH_DRIVER = 'ssh'
$env:RESULTS_DIR = Join-Path $projectRoot '.local/results'
& "$projectRoot/.venv/Scripts/python.exe" -m uvicorn app:app --app-dir apps/system-3/src/api/server --host 127.0.0.1 --port 8000
exit $LASTEXITCODE
