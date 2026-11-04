#!/usr/bin/env bash
# ScalaAFA and dPP performance runs on the dedicated 8091 FEMU guest only.
# Its five FEMU namespaces are backed by disposable files on the host's /dev/sda2.
set -euo pipefail

engine=${1:?engine required}
rw=${2:?rw required}
bs=${3:?block size required}
qd=${4:?iodepth required}
runtime=${5:?runtime required}

case "$engine" in scalaafa|dpp) ;; *) echo "unsupported engine" >&2; exit 2 ;; esac
case "$rw" in write|randwrite|read|randread) ;; *) echo "unsupported rw" >&2; exit 2 ;; esac
case "$bs" in 4k|16k|32k|64k|128k|256k) ;; *) echo "unsupported bs" >&2; exit 2 ;; esac
case "$qd" in 1|8|32|64) ;; *) echo "unsupported qd" >&2; exit 2 ;; esac
case "$runtime" in 2|5|10|30) ;; *) echo "unsupported runtime" >&2; exit 2 ;; esac

spdk=/home/femu/ScalaAFA/spdk
fio=/home/femu/ScalaAFA/fio/fio
config="$spdk/test/config_afa.json"

# Fail closed unless this is the five-controller disposable FEMU topology.
for bdf in 00:05.0 00:06.0 00:07.0 00:08.0 00:09.0; do
    lspci -Dn | grep -Fq "$bdf 0108: 1d1d:1f1f" || {
        echo "missing expected FEMU controller $bdf" >&2
        exit 3
    }
done
count=$(lspci -Dn | grep -Fc '0108: 1d1d:1f1f' || true)
[[ "$count" == 5 ]] || { echo "unexpected NVMe controller count: $count" >&2; exit 3; }
if compgen -G '/dev/nvme*n1' >/dev/null; then
    echo "kernel-visible NVMe namespaces detected; refusing SPDK benchmark" >&2
    exit 3
fi
if pgrep -f '/build/bin/(nvmf_tgt|spdk_tgt)' >/dev/null; then
    echo "an SPDK target is running in the isolated guest" >&2
    exit 3
fi
if mount | grep -Eq '/dev/nvme[0-9]+n1 on '; then
    echo "a guest NVMe namespace is mounted" >&2
    exit 3
fi

test -f "$config"
test -x "$fio"
test -f "$spdk/build/fio/spdk_bdev"
exec 9>/tmp/scalaafa-isolated-bench.lock
flock -n 9 || { echo "isolated SPDK benchmark is busy" >&2; exit 75; }

sudo -n env HUGEMEM=2048 "$spdk/scripts/setup.sh" >/dev/null
cd "$spdk"

# Initialize only for read workloads. Write workloads measure their own bounded
# range directly, so a stalled initialization cannot hold the web-runner lock.
if [[ "$rw" == read || "$rw" == randread ]]; then
    sudo -n timeout --foreground -k 3 30s "$fio" \
        --name=afa-isolated-init --ioengine="$spdk/build/fio/spdk_bdev" --spdk_json_conf="$config" \
        --filename=afa0 --rw=write --bs=256k --iodepth=1 --size=64M \
        --direct=1 --thread=1 --numjobs=1 --group_reporting=1 --eta=never \
        >/tmp/afa-isolated-init.log 2>&1
fi

log="/tmp/afa-isolated-$$.log"
set +e
sudo -n timeout --foreground -k 3 "$((runtime + 20))" "$fio" \
    --name="$engine-isolated" --ioengine="$spdk/build/fio/spdk_bdev" \
    --spdk_json_conf="$config" --filename=afa0 \
    --rw="$rw" --bs="$bs" --iodepth="$qd" --runtime="$runtime" \
    --time_based=1 --size=64M --direct=1 --thread=1 --numjobs=1 \
    --group_reporting=1 --eta=never --status-interval=1 --output-format=normal >"$log" 2>&1
rc=$?
cat "$log"
if [[ "$rc" != 0 ]] && grep -q 'Run status group' "$log" && grep -q 'err= 0' "$log"; then
    rm -f "$log"
    exit 0
fi
rm -f "$log"
exit "$rc"
