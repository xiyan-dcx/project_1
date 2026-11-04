#!/usr/bin/env python3
"""Web benchmark bridge for isolated FEMU and virtual-disk benchmark paths."""
import asyncio
import os
import re
import subprocess
import time
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


RESULTS = Path("/data/xhf/scalaafa-platform/results")
ALLOWED_RW = {"write", "randwrite", "read", "randread"}
ALLOWED_BS = {"4k", "16k", "32k", "64k", "128k", "256k"}
_RUN_GATE = os.environ.get("BENCH_ENABLE_RUN", "0").strip().lower() in {"1", "true", "yes"}
_RUN_ALLOWLIST = {
    key.strip().lower()
    for key in os.environ.get("BENCH_ENABLED_ENGINES", "").split(",")
    if key.strip()
} & {"scalaafa", "raid5f", "dpp", "mdraid"}
ENABLED_RUN_ENGINES = _RUN_ALLOWLIST if _RUN_GATE else set()

app = FastAPI(title="Safe isolated engine benchmark runner")
jobs = {}
active_job = None
submit_lock = asyncio.Lock()


class RunReq(BaseModel):
    engine: str
    rw: str = "write"
    bs: str = "64k"
    qd: int = Field(default=8, ge=1, le=64)
    rt: int = Field(default=5, ge=1, le=60)


def guest_ready(port, command):
    try:
        result = subprocess.run(
            ["ssh", "-p", str(port), "-o", "BatchMode=yes", "-o", "ConnectTimeout=3",
             "-o", "StrictHostKeyChecking=no", "femu@127.0.0.1", command],
            text=True, capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


async def engine_readiness():
    afa_command = (
        "test -x /home/femu/bench_afa_isolated.sh && "
        "test -x /home/femu/bench_raid5f_isolated.sh && "
        "test -f /home/femu/ScalaAFA/spdk/test/config_afa.json && "
        "test -f /home/femu/ScalaAFA/spdk/test/config_raid5f.json && "
        "test \"$(lspci -Dn | grep -Fc '0108: 1d1d:1f1f')\" = 5 && "
        "! ls /dev/nvme*n1 >/dev/null 2>&1"
    )
    mdraid_command = (
        "test -x /home/femu/bench_mdraid_isolated.sh && "
        "command -v mdadm >/dev/null && command -v fio >/dev/null && "
        "test -b /dev/disk/by-id/scsi-MDISO0 && "
        "test -b /dev/disk/by-id/scsi-MDISO1 && "
        "test -b /dev/disk/by-id/scsi-MDISO2 && "
        "test -b /dev/disk/by-id/scsi-MDISO3"
    )
    afa, mdraid = await asyncio.gather(
        asyncio.to_thread(guest_ready, 8091, afa_command),
        asyncio.to_thread(guest_ready, 8093, mdraid_command),
    )
    return {"scalaafa": afa, "dpp": afa, "raid5f": afa, "mdraid": mdraid}


async def run_job(job_id, req):
    global active_job
    job = jobs[job_id]
    try:
        job["state"] = "preparing"
        job["state"] = "running"
        if req.engine == "scalaafa":
            job["message"] = "ScalaAFA 隔离 FEMU 虚拟 NVMe 测试中"
            cmd = ["ssh", "-p", "8091", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
                   "-o", "StrictHostKeyChecking=no", "femu@127.0.0.1",
                   "/home/femu/bench_afa_isolated.sh", "scalaafa", req.rw, req.bs,
                   str(req.qd), str(req.rt)]
        elif req.engine == "raid5f":
            job["message"] = "RAID5F 隔离 FEMU 虚拟机测试中（不同介质模型，仅功能对照）"
            cmd = [
                "ssh", "-p", "8091", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
                "-o", "StrictHostKeyChecking=no", "femu@127.0.0.1",
                "/home/femu/bench_raid5f_isolated.sh", req.rw, req.bs,
                str(req.qd), str(req.rt),
            ]
        elif req.engine == "dpp":
            job["message"] = "ScalaAFA-dPP 隔离 FEMU 虚拟 NVMe 测试中"
            cmd = [
                "ssh", "-p", "8091", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
                "-o", "StrictHostKeyChecking=no", "femu@127.0.0.1",
                "/home/femu/bench_afa_isolated.sh", "dpp", req.rw, req.bs,
                str(req.qd), str(req.rt),
            ]
        else:
            job["message"] = "kernel mdraid 独立虚拟盘 guest 测试中"
            cmd = [
                "ssh", "-p", "8093", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
                "-o", "StrictHostKeyChecking=no", "femu@127.0.0.1",
                "/home/femu/bench_mdraid_isolated.sh", req.rw, req.bs,
                str(req.qd), str(req.rt),
            ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            timeout_s = req.rt + (600 if req.engine == "mdraid" else 40)
            raw, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError("fio 运行超时")
        log = raw.decode("utf-8", "replace")
        teardown_only = (req.engine == "raid5f" and proc.returncode != 0
                         and "spdk_io_device_unregister" in log
                         and "Run status group" in log
                         and "err= 0" in log)
        if proc.returncode != 0 and not teardown_only:
            raise RuntimeError("fio 失败: " + log[-300:].replace("\n", " "))
        if not re.search(r"^\s*(?:read|write):\s*IOPS=", log, re.M):
            raise RuntimeError("fio 完成但无有效 IOPS 数据")
        job["log"] = log
        job["parity_verified"] = None
        for line in log.splitlines():
            m = re.search(r"(?:read|write):\s*IOPS=([0-9.]+)([kKmM]?)", line)
            if not m:
                continue
            multiplier = {"": 1, "k": 1000, "K": 1000, "m": 1000000, "M": 1000000}[m.group(2)]
            iops = round(float(m.group(1)) * multiplier)
            job["points"].append({"type": "stream_point", "engine": req.engine,
                                  "t": len(job["points"]) + 1, "iops": iops,
                                  "bw_mib": round(iops * int(req.bs[:-1]) / 1024, 1)})
        RESULTS.mkdir(parents=True, exist_ok=True)
        (RESULTS / f"{req.engine}_{req.rw}_bs{req.bs}_qd{req.qd}_{job_id}.log").write_text(log)
        job["state"] = "done"
        job["message"] = ("隔离 RAID5F 基准完成；fio teardown 异常已记录" if teardown_only
                          else "基准完成")
    except Exception as exc:
        job["state"] = "failed"
        job["message"] = str(exc)[:300]
    finally:
        active_job = None


@app.get("/health")
async def health():
    readiness = await engine_readiness()
    ready_engines = ENABLED_RUN_ENGINES & {key for key, ready in readiness.items() if ready}
    return {"ok": True, "mode": "isolated-femu-and-virtual-disk-safe",
            "run_enabled": bool(ready_engines),
            "run_enabled_engines": sorted(ready_engines),
            "engine_readiness": readiness, "active_job": active_job,
            "runner_state": jobs.get(active_job, {}).get("state", "idle")}


@app.post("/run")
async def submit(req: RunReq):
    global active_job
    if req.engine not in {"scalaafa", "raid5f", "dpp", "mdraid"}:
        raise HTTPException(400, "不支持此 benchmark 引擎")
    if req.engine not in ENABLED_RUN_ENGINES:
        raise HTTPException(403, "该引擎未通过 runner 全局开关和 BENCH_ENABLED_ENGINES 白名单门禁")
    readiness = await engine_readiness()
    if not readiness.get(req.engine):
        raise HTTPException(503, "该引擎隔离 guest 当前不可用，已阻止启动")
    if req.rw not in ALLOWED_RW or req.bs not in ALLOWED_BS:
        raise HTTPException(400, "unsupported workload")
    if req.engine == "raid5f" and req.bs != "256k":
        raise HTTPException(400, "隔离 RAID5F 当前只验证 256k 块大小")
    if req.engine == "raid5f" and req.rt not in {2, 5, 10, 30}:
        raise HTTPException(400, "隔离 RAID5F 当前只验证 2/5/10/30 秒")
    if req.engine == "dpp" and req.bs not in {"4k", "16k", "64k", "256k"}:
        raise HTTPException(400, "dPP 当前只开放 4k/16k/64k/256k")
    if req.engine == "mdraid" and req.bs not in {"4k", "16k", "64k", "256k"}:
        raise HTTPException(400, "mdraid 当前只开放 4k/16k/64k/256k")
    async with submit_lock:
        if active_job:
            raise HTTPException(409, "another experiment is running")
        job_id = uuid.uuid4().hex
        jobs[job_id] = {"job_id": job_id, "state": "queued", "message": "排队中",
                        "points": [], "log": "", "created_at": time.time()}
        active_job = job_id
        asyncio.create_task(run_job(job_id, req))
        return {"ok": True, "job_id": job_id}


@app.get("/run/{job_id}")
async def get_run(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "job not found")
    return jobs[job_id]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, uds=os.environ.get("RUNNER_SOCKET", "/data/xhf/scalaafa-platform/runner/runner-v2.sock"))
