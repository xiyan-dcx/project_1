#!/usr/bin/env bash
set -euo pipefail

BASE=/data/xhf/scalaafa-persist
QEMU="$BASE/femu/build-persist/qemu-system-x86_64"
OS_IMAGE=/data/sdb1/xhf/scalaafa/scalaafa-ae.qcow2
DISK_DIR="$BASE/devices-mdraid-isolated-20260925"
RUN_DIR="$BASE/logs/mdraid-isolated-20260925"
GUEST_RUNNER=/data/xhf/scalaafa-platform/runner/bench_mdraid_isolated.sh
VM_NAME=FEMU-mdraid-Isolated

test -x "$QEMU"
test -f "$OS_IMAGE"
test -x "$GUEST_RUNNER"
test -e /dev/kvm
production_femu=0
isolated_femu=0
mdraid_femu=0
for qpid in $(pgrep -x qemu-system-x86 || true); do
  qcmd=$(tr '\0' ' ' < "/proc/$qpid/cmdline")
  [[ "$qcmd" == *"FEMU-ScalaAFA-Persistent-Dev"* ]] && production_femu=1
  [[ "$qcmd" == *"FEMU-ScalaAFA-RAID5F-Isolated"* ]] && isolated_femu=1
  [[ "$qcmd" == *"$VM_NAME"* ]] && mdraid_femu=1
done
[[ "$production_femu" == 1 && "$isolated_femu" == 1 ]] || {
  echo "Production and RAID5F isolated guests must both be running" >&2
  exit 1
}
[[ "$mdraid_femu" == 0 ]] || { echo "mdraid isolated guest already running" >&2; exit 1; }
if ss -H -lnt 'sport = :8093' | grep -q .; then
  echo "Host port 8093 is already in use" >&2
  exit 1
fi

PROD_SOURCE=$(findmnt -n -o SOURCE --target /data/xhf/caas-lsm/scalaafa-pv)
BASE_SOURCE=$(findmnt -n -o SOURCE --target "$BASE")
if [[ -z "$PROD_SOURCE" || -z "$BASE_SOURCE" || "$PROD_SOURCE" == "$BASE_SOURCE" ]]; then
  echo "Backing-file filesystem is not separate from the production PV" >&2
  exit 1
fi
AVAILABLE_KIB=$(df -Pk "$BASE" | awk 'NR==2 {print $4}')
if (( AVAILABLE_KIB < 38 * 1024 * 1024 )); then
  echo "Less than 38 GiB is free on the backing-file filesystem" >&2
  exit 1
fi

if [[ -e "$DISK_DIR" && ! -d "$DISK_DIR" ]]; then
  echo "mdraid backing path is not a directory" >&2
  exit 1
fi
mkdir -p "$DISK_DIR" "$RUN_DIR"
for i in 0 1 2 3; do
  disk="$DISK_DIR/md${i}.img"
  if [[ -e "$disk" ]]; then
    [[ -f "$disk" && ! -L "$disk" && $(stat -c %s "$disk") == 8589934592 ]] || {
      echo "Unexpected isolated backing file: $disk" >&2
      exit 1
    }
  else
    truncate -s 8G "$disk"
  fi
done

args=(
  -L "$BASE/femu/pc-bios"
  -name "$VM_NAME"
  -enable-kvm -cpu host -smp 4 -m 8G
  -device virtio-scsi-pci,id=scsi0
  -device scsi-hd,drive=os0
  -drive "file=$OS_IMAGE,if=none,aio=native,cache=none,format=qcow2,snapshot=on,id=os0"
)
for i in 0 1 2 3; do
  args+=(-device "scsi-hd,drive=md${i},serial=MDISO${i}")
  args+=(-drive "file=$DISK_DIR/md${i}.img,if=none,aio=native,cache=none,format=raw,id=md${i}")
done
args+=(
  -net user,hostfwd=tcp:127.0.0.1:8093-:22
  -net nic,model=virtio
  -nographic
  -qmp "unix:$RUN_DIR/qmp.sock,server,nowait"
)

nohup "$QEMU" "${args[@]}" >>"$RUN_DIR/qemu.log" 2>&1 </dev/null &
pid=$!
printf '%s\n' "$pid" > "$RUN_DIR/qemu.pid"
sleep 3
if ! kill -0 "$pid" 2>/dev/null; then
  echo "Isolated QEMU exited; inspect $RUN_DIR/qemu.log" >&2
  exit 1
fi
ready=0
for _ in $(seq 1 30); do
  if ssh -p 8093 -o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null femu@127.0.0.1 true 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  echo "Isolated mdraid guest SSH did not become ready; inspect $RUN_DIR/qemu.log" >&2
  exit 1
fi
scp -P 8093 -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null "$GUEST_RUNNER" femu@127.0.0.1:/home/femu/bench_mdraid_isolated.sh
ssh -p 8093 -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null femu@127.0.0.1 \
  'chmod 755 /home/femu/bench_mdraid_isolated.sh && command -v mdadm && command -v fio && test -e /dev/disk/by-id/scsi-MDISO0 && test -e /dev/disk/by-id/scsi-MDISO1 && test -e /dev/disk/by-id/scsi-MDISO2 && test -e /dev/disk/by-id/scsi-MDISO3'
echo "Started $VM_NAME (PID $pid); SSH is forwarded to 127.0.0.1:8093"
echo "Disposable virtual disks: $DISK_DIR"
echo "Log: $RUN_DIR/qemu.log"
