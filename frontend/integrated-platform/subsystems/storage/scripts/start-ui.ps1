$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
pnpm --filter @research-platform/system-3 dev
exit $LASTEXITCODE
