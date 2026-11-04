$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
# Reuse the agreed shared address; module port is not a new shared variable.
$engineAddress = & node --input-type=module -e "import { ENGINE_TARGET } from './packages/config/system_config.ts'; process.stdout.write(ENGINE_TARGET)"
if ($LASTEXITCODE -ne 0 -or -not $engineAddress) { throw 'Cannot read ENGINE_TARGET' }
$env:SYSTEM3_REMOTE_URL = 'http://' + $engineAddress.Trim() + ':30082'
& "$projectRoot/.venv/Scripts/python.exe" -m uvicorn remote_readonly:app --app-dir apps/system-3/src/api/server --host 127.0.0.1 --port 8001
exit $LASTEXITCODE
