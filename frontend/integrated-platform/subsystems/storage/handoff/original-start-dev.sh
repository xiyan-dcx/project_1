#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export SYSTEM3_API_TARGET="${SYSTEM3_API_TARGET:-http://10.166.33.158:30082}"
exec pnpm --dir apps/system-3 dev --host 127.0.0.1 "$@"
