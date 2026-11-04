#!/usr/bin/env bash
set -euo pipefail

RUN_DIR=/data/xhf/scalaafa-persist/logs/mdraid-isolated-20260925
VM_NAME=FEMU-mdraid-Isolated
PID_FILE="$RUN_DIR/qemu.pid"

test -f "$PID_FILE" || { echo "No isolated mdraid FEMU PID file" >&2; exit 1; }
pid=$(cat "$PID_FILE")
cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline")
if [[ "$cmdline" != *"$VM_NAME"* ]]; then
  echo "PID $pid is not the isolated mdraid FEMU; refusing to stop it" >&2
  exit 1
fi
kill -TERM "$pid"
for _ in $(seq 1 30); do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Stopped $VM_NAME; disposable disk files were retained"
    exit 0
  fi
  sleep 1
done
echo "Isolated mdraid FEMU has not exited yet; inspect $RUN_DIR/qemu.log" >&2
exit 1
