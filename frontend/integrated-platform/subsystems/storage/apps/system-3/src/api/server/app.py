"""System 3 benchmark API.

The parser and bench command names are intentionally compatible with the
original single-file dashboard.  The Vue app consumes this service through
``/api`` and ``/ws``.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

ENGINES = {"scalaafa": "ScalaAFA", "mdraid": "mdraid", "raid5f": "RAID5F"}
ENGINE_MODE = {"scalaafa": "spdk", "raid5f": "spdk", "mdraid": "kernel"}
ALLOWED_RW = {"write", "randwrite", "read", "randread"}
ALLOWED_BS = {"4k", "16k", "32k", "64k", "128k", "256k"}


def _to_kib_s(value: float, unit: str) -> float:
    factors = {"b/s": 1 / 1024, "kib/s": 1, "kb/s": 1000 / 1024,
               "mib/s": 1024, "mb/s": 1000 * 1000 / 1024,
               "gib/s": 1024 * 1024, "gb/s": 1000 * 1000 * 1000 / 1024}
    return value * factors.get(unit.lower(), 1)


def _to_usec(value: float, unit: str) -> float:
    return {"nsec": value / 1000, "usec": value, "msec": value * 1000}.get(unit, value)


def _si(value: str) -> float:
    value = value.strip()
    factor = 1
    if value and value[-1] in "kK": factor, value = 1000, value[:-1]
    elif value and value[-1] in "mM": factor, value = 1000000, value[:-1]
    return float(value) * factor


def parse_text(text: str) -> dict[str, Any]:
    result: dict[str, Any] = {"directions": {}, "cpu": {}, "io_depths": {},
        "lat_dist": {}, "bw_stat": {}, "iops_stat": {}}
    for match in re.finditer(r"^\s*(read|write|trim)\s*:\s*IOPS=([0-9.kKmM]+),\s*BW=([0-9.]+)([KMGT]i?B/s)", text, re.M):
        direction = match.group(1)
        result["directions"].setdefault(direction, {})
        result["directions"][direction]["iops"] = _si(match.group(2))
        result["directions"][direction]["bw_kib_s"] = _to_kib_s(float(match.group(3)), match.group(4))
    if not result["directions"]:
        raise RuntimeError("no IOPS line")
    primary = "write" if "write" in result["directions"] else next(iter(result["directions"]))
    for match in re.finditer(r"^\s*(slat|clat|lat)\s*\((nsec|usec|msec)\):\s*min=([0-9.]+),\s*max=([0-9.]+),\s*avg=([0-9.]+),\s*stdev=([0-9.]+)", text, re.M):
        name, unit = match.group(1), match.group(2)
        result["directions"][primary].setdefault("lat", {})[name] = {
            "min": _to_usec(float(match.group(3)), unit), "max": _to_usec(float(match.group(4)), unit),
            "avg": _to_usec(float(match.group(5)), unit), "stdev": _to_usec(float(match.group(6)), unit)}
    percentile = re.search(r"clat percentiles \((nsec|usec|msec)\):\s*\n((?:\s*\|.*\n?)+)", text)
    if percentile:
        unit = percentile.group(1)
        result["directions"][primary]["pct"] = {float(p): _to_usec(float(v), unit)
            for p, v in re.findall(r"([0-9.]+)th=\[\s*([0-9.]+)\s*\]", percentile.group(2))}
    for match in re.finditer(r"lat \((usec|msec)\)\s*:\s*([^\n]+)", text):
        for bucket, pct in re.findall(r"([0-9]+)=([0-9.]+)%", match.group(2)):
            result["lat_dist"][f"{bucket}{match.group(1)}"] = float(pct)
    cpu = re.search(r"cpu\s*:\s*usr=([0-9.]+)%,\s*sys=([0-9.]+)%(?:,\s*ctx=([0-9]+))?", text)
    if cpu:
        usr, sys = float(cpu.group(1)), float(cpu.group(2))
        result["cpu"] = {"usr": usr, "sys": sys, "ctx": int(cpu.group(3) or 0), "idle": max(0, 100 - usr - sys)}
    depths = re.search(r"IO depths\s*:\s*(.+)", text)
    if depths:
        result["io_depths"] = {k: float(v) for k, v in re.findall(r"([0-9>=]+)=([0-9.]+)%", depths.group(1))}
    bw = re.search(r"bw \(\s*MiB/s\s*\):\s*min=\s*([0-9.]+),\s*max=\s*([0-9.]+).*?avg=([0-9.]+),\s*stdev=([0-9.]+)", text)
    if bw:
        result["bw_stat"] = {"min": float(bw.group(1)), "max": float(bw.group(2)), "avg": float(bw.group(3)), "stdev": float(bw.group(4))}
    iops = re.search(r"iops\s*:\s*min=\s*([0-9]+),\s*max=\s*([0-9]+).*?avg=([0-9.]+),\s*stdev=([0-9.]+)", text)
    if iops:
        result["iops_stat"] = {"min": int(iops.group(1)), "max": int(iops.group(2)), "avg": float(iops.group(3)), "stdev": float(iops.group(4))}
    return result


def build_sample(engine: str, rw: str, bs: str, qd: int, rt: int, parsed: dict[str, Any]) -> dict[str, Any]:
    direction = parsed["directions"].get("write") or parsed["directions"].get("read") or next(iter(parsed["directions"].values()))
    lat = direction.get("lat", {})
    clat = lat.get("clat") or lat.get("lat") or {}
    return {"engine": engine, "engine_name": ENGINES[engine], "rw": rw, "bs": bs, "qd": int(qd), "rt": int(rt),
            "iops": round(direction.get("iops", 0)), "bw_mib": round(direction.get("bw_kib_s", 0) / 1024, 1),
            "lat_us": round(clat.get("avg", 0), 1) if clat else None, "lat_min": round(clat.get("min", 0), 1) if clat else None,
            "lat_max": round(clat.get("max", 0), 1) if clat else None, "lat_stdev": round(clat.get("stdev", 0), 1) if clat else None,
            "slat": lat.get("slat", {}), "clat": lat.get("clat", {}), "pct": {str(k): round(v, 1) for k, v in (direction.get("pct") or {}).items()},
            "lat_dist": parsed.get("lat_dist", {}), "cpu": parsed.get("cpu", {}), "io_depths": parsed.get("io_depths", {}),
            "bw_stat": parsed.get("bw_stat", {}), "iops_stat": parsed.get("iops_stat", {}), "ts": time.time()}


class RunRequest(BaseModel):
    engine: str
    rw: str = "write"
    bs: str = "64k"
    qd: int = Field(default=32, ge=1, le=1024)
    rt: int = Field(default=5, ge=1, le=3600)


class BenchDriver:
    name = "base"
    async def prepare(self, target: str) -> None: raise NotImplementedError
    async def run(self, engine: str, rw: str, bs: str, qd: int, rt: int) -> tuple[int, str, str]: raise NotImplementedError
    async def stream(self, engine: str, rw: str, bs: str, qd: int, rt: int) -> AsyncIterator[str]: raise NotImplementedError


class SSHDriver(BenchDriver):
    name = "ssh"
    def __init__(self) -> None:
        user = os.getenv("VM_USER", "femu")
        host = os.getenv("VM_HOST", os.getenv("ENGINE_TARGET", "localhost"))
        port = os.getenv("VM_PORT", "8090")
        self.ssh = ["ssh", "-p", port, f"{user}@{host}", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no"]
        self.mode = "unknown"
    async def exec(self, command: str, timeout: int = 120) -> tuple[int, str, str]:
        process = await asyncio.create_subprocess_exec(*self.ssh, command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try: out, err = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill(); await process.wait(); return 124, "", "timeout"
        return process.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
    async def prepare(self, target: str) -> None:
        if self.mode == target: return
        if target == "spdk":
            await self.exec("/home/femu/bench.sh kernel-teardown", 60)
            rc, out, err = await self.exec("/home/femu/bench.sh to-spdk", 120)
        else:
            rc, out, err = await self.exec("/home/femu/bench.sh to-kernel", 120)
        if rc != 0 or "ERROR" in out: raise RuntimeError(out[:160] or err[:160] or "engine prepare failed")
        self.mode = target
    async def run(self, engine: str, rw: str, bs: str, qd: int, rt: int) -> tuple[int, str, str]:
        return await self.exec(f"RUNTIME={rt} QD={qd} /home/femu/bench.sh run {engine} {rw} {bs}", rt + 220)
    async def stream(self, engine: str, rw: str, bs: str, qd: int, rt: int) -> AsyncIterator[str]:
        process = await asyncio.create_subprocess_exec(*self.ssh, f"RUNTIME={rt} QD={qd} /home/femu/bench.sh stream {engine} {rw} {bs}", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        assert process.stdout
        try:
            while True:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=rt + 60)
                if not line: break
                yield line.decode("utf-8", "replace").strip()
        finally:
            if process.returncode is None: process.kill()
            await process.wait()


class K8sDriver(BenchDriver):
    name = "k8s"
    async def prepare(self, target: str) -> None: raise RuntimeError("K8S driver is reserved for cluster deployment; set BENCH_DRIVER=ssh for current host")
    async def run(self, *args: Any) -> tuple[int, str, str]: raise RuntimeError("K8S driver not configured")
    async def stream(self, *args: Any) -> AsyncIterator[str]: raise RuntimeError("K8S driver not configured")


app = FastAPI(title="System 3 Benchmark API", version="0.1.0")
# Browser traffic uses the same-origin Vite/nginx proxy; no wildcard CORS.
run_enabled = os.getenv("BENCH_ENABLE_RUN", "0") == "1"
driver: BenchDriver = K8sDriver() if os.getenv("BENCH_DRIVER", "ssh").lower() == "k8s" else SSHDriver()
results_dir = Path(os.getenv("RESULTS_DIR", str(Path.home() / "fio_results"))); results_dir.mkdir(parents=True, exist_ok=True)
samples: dict[str, dict[str, Any]] = {}
status: dict[str, str] = {"state": "idle", "msg": ""}
clients: set[WebSocket] = set()
run_lock = asyncio.Lock()
run_task: asyncio.Task | None = None

def sample_key(sample: dict[str, Any]) -> str: return "|".join(str(sample[k]) for k in ("engine", "rw", "bs", "qd", "rt"))
def state_payload() -> dict[str, Any]: return {"type": "state", "status": status, "samples": list(samples.values())}
async def broadcast(message: dict[str, Any]) -> None:
    dead = []
    for client in list(clients):
        try: await client.send_text(json.dumps(message))
        except Exception: dead.append(client)
    for client in dead: clients.discard(client)
async def set_status(value: str, message: str = "") -> None:
    status.update(state=value, msg=message); await broadcast({"type": "status", "status": status})

async def execute(request: RunRequest) -> None:
    async with run_lock:
        try:
            await set_status("preparing", f"{ENGINES[request.engine]} 准备...")
            await driver.prepare(ENGINE_MODE[request.engine])
            await set_status("running", f"{ENGINES[request.engine]} {request.rw} {request.bs} 运行中...")
            await broadcast({"type": "stream_start", "engine": request.engine, "rw": request.rw, "bs": request.bs, "qd": request.qd, "rt": request.rt})
            name = f"{request.engine}_{request.rw}_bs{request.bs}_qd{request.qd}.log"
            points: list[dict[str, Any]] = []
            elapsed = 0
            async for line in driver.stream(request.engine, request.rw, request.bs, request.qd, request.rt):
                if not line.startswith("STREAM|"): continue
                body = line[7:]
                iops_match = re.search(r"IOPS=([0-9.kKmM]+)", body)
                bw_match = re.search(r"BW=([0-9.]+)([KMGT]i?B/s)", body)
                if not iops_match: continue
                elapsed += 1
                iops = round(_si(iops_match.group(1)))
                bw_mib = round(_to_kib_s(float(bw_match.group(1)), bw_match.group(2)) / 1024, 1) if bw_match else 0
                point = {"type": "stream_point", "t": elapsed, "iops": iops, "bw_mib": bw_mib, "engine": request.engine}
                points.append({"t": elapsed, "iops": iops, "bw_mib": bw_mib}); await broadcast(point)
            output = ""
            if isinstance(driver, SSHDriver): _, output, error = await driver.exec(f"cat /home/femu/bench_out/{name}", 30)
            else: error = ""
            if not output and points:
                output = "write: IOPS=%s, BW=%sMiB/s\n" % (points[-1]["iops"], points[-1]["bw_mib"])
            if not output: raise RuntimeError(error[:160] or "bench command produced no output")
            sample = build_sample(request.engine, request.rw, request.bs, request.qd, request.rt, parse_text(output))
            sample["series"] = points
            samples[sample_key(sample)] = sample
            results_dir.joinpath(name).write_text(output, encoding="utf-8")
            await broadcast({"type": "sample", "sample": sample}); await broadcast(state_payload())
            await set_status("idle", f"OK  {sample['iops']} IOPS  {sample['bw_mib']} MiB/s")
            await broadcast({"type": "stream_end"})
        except Exception as exc:
            await set_status("failed", str(exc)[:160])
            await broadcast({"type": "stream_end"})

@app.get("/api/health")
async def health() -> dict[str, Any]:
    # API liveness only: this does not prove SSH/SPDK/engine readiness.
    return {"ok": True, "driver": driver.name, "state": status["state"], "run_enabled": run_enabled}
@app.get("/api/engines")
async def engines() -> dict[str, Any]: return {"engines": [{"key": k, "name": v, "mode": ENGINE_MODE[k]} for k, v in ENGINES.items()]}
@app.get("/api/state")
async def state() -> dict[str, Any]: return state_payload()
@app.post("/api/run")
async def run(request: RunRequest) -> dict[str, Any]:
    global run_task
    if request.engine not in ENGINES: return {"ok": False, "err": "unknown engine"}
    if request.rw not in ALLOWED_RW or request.bs not in ALLOWED_BS: return {"ok": False, "err": "invalid parameter"}
    if request.engine == "raid5f" and request.bs != "256k": return {"ok": False, "err": "RAID5F 256k only"}
    if not run_enabled: return {"ok": False, "err": "Local preview: real benchmarks are disabled (BENCH_ENABLE_RUN=0)"}
    if run_lock.locked() or (run_task is not None and not run_task.done()):
        return {"ok": False, "err": "another benchmark is running"}
    # Reserve synchronously before yielding so simultaneous requests cannot queue runs.
    run_task = asyncio.create_task(execute(request)); return {"ok": True}
@app.websocket("/ws")
async def websocket(socket: WebSocket) -> None:
    await socket.accept(); clients.add(socket)
    try:
        await socket.send_text(json.dumps(state_payload()))
        while True: await socket.receive_text()
    except WebSocketDisconnect: pass
    finally: clients.discard(socket)
