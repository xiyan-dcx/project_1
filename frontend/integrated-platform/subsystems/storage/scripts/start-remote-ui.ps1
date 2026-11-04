$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:SYSTEM3_API_TARGET = 'http://127.0.0.1:8001'
# Always same-origin via the read-only adapter, never direct browser writes to remote.
$env:VITE_API_BASE = '/system-3/api'
$env:VITE_WS_BASE = 'ws://127.0.0.1:5174/system-3/ws'
pnpm --filter @research-platform/system-3 dev --port 5174
exit $LASTEXITCODE
