#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export PATH="$HOME/.local/bin:/usr/bin:/bin:$PATH"
export SYSTEM3_API_TARGET="${SYSTEM3_API_TARGET:-http://10.166.33.158:30082}"
exec "${PYTHON:-python3}" -m uvicorn handoff.serve_ui:app --host 127.0.0.1 --port "${UI_PORT:-5173}"
