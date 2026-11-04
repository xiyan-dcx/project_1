$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = (Get-Command python).Source }
Push-Location $repoRoot
try {
  pnpm --filter @research-platform/system-3 build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  pnpm --filter @research-platform/system-3 test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & $python -m unittest discover -s tests
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
