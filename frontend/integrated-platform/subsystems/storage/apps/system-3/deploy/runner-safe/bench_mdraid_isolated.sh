#!/usr/bin/env bash
# Kernel mdraid benchmark using only four named disposable QEMU SCSI disks.
set -euo pipefail

rw=${1:?rw required}
bs=${2:?block size required}
qd=${3:?iodepth required}
runtime=${4:?runtime required}
case "$rw" in write|randwrite|read|randread) ;; *) exit 2 ;; esac
case "$bs" in 4k|16k|32k|64k|128k|256k) ;; *) exit 2 ;; esac
case "$qd" in 1|8|32|64) ;; *) exit 2 ;; esac
case "$runtime" in 2|5|10|30) ;; *) exit 2 ;; esac

serials=(MDISO0 MDISO1 MDISO2 MDISO3)
disks=()
for serial in "${serials[@]}"; do
    matches=()
    while IFS= read -r path; do
        [[ -n "$path" ]] && matches+=("$path")
    done < <(lsblk -dnpo PATH,SERIAL | awk -v s="$serial" '$2 == s {print $1}')
    [[ "${#matches[@]}" == 1 && -b "${matches[0]}" ]] || {
        echo "expected exactly one block device with serial $serial" >&2
        exit 3
    }
    [[ "$(sudo -n blockdev --getsize64 "${matches[0]}")" == 8589934592 ]] || {
        echo "unexpected size for $serial" >&2
        exit 3
    }
    if findmnt -rn -S "${matches[0]}" >/dev/null; then
        echo "refusing mounted benchmark disk $serial" >&2
        exit 3
    fi
    disks+=("${matches[0]}")
done
if lsblk -nr -o TYPE | grep -Eq '^raid[0-9]+$'; then
    echo "an mdraid device already exists; refusing to touch it" >&2
    exit 3
fi
if [[ -e /dev/md/scalaafa_webbench ]]; then
    echo "the isolated mdraid array path already exists" >&2
    exit 3
fi

exec 9>/tmp/mdraid-isolated-bench.lock
flock -n 9 || { echo "isolated mdraid benchmark is busy" >&2; exit 75; }
array=/dev/md/mdraid_webbench
sudo -n mkdir -p /dev/md
created=0
cleanup() {
    if [[ "$created" == 1 ]]; then
        sudo -n mdadm --stop "$array" >/dev/null 2>&1 || true
        sudo -n mdadm --zero-superblock --force "${disks[@]}" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

created=1
sudo -n mdadm --create "$array" --metadata=1.2 --level=5 --raid-devices=4 \
    --chunk=256 --run --force "${disks[@]}" >/tmp/mdraid-create.log
sudo -n mdadm --wait "$array" >/dev/null
test -b "$array"

fio=$(command -v fio)
# Populate only a bounded section of the newly created isolated array.
sudo -n "$fio" --name=mdraid-init --filename="$array" --rw=write --bs=256k \
    --iodepth=1 --size=1G --ioengine=libaio --direct=1 --group_reporting=1 \
    --eta=never >/tmp/mdraid-init.log 2>&1
sudo -n "$fio" --name=mdraid-isolated --filename="$array" --rw="$rw" \
    --bs="$bs" --iodepth="$qd" --runtime="$runtime" --time_based=1 \
    --size=1G --ioengine=libaio --direct=1 --group_reporting=1 \
    --eta=never --status-interval=1 --output-format=normal
