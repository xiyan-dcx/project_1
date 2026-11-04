#!/usr/bin/env python3
"""三引擎基准测试看板 - 实时版"""
import asyncio, json, os, re, shlex, socket, time, urllib.error, urllib.request
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import uvicorn

VM_USER = os.environ.get("VM_USER", "femu")
VM_HOST = os.environ.get("VM_HOST", "localhost")
VM_PORT = os.environ.get("VM_PORT", "8090")
WEB_PORT = int(os.environ.get("WEB_PORT", "8000"))
PLATFORM_ROOT = Path(os.environ.get("PLATFORM_ROOT", "/data/xhf/scalaafa-platform"))
RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", str(PLATFORM_ROOT / "results")))
GUEST_BENCH_RAW = os.environ.get("GUEST_BENCH", "/home/femu/bench.sh")
GUEST_OUTDIR_RAW = os.environ.get("GUEST_OUTDIR", "/home/femu/bench_out")
GUEST_BENCH = shlex.quote(GUEST_BENCH_RAW)
GUEST_OUTDIR = shlex.quote(GUEST_OUTDIR_RAW)
GUEST_RUNNER_SOURCE = Path(os.environ.get(
    "GUEST_RUNNER_SOURCE", str(PLATFORM_ROOT / "runner" / "bench_platform.sh")))
RUNNER_SOCKET = os.environ.get("RUNNER_SOCKET", "")
CAAS_RUNNER_URL = os.environ.get("CAAS_RUNNER_URL", "").rstrip("/")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SSH = [
    "ssh", "-p", VM_PORT,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    f"{VM_USER}@{VM_HOST}",
]
SCP = ["scp", "-P", VM_PORT, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no"]
ENGINES = {
    "scalaafa": "ScalaAFA",
    "dpp": "ScalaAFA-dPP",
    "mdraid": "mdraid",
    "raid5f": "RAID5F（隔离 FEMU）",
}
ENGINE_MODE = {"scalaafa": "spdk", "dpp": "spdk", "raid5f": "spdk", "mdraid": "kernel"}
ENGINE_CATALOG_MODE = {"scalaafa": "SPDK / 隔离 FEMU", "dpp": "SPDK / 隔离 FEMU", "raid5f": "SPDK / 隔离 FEMU", "mdraid": "kernel / 隔离虚拟盘"}
BENCH_ENABLE_RUN = os.environ.get("BENCH_ENABLE_RUN", "0").strip().lower() in {"1", "true", "yes"}
_SUPPORTED_RUN_ENGINES = frozenset({"scalaafa", "raid5f", "dpp", "mdraid"})
_REQUESTED_RUN_ENGINES = frozenset(
    key.strip().lower()
    for key in os.environ.get("BENCH_ENABLED_ENGINES", "").split(",")
    if key.strip()
)
# Both gates must opt in. An empty per-engine allowlist keeps every engine closed.
ENABLED_RUN_ENGINES = (
    _REQUESTED_RUN_ENGINES & _SUPPORTED_RUN_ENGINES
    if BENCH_ENABLE_RUN else frozenset()
)
ENGINE_CATALOG = []
for _engine_key in ("scalaafa", "raid5f", "dpp", "mdraid"):
    if not BENCH_ENABLE_RUN:
        _runnable, _reason = False, "全局实测开关 BENCH_ENABLE_RUN 未开启"
    elif _engine_key not in _REQUESTED_RUN_ENGINES:
        _runnable, _reason = False, "该引擎未列入 BENCH_ENABLED_ENGINES 白名单"
    else:
        _runnable, _reason = True, ""
    ENGINE_CATALOG.append({
        "key": _engine_key,
        "name": ENGINES[_engine_key],
        "mode": ENGINE_CATALOG_MODE[_engine_key],
        "runnable": _runnable,
        "reason": _reason,
    })

def _to_kib_s(value, unit):
    unit = unit.lower()
    f = {"b/s":1/1024,"kib/s":1,"kb/s":1000/1024,"mib/s":1024,"mb/s":1000*1000/1024,
         "gib/s":1024*1024,"gb/s":1000*1000*1000/1024}.get(unit,1)
    return value * f

def _to_usec(v, u):
    return {"nsec": v/1000, "usec": v, "msec": v*1000}.get(u, v)

def _si(s):
    s = s.strip()
    m = 1
    if s and s[-1] in "kK": m, s = 1000, s[:-1]
    elif s and s[-1] in "mM": m, s = 1000000, s[:-1]
    return float(s) * m

def parse_text(text):
    """从 fio 输出中提取所有可用指标"""
    res = {"directions": {}, "cpu": {}, "io_depths": {}, "submit": {}, "complete": {},
           "lat_dist": {}, "bw_stat": {}, "iops_stat": {}}
    
    # 主行: IOPS + BW
    for m in re.finditer(r"^\s*(read|write|trim)\s*:\s*IOPS=([0-9.kKmM]+),\s*BW=([0-9.]+)([KMGT]i?B/s)", text, re.M):
        d = m.group(1)
        res["directions"].setdefault(d, {})
        res["directions"][d]["iops"] = _si(m.group(2))
        res["directions"][d]["bw_kib_s"] = _to_kib_s(float(m.group(3)), m.group(4))
    if not res["directions"]:
        raise RuntimeError("no IOPS line")
    
    def primary():
        return "write" if "write" in res["directions"] else next(iter(res["directions"]))
    
    # slat / clat / lat (min/max/avg/stdev)
    for m in re.finditer(r"^\s*(slat|clat|lat)\s*\((nsec|usec|msec)\):\s*min=\s*([0-9.]+),\s*max=\s*([0-9.]+),\s*avg=\s*([0-9.]+),\s*stdev=\s*([0-9.]+)", text, re.M):
        nm, u = m.group(1), m.group(2)
        res["directions"][primary()].setdefault("lat", {})[nm] = {
            "min": _to_usec(float(m.group(3)), u),
            "max": _to_usec(float(m.group(4)), u),
            "avg": _to_usec(float(m.group(5)), u),
            "stdev": _to_usec(float(m.group(6)), u),
        }
    
    # clat 百分位
    bm = re.search(r"clat percentiles \((nsec|usec|msec)\):\s*\n((?:\s*\|.*\n?)+)", text)
    if bm:
        u = bm.group(1)
        pct = {}
        for p, v in re.findall(r"([0-9.]+)th=\[\s*([0-9.]+)\s*\]", bm.group(2)):
            pct[float(p)] = _to_usec(float(v), u)
        res["directions"][primary()]["pct"] = pct
    
    # 延迟分布桶 lat (usec): ..., lat (msec): ...
    for unit_match in re.finditer(r"lat \((usec|msec)\)\s*:\s*([^\n]+)", text):
        u = unit_match.group(1)
        line = unit_match.group(2)
        for bucket, pct in re.findall(r"([0-9]+)=([0-9.]+)%", line):
            key = f"{bucket}{u}"
            res["lat_dist"][key] = float(pct)
    
    # CPU
    cpu_m = re.search(r"cpu\s*:\s*usr=([0-9.]+)%,\s*sys=([0-9.]+)%(?:,\s*ctx=([0-9]+))?", text)
    if cpu_m:
        res["cpu"] = {
            "usr": float(cpu_m.group(1)),
            "sys": float(cpu_m.group(2)),
            "ctx": int(cpu_m.group(3)) if cpu_m.group(3) else 0,
            "idle": max(0, 100 - float(cpu_m.group(1)) - float(cpu_m.group(2)))
        }
    
    # IO depths
    iod_m = re.search(r"IO depths\s*:\s*(.+)", text)
    if iod_m:
        for k, v in re.findall(r"([0-9>=]+)=([0-9.]+)%", iod_m.group(1)):
            res["io_depths"][k] = float(v)
    
    # bw (MiB/s) stats
    bw_m = re.search(r"bw \(\s*MiB/s\s*\):\s*min=\s*([0-9.]+),\s*max=\s*([0-9.]+).*?avg=\s*([0-9.]+),\s*stdev=\s*([0-9.]+)", text)
    if bw_m:
        res["bw_stat"] = {
            "min": float(bw_m.group(1)),
            "max": float(bw_m.group(2)),
            "avg": float(bw_m.group(3)),
            "stdev": float(bw_m.group(4))
        }
    
    # iops stats
    iops_m = re.search(r"iops\s*:\s*min=\s*([0-9]+),\s*max=\s*([0-9]+).*?avg=\s*([0-9.]+),\s*stdev=\s*([0-9.]+)", text)
    if iops_m:
        res["iops_stat"] = {
            "min": int(iops_m.group(1)),
            "max": int(iops_m.group(2)),
            "avg": float(iops_m.group(3)),
            "stdev": float(iops_m.group(4))
        }
    
    return res

def build_sample(engine, rw, bs, qd, rt, parsed):
    dirs = parsed["directions"]
    d = dirs.get("write") or dirs.get("read") or next(iter(dirs.values()))
    lat = d.get("lat", {})
    clat = lat.get("clat") or lat.get("lat") or {}
    return {
        "engine": engine,
        "engine_name": ENGINES.get(engine, engine),
        "rw": rw, "bs": bs, "qd": int(qd), "rt": int(rt),
        "iops": round(d.get("iops", 0)),
        "bw_mib": round(d.get("bw_kib_s", 0) / 1024, 1),
        "lat_us": round(clat.get("avg", 0), 1) if clat else None,
        "lat_min": round(clat.get("min", 0), 1) if clat else None,
        "lat_max": round(clat.get("max", 0), 1) if clat else None,
        "lat_stdev": round(clat.get("stdev", 0), 1) if clat else None,
        "slat": lat.get("slat", {}),
        "clat": lat.get("clat", {}),
        "pct": {str(k): round(v, 1) for k, v in (d.get("pct") or {}).items()},
        "lat_dist": parsed.get("lat_dist", {}),
        "cpu": parsed.get("cpu", {}),
        "io_depths": parsed.get("io_depths", {}),
        "bw_stat": parsed.get("bw_stat", {}),
        "iops_stat": parsed.get("iops_stat", {}),
        "ts": time.time(),
    }

app = FastAPI()
app.mount("/static", StaticFiles(directory=PLATFORM_ROOT / "static"), name="static")
samples = {}
mode = {"cur": "unknown"}
run_lock = asyncio.Lock()
clients = set()
status = {"state": "idle", "msg": ""}

def skey(s):
    return f"{s['engine']}|{s['rw']}|{s['bs']}|{s['qd']}|{s['rt']}"


def restore_result_history():
    """Restore canonical fio summaries without contacting the remote runner."""
    pattern = re.compile(
        r"^(scalaafa|dpp|mdraid|raid5f)_(write|randwrite|read|randread)_bs([0-9]+[kKmM]?)_qd([0-9]+)(?:_[0-9a-f]{32})?\.log$"
    )
    restored_keys = set()
    paths = sorted(RESULTS_DIR.glob("*.log"), key=lambda item: (item.stat().st_mtime, item.name))
    for path in paths:
        match = pattern.fullmatch(path.name)
        if not match:
            continue
        engine, rw, bs, qd = match.groups()
        try:
            parsed = parse_text(path.read_text(encoding="utf-8", errors="replace"))
            sample = build_sample(engine, rw, bs, int(qd), 0, parsed)
            sample["historical"] = True
            sample["ts"] = path.stat().st_mtime
            key = skey(sample)
            samples[key] = sample
            restored_keys.add(key)
        except Exception as ex:
            print(f"[history-skip] {path.name}: {type(ex).__name__}: {ex}", flush=True)
    return len(restored_keys)


RESTORED_SAMPLES = restore_result_history()
if RESTORED_SAMPLES:
    print(f"[history] restored {RESTORED_SAMPLES} canonical result logs", flush=True)

async def ssh_exec(cmd, timeout=120):
    proc = await asyncio.create_subprocess_exec(*SSH, cmd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        try: proc.kill(); await proc.wait()
        except: pass
        return 124, "", "timeout"
    return proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")

def _runner_request_sync(method, path, payload, timeout):
    body = json.dumps(payload).encode("utf-8") if payload is not None else b""
    request = (
        f"{method} {path} HTTP/1.1\r\n"
        "Host: runner\r\n"
        "Connection: close\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n\r\n"
    ).encode("ascii") + body
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(RUNNER_SOCKET)
        sock.sendall(request)
        chunks = []
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
    finally:
        sock.close()
    response = b"".join(chunks)
    header, separator, response_body = response.partition(b"\r\n\r\n")
    if not separator:
        raise RuntimeError("runner 返回了不完整的 HTTP 响应")
    status_line = header.split(b"\r\n", 1)[0].decode("ascii", "replace")
    try:
        status_code = int(status_line.split()[1])
    except (IndexError, ValueError):
        raise RuntimeError("runner 返回了无效的 HTTP 状态")
    try:
        data = json.loads(response_body.decode("utf-8"))
    except json.JSONDecodeError:
        data = {"detail": response_body.decode("utf-8", "replace")[:240]}
    if status_code >= 400:
        raise RuntimeError(str(data.get("detail", f"runner HTTP {status_code}")))
    return data

async def runner_request(method, path, payload=None, timeout=30):
    if not RUNNER_SOCKET:
        raise RuntimeError("RUNNER_SOCKET 未配置")
    return await asyncio.to_thread(_runner_request_sync, method, path, payload, timeout)


def _caas_http_request_sync(method, path, payload, timeout):
    if not CAAS_RUNNER_URL:
        return _runner_request_sync(method, path, payload, timeout)
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        CAAS_RUNNER_URL + path, data=body, method=method,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode("utf-8", "replace")
        raise RuntimeError(f"CaaS runner HTTP {ex.code}: {detail[-240:]}") from ex


async def caas_runner_request(method, path, payload=None, timeout=30):
    return await asyncio.to_thread(_caas_http_request_sync, method, path, payload, timeout)

async def ensure_guest_runner():
    """快照 guest 重启后自动恢复单个 runner 文件。"""
    rc, _, _ = await ssh_exec(f"test -x {GUEST_BENCH}", timeout=20)
    if rc == 0:
        return
    if not GUEST_RUNNER_SOURCE.is_file():
        raise RuntimeError(f"host runner 不存在: {GUEST_RUNNER_SOURCE}")
    destination = f"{VM_USER}@{VM_HOST}:{GUEST_BENCH_RAW}"
    proc = await asyncio.create_subprocess_exec(
        *SCP, str(GUEST_RUNNER_SOURCE), destination,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        try: proc.kill(); await proc.wait()
        except: pass
        raise RuntimeError("上传 guest runner 超时")
    if proc.returncode != 0:
        detail = (err or out).decode("utf-8", "replace")
        raise RuntimeError("上传 guest runner 失败: " + detail[-180:])
    rc, out, err = await ssh_exec(f"chmod 755 {GUEST_BENCH}", timeout=20)
    if rc != 0:
        raise RuntimeError("设置 guest runner 权限失败: " + (err or out)[-180:])

async def broadcast(msg):
    dead = []
    for ws in list(clients):
        try: await ws.send_text(json.dumps(msg))
        except: dead.append(ws)
    for ws in dead: clients.discard(ws)

def state_payload():
    return {"type": "state", "status": status, "samples": list(samples.values())}

async def set_status(state_val, msg=""):
    status["state"] = state_val
    status["msg"] = msg
    print(f"[status] {state_val}: {msg}", flush=True)
    await broadcast({"type": "status", "status": status})

async def prepare(target):
    if target == "spdk":
        # Do not automatically stop/zero mdraid devices from a web request.
        # The guest image already contains the SPDK setup path.
        await ensure_guest_runner()
        if mode["cur"] == target: return
        rc, out, err = await ssh_exec(f"{GUEST_BENCH} to-spdk", timeout=120)
        if rc != 0:
            raise RuntimeError("to-spdk: " + (out[:100] if out else err[:100]))
    else:
        if mode["cur"] == target: return
        raise RuntimeError("kernel/mdraid transitions require an explicit offline procedure")
    mode["cur"] = target

async def do_run(engine, rw, bs, qd, rt):
    async with run_lock:
        try:
            if RUNNER_SOCKET:
                await do_stream_via_runner(engine, rw, bs, qd, rt)
                await broadcast({"type": "stream_end"})
                return
            await set_status("preparing", f"{ENGINES[engine]} 准备...")
            await prepare(ENGINE_MODE[engine])
            await set_status("running", f"{ENGINES[engine]} {rw} {bs} 运行中...")
            name = f"{engine}_{rw}_bs{bs}_qd{qd}.log"
            rc, o, e = await ssh_exec(f"RUNTIME={rt} QD={qd} {GUEST_BENCH} run {engine} {rw} {bs}", timeout=int(rt)+220)
            if rc != 0:
                raise RuntimeError("runner 失败: " + (e or o)[-180:])
            rc2, log, err = await ssh_exec(f"cat {GUEST_OUTDIR}/{name}", timeout=30)
            if rc2 != 0:
                raise RuntimeError("读取结果失败: " + (err or log)[:160])
            parsed = parse_text(log)
            s = build_sample(engine, rw, bs, qd, rt, parsed)
            samples[skey(s)] = s
            try: (RESULTS_DIR / name).write_text(log)
            except: pass
            await broadcast({"type": "sample", "sample": s})
            await broadcast(state_payload())
            await set_status("idle", f"OK  {s['iops']} IOPS  {s['bw_mib']} MiB/s  {s['lat_us']}µs")
        except Exception as ex:
            print(f"[run-error] {type(ex).__name__}: {ex}", flush=True)
            await set_status("failed", str(ex)[:120])


async def do_stream_via_runner(engine, rw, bs, qd, rt):
    """通过 master 上的 Unix-socket runner 获取实时点，API 容器不接触 SSH 凭据。"""
    await set_status("preparing", f"{ENGINES[engine]} 准备...")
    job = await runner_request("POST", "/run", {
        "engine": engine, "rw": rw, "bs": bs,
        "qd": int(qd), "rt": int(rt),
    }, timeout=30)
    job_id = job["job_id"]
    await set_status("running", f"{ENGINES[engine]} {rw} {bs} 实时运行中...")
    await broadcast({"type": "stream_start", "engine": engine,
                     "engine_name": ENGINES[engine], "rw": rw, "bs": bs,
                     "qd": int(qd), "rt": int(rt)})

    seen = 0
    deadline = time.monotonic() + int(rt) + (660 if engine == "mdraid" else 240)
    while True:
        if time.monotonic() > deadline:
            raise RuntimeError("runner 状态轮询超时")
        current = await runner_request("GET", f"/run/{job_id}", timeout=30)
        points = current.get("points", [])
        for point in points[seen:]:
            await broadcast(point)
        seen = len(points)
        state = current.get("state")
        if state == "failed":
            raise RuntimeError(current.get("message", "runner failed"))
        if state == "done":
            log = current.get("log", "")
            name = f"{engine}_{rw}_bs{bs}_qd{qd}.log"
            s = None
            try:
                parsed = parse_text(log)
                s = build_sample(engine, rw, bs, qd, rt, parsed)
                try:
                    (RESULTS_DIR / name).write_text(log, encoding="utf-8")
                except Exception:
                    pass
            except Exception:
                valid = [p for p in points if p.get("iops", 0) > 0]
                if valid:
                    s = {"engine": engine, "engine_name": ENGINES.get(engine, engine),
                         "rw": rw, "bs": bs, "qd": int(qd), "rt": int(rt),
                         "iops": round(sum(p["iops"] for p in valid) / len(valid)),
                         "bw_mib": round(sum(p["bw_mib"] for p in valid) / len(valid), 1),
                         "lat_us": None, "lat_min": None, "lat_max": None,
                         "lat_stdev": None, "pct": {}, "lat_dist": {}, "cpu": {},
                         "io_depths": {}, "bw_stat": {}, "iops_stat": {},
                         "ts": time.time()}
            if s is None:
                raise RuntimeError("runner 已完成但结果日志无法解析")
            s["series"] = [{"t": i + 1, "iops": p["iops"], "bw_mib": p["bw_mib"]}
                            for i, p in enumerate(points)]
            if engine == "dpp":
                s["parity_verified"] = bool(current.get("parity_verified"))
            samples[skey(s)] = s
            await broadcast({"type": "sample", "sample": s})
            await broadcast(state_payload())
            parity_note = "  parity scrub PASS" if s.get("parity_verified") else ""
            await set_status("idle", f"OK  {s['iops']} IOPS  {s['bw_mib']} MiB/s  {s.get('lat_us') or 0}µs{parity_note}")
            return
        await asyncio.sleep(0.25)


async def do_stream(engine, rw, bs, qd, rt):
    """流式运行: 实时逐秒推送 IOPS/BW 数据点, 结束后再落一个完整 sample"""
    async with run_lock:
        try:
            if RUNNER_SOCKET:
                await do_stream_via_runner(engine, rw, bs, qd, rt)
                await broadcast({"type": "stream_end"})
                return
            await set_status("preparing", f"{ENGINES[engine]} 准备...")
            await prepare(ENGINE_MODE[engine])
            await set_status("running", f"{ENGINES[engine]} {rw} {bs} 实时运行中...")
            await broadcast({"type": "stream_start", "engine": engine, "engine_name": ENGINES[engine],
                             "rw": rw, "bs": bs, "qd": int(qd), "rt": int(rt)})

            # 通过 ssh 流式运行 bench.sh stream, 逐行读取
            cmd = SSH + [f"RUNTIME={rt} QD={qd} {GUEST_BENCH} stream {engine} {rw} {bs}"]
            proc = await asyncio.create_subprocess_exec(*cmd,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)

            prev_mib = 0.0      # 上一次累计 MiB
            prev_ios = 0.0      # 上一次累计 IO 数
            t = 0
            points = []
            last_iops = last_bw = last_lat = 0
            try:
                while True:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=int(rt)+60)
                    if not line:
                        break
                    s = line.decode("utf-8", "replace").strip()
                    if s.startswith("STREAM_END"):
                        break
                    if not s.startswith("STREAM|"):
                        continue
                    body = s[len("STREAM|"):]
                    # 解析: write: IOPS=39.0k, BW=2436MiB/s (..)(5481MiB/2250msec)
                    m_iops = re.search(r"IOPS=([0-9.kKmM]+)", body)
                    m_io = re.search(r"\(([0-9.]+)([KMGT]i?B)/([0-9]+)msec\)", body)
                    m_bw = re.search(r"BW=([0-9.]+)([KMGT]i?B/s)", body)
                    if not m_iops:
                        continue
                    t += 1
                    # 累计 IO 量 -> 瞬时带宽(本秒 = 累计差值)
                    inst_bw = None
                    if m_io:
                        cur_mib = float(m_io.group(1))
                        unit = m_io.group(2)
                        if unit.startswith("G"): cur_mib *= 1024
                        elif unit.startswith("K"): cur_mib /= 1024
                        inst_bw = max(0.0, cur_mib - prev_mib)
                        prev_mib = cur_mib
                    if inst_bw is None and m_bw:
                        v = float(m_bw.group(1)); u = m_bw.group(2)
                        inst_bw = v*1024 if u.startswith("G") else (v/1024 if u.startswith("K") else v)
                    # 瞬时 IOPS = 瞬时带宽 / 块大小; 退化用累计 IOPS
                    cum_iops = _si(m_iops.group(1))
                    bs_mib = {"4k":4/1024,"16k":16/1024,"32k":32/1024,"64k":64/1024,"128k":128/1024,"256k":256/1024}.get(bs, 64/1024)
                    inst_iops = round((inst_bw or 0)/bs_mib) if bs_mib else round(cum_iops)
                    dp = {"type":"stream_point","t":t,
                          "iops":inst_iops,
                          "bw_mib":round(inst_bw or 0,1),
                          "engine":engine}
                    last_iops, last_bw = inst_iops, round(inst_bw or 0,1)
                    points.append({"iops":inst_iops,"bw_mib":round(inst_bw or 0,1)})
                    await broadcast(dp)
            except asyncio.TimeoutError:
                pass
            try: proc.kill(); await proc.wait()
            except: pass

            # 流式结束: 读全文日志解析完整统计(延迟/百分位/CPU/IO深度), 补全所有图
            name = f"{engine}_{rw}_bs{bs}_qd{qd}.log"
            rc2, log, err = await ssh_exec(f"cat {GUEST_OUTDIR}/{name}", timeout=30)
            if rc2 != 0:
                raise RuntimeError("读取结果失败: " + (err or log)[:160])
            s = None
            try:
                parsed = parse_text(log)
                s = build_sample(engine, rw, bs, qd, rt, parsed)
                try: (RESULTS_DIR / name).write_text(log)
                except: pass
            except Exception:
                s = None
            # 全文解析失败时, 退回用流式点算 iops/bw
            if s is None:
                valid = [p for p in points if p["iops"] > 0]
                if valid:
                    avg_iops = round(sum(p["iops"] for p in valid)/len(valid))
                    avg_bw = round(sum(p["bw_mib"] for p in valid)/len(valid), 1)
                    s = {"engine":engine,"engine_name":ENGINES.get(engine,engine),
                         "rw":rw,"bs":bs,"qd":int(qd),"rt":int(rt),
                         "iops":avg_iops,"bw_mib":avg_bw,
                         "lat_us":None,"lat_min":None,"lat_max":None,"lat_stdev":None,
                         "pct":{},"lat_dist":{},"cpu":{},"io_depths":{},
                         "bw_stat":{},"iops_stat":{},"ts":time.time()}
            if s is not None:
                # 把实时曲线点也挂到 sample 上(供前端保留曲线)
                s["series"] = [{"t":i+1,"iops":p["iops"],"bw_mib":p["bw_mib"]} for i,p in enumerate(points)]
                samples[skey(s)] = s
                await broadcast({"type": "sample", "sample": s})
                await broadcast(state_payload())
                await set_status("idle", f"OK  {s['iops']} IOPS  {s['bw_mib']} MiB/s  {s.get('lat_us') or 0}µs")
            else:
                await set_status("failed", "实时测试未取到数据(可能崩溃)")
            await broadcast({"type":"stream_end"})
        except Exception as ex:
            print(f"[stream-error] {type(ex).__name__}: {ex}", flush=True)
            await set_status("failed", str(ex)[:120])
            await broadcast({"type":"stream_end"})

ALLOWED_RW = frozenset({"write", "randwrite", "read", "randread"})
ALLOWED_BS = frozenset({"4k", "16k", "32k", "64k", "128k", "256k"})


class RunReq(BaseModel):
    engine: str
    rw: str = "write"
    bs: str = "64k"
    qd: int = Field(default=32, ge=1, le=1024)
    rt: int = Field(default=5, ge=1, le=3600)


class CaaSRunReq(BaseModel):
    num: int = Field(default=25000, ge=1000, le=2000000)
    threads: int = Field(default=2, ge=1, le=64)
    value_size: int = Field(default=1024, ge=64, le=1048576)
    repeats: int = Field(default=3, ge=1, le=5)


class DppRunReq(BaseModel):
    rounds: int = Field(default=20, ge=1, le=200)
    benchmark_operations: int = Field(default=20, ge=1, le=200)

@app.post("/api/run")
async def api_run(req: RunReq):
    if req.engine not in ENGINES:
        return {"ok": False, "err": "unknown"}
    if req.engine not in ENABLED_RUN_ENGINES:
        return {"ok": False, "err": "该引擎未通过全局开关和 BENCH_ENABLED_ENGINES 白名单双重门禁"}
    if req.rw not in ALLOWED_RW:
        return {"ok": False, "err": "unsupported read/write mode"}
    if req.bs not in ALLOWED_BS:
        return {"ok": False, "err": "unsupported block size"}
    if req.engine == "raid5f" and req.bs != "256k":
        return {"ok": False, "err": "RAID5F 256k only"}
    if run_lock.locked():
        return {"ok": False, "err": "another experiment is already running"}
    asyncio.create_task(do_stream(req.engine, req.rw, req.bs, str(req.qd), str(req.rt)))
    return {"ok": True}


@app.get("/api/engines")
async def api_engines():
    engines = [dict(engine) for engine in ENGINE_CATALOG]
    if RUNNER_SOCKET:
        try:
            health = await runner_request("GET", "/health", timeout=8)
            ready = set(health.get("run_enabled_engines", []))
            readiness = health.get("engine_readiness", {})
            for engine in engines:
                if engine["runnable"] and engine["key"] not in ready:
                    engine["runnable"] = False
                    engine["reason"] = (
                        "隔离 guest 未就绪" if readiness.get(engine["key"]) is False
                        else "安全 runner 当前不可用"
                    )
        except Exception:
            for engine in engines:
                engine["runnable"] = False
                engine["reason"] = "无法读取安全 runner 健康状态"
    return {"engines": engines}


@app.get("/api/health")
async def api_health():
    run_enabled = bool(ENABLED_RUN_ENGINES)
    return {
        "ok": True,
        "run_enabled": run_enabled,
        "run_enabled_engines": sorted(ENABLED_RUN_ENGINES),
        "run_enabled_reason": (
            "已通过全局开关和引擎白名单双重启用"
            if run_enabled else "实测默认关闭；需同时开启 BENCH_ENABLE_RUN 并设置 BENCH_ENABLED_ENGINES"
        ),
        "state": status["state"],
        "message": status["msg"],
        "engine_mode": mode["cur"],
        "samples": len(samples),
        "guest_bench": GUEST_BENCH,
        "runner_source": str(GUEST_RUNNER_SOURCE),
        "runner_socket": RUNNER_SOCKET,
        "caas_runner_url": CAAS_RUNNER_URL,
        "results_dir": str(RESULTS_DIR),
    }


@app.get("/api/caas/health")
async def api_caas_health():
    try:
        return await caas_runner_request("GET", "/health", timeout=10)
    except Exception as ex:
        return {"ok": False, "error": str(ex)[:240]}


@app.post("/api/caas/run")
async def api_caas_run(req: CaaSRunReq):
    try:
        return await caas_runner_request("POST", "/compare", req.model_dump(), timeout=10)
    except Exception as ex:
        return {"ok": False, "error": str(ex)[:240]}


@app.get("/api/caas/run/{job_id}")
async def api_caas_run_status(job_id: str):
    if not re.fullmatch(r"compare-[0-9a-f]{32}", job_id):
        return {"state": "failed", "message": "invalid job id"}
    try:
        return await caas_runner_request("GET", f"/compare/{job_id}", timeout=10)
    except Exception as ex:
        return {"state": "failed", "message": str(ex)[:240]}


@app.post("/api/dpp/run")
async def api_dpp_run(req: DppRunReq):
    try:
        return await caas_runner_request("POST", "/dpp/verify", req.model_dump(), timeout=180)
    except Exception as ex:
        return {"status": "failed", "error": str(ex)[:240]}

@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        await ws.send_text(json.dumps(state_payload()))
        while True:
            await ws.receive_text()
    except:
        clients.discard(ws)

HTML = r"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>ScalaAFA 整合系统性能看板</title>
<script src="/static/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);min-height:100vh;color:#e4e6eb;padding:24px}
.container{max-width:1700px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding:20px 28px;background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
h1{font-size:24px;font-weight:700;background:linear-gradient(90deg,#00d4ff,#7b2ff7,#f72585);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.status{padding:10px 20px;border-radius:24px;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase}
.status.idle{background:rgba(76,217,100,0.2);color:#4cd964;border:1px solid rgba(76,217,100,0.4)}
.status.running{background:rgba(255,159,10,0.2);color:#ff9f0a;border:1px solid rgba(255,159,10,0.4);animation:pulse 1.5s infinite}
.status.failed{background:rgba(255,69,58,0.2);color:#ff453a;border:1px solid rgba(255,69,58,0.4)}
.status.preparing{background:rgba(100,200,255,0.2);color:#64c8ff;border:1px solid rgba(100,200,255,0.4)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
.layout{display:grid;grid-template-columns:300px 1fr;gap:24px}
.glass{background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
.sidebar{padding:24px;height:fit-content}
.main{padding:24px}
.section{margin-bottom:20px}
.section-title{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-title::before{content:'';width:3px;height:14px;background:linear-gradient(180deg,#00d4ff,#7b2ff7);border-radius:2px}
.btn-group{display:flex;gap:6px;flex-wrap:wrap}
.btn{padding:8px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;background:rgba(255,255,255,0.05);color:#e4e6eb;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.2s}
.btn:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.3);transform:translateY(-1px)}
.btn.active{background:linear-gradient(135deg,#00d4ff,#7b2ff7);border-color:transparent;color:white;box-shadow:0 4px 12px rgba(123,47,247,0.4)}
.btn[data-val="scalaafa"].active{background:linear-gradient(135deg,#00d4ff,#0066cc)}
.btn[data-val="dpp"].active{background:linear-gradient(135deg,#f72585,#9b1b67)}
.btn[data-val="mdraid"].active{background:linear-gradient(135deg,#4cd964,#00aa44)}
.btn[data-val="raid5f"].active{background:linear-gradient(135deg,#ff9f0a,#ff6600)}
.run-btn{width:100%;padding:14px;margin-top:18px;background:linear-gradient(135deg,#00d4ff,#7b2ff7,#f72585);color:white;border:none;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:0.5px;cursor:pointer;box-shadow:0 8px 24px rgba(123,47,247,0.4);transition:all 0.2s}
.run-btn:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(123,47,247,0.5)}
.run-btn:active{transform:translateY(0)}
.env-list{max-height:280px;overflow-y:auto}
.env-list::-webkit-scrollbar{width:6px}
.env-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:3px}
.env-item{padding:10px 12px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:11px;transition:all 0.2s;background:rgba(255,255,255,0.03)}
.env-item:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.2)}
.env-item.active{background:linear-gradient(135deg,rgba(0,212,255,0.15),rgba(123,47,247,0.15));border-color:rgba(0,212,255,0.5)}
.env-config{font-family:'SF Mono','Monaco',monospace;color:#a8b3cf;margin-bottom:4px}
.env-engines{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.engine-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.engine-badge.scalaafa{background:rgba(0,212,255,0.2);color:#00d4ff}
.engine-badge.dpp{background:rgba(247,37,133,0.2);color:#f72585}
.engine-badge.mdraid{background:rgba(76,217,100,0.2);color:#4cd964}
.engine-badge.raid5f{background:rgba(255,159,10,0.2);color:#ff9f0a}

/* 主区域 */
.empty-state{text-align:center;padding:80px 20px;color:#6b7280}
.empty-state-icon{font-size:64px;margin-bottom:16px;opacity:0.5}
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px}
.metric-card{padding:16px 20px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);position:relative;overflow:hidden;transition:all 0.2s}
.metric-card:hover{transform:translateY(-2px);background:rgba(255,255,255,0.06)}
.metric-card::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:var(--accent,#00d4ff)}
.metric-label{font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px}
.metric-value{font-size:24px;font-weight:700;color:#e4e6eb;font-family:'SF Mono',monospace}
.metric-unit{font-size:11px;color:#6b7280;margin-left:4px;font-weight:500}
.metric-sub{font-size:10px;color:#6b7280;margin-top:4px;font-family:'SF Mono',monospace}

.charts-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px;margin-top:20px}
.chart-box{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px;transition:all 0.2s}
.chart-box:hover{background:rgba(255,255,255,0.06)}
.chart-title{font-size:12px;font-weight:600;color:#e4e6eb;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.chart-title-icon{font-size:14px}
.chart-subtitle{font-size:10px;color:#9ca3af;font-weight:normal;margin-left:auto}
.chart-container{position:relative;height:260px}
.chart-container.tall{height:320px}
.col-6{grid-column:span 6}.col-4{grid-column:span 4}.col-8{grid-column:span 8}.col-12{grid-column:span 12}

.samples-table{margin-top:20px;background:rgba(255,255,255,0.03);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)}
table{width:100%;border-collapse:collapse;font-size:11px}
th{padding:10px 12px;text-align:left;background:rgba(255,255,255,0.05);color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-size:10px}
td{padding:10px 12px;border-top:1px solid rgba(255,255,255,0.05);color:#e4e6eb;font-family:'SF Mono',monospace}
td.engine-cell{font-weight:600;font-family:inherit}
.engine-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}
.dot-scalaafa{background:#00d4ff}.dot-dpp{background:#f72585}.dot-mdraid{background:#4cd964}.dot-raid5f{background:#ff9f0a}
.caas-control{margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1)}
.caas-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.caas-field label{display:block;color:#9ca3af;font-size:10px;margin-bottom:4px}
.caas-field input,.caas-field select{width:100%;padding:7px 8px;border-radius:7px;border:1px solid rgba(255,255,255,.15);background:#24243e;color:#e4e6eb;font-size:11px}
.caas-health{font:11px 'SF Mono',monospace;line-height:1.7;margin:10px 0;color:#9ca3af}
.caas-health .ok{color:#4cd964}.caas-health .bad{color:#ff453a}
.caas-run-btn{width:100%;padding:11px;border:0;border-radius:9px;background:linear-gradient(135deg,#7b2ff7,#f72585);color:white;font-weight:700;cursor:pointer}
.caas-run-btn:disabled{opacity:.5;cursor:not-allowed}
.caas-panel{display:none;margin-bottom:20px;padding:20px;border:1px solid rgba(247,37,133,.32);border-radius:12px;background:rgba(247,37,133,.06)}
.caas-panel.show{display:block}.caas-panel h2{font-size:16px;margin-bottom:12px;color:#f3d9ff}
.caas-message{color:#c4b5d4;font-size:12px;margin-bottom:14px}
.caas-path{font:10px 'SF Mono',monospace;color:#8c93a8;overflow-wrap:anywhere;margin-top:10px}
</style></head><body>
<div class="container">
<div class="header">
<h1>⚡ ScalaAFA 整合系统 · 存算优化性能看板</h1>
<div class="status idle" id="status">准备就绪</div>
</div>
<div class="layout">
<div class="sidebar glass">
<div class="section"><div class="section-title">引擎</div><div class="btn-group" id="engineGroup">
<button class="btn" data-val="scalaafa">ScalaAFA</button>
<button class="btn" data-val="dpp">dPP（隔离 FEMU）</button>
<button class="btn" data-val="mdraid" disabled title="未配置隔离测试卷">mdraid（待配置）</button>
<button class="btn" data-val="raid5f">RAID5F（隔离 FEMU）</button>
</div></div>
<div class="caas-message">ScalaAFA、dPP 与 RAID5F 实测运行在 8091 隔离 FEMU 虚拟 NVMe；mdraid 运行在 8093 独立 kernel guest 和四块具名虚拟盘。它们是隔离虚拟设备性能结果；在线 dPP 数据一致性验收由下方 CaaS 验收门单独报告。</div>
<div class="section"><div class="section-title">读写模式</div><div class="btn-group" id="rwGroup">
<button class="btn active" data-val="write">顺序写</button>
<button class="btn" data-val="randwrite">随机写</button>
<button class="btn" data-val="read">顺序读</button>
<button class="btn" data-val="randread">随机读</button>
</div></div>
<div class="section"><div class="section-title">块大小</div><div class="btn-group" id="bsGroup">
<button class="btn" data-val="4k">4k</button>
<button class="btn" data-val="16k">16k</button>
<button class="btn" data-val="32k">32k</button>
<button class="btn active" data-val="64k">64k</button>
<button class="btn" data-val="128k">128k</button>
<button class="btn" data-val="256k">256k</button>
</div></div>
<div class="section"><div class="section-title">队列深度</div><div class="btn-group" id="qdGroup">
<button class="btn" data-val="1">1</button>
<button class="btn" data-val="8">8</button>
<button class="btn active" data-val="32">32</button>
<button class="btn" data-val="64">64</button>
</div></div>
<div class="section"><div class="section-title">运行时间</div><div class="btn-group" id="rtGroup">
<button class="btn active" data-val="2">2s</button>
<button class="btn" data-val="5">5s</button>
<button class="btn" data-val="10">10s</button>
<button class="btn" data-val="30">30s</button>
</div></div>
<button class="run-btn" id="runBtn">▶ 开始测试</button>
<div class="section caas-control">
<div class="section-title">原始未优化存算路径 / ScalaAFA 整合优化系统</div>
<div class="caas-grid">
  <div class="caas-field"><label>每线程写入数</label><input id="caasNum" type="number" min="5000" max="2000000" value="20000"></div>
  <div class="caas-field"><label>写入线程</label><input id="caasThreads" type="number" min="1" max="64" value="1"></div>
  <div class="caas-field"><label>Value 大小</label><select id="caasValue"><option value="256">256 B</option><option value="1024" selected>1 KiB</option><option value="4096">4 KiB</option></select></div>
  <div class="caas-field"><label>重复轮数</label><select id="caasRepeats"><option value="1">1（冒烟）</option><option value="3" selected>3（正式验收）</option><option value="5">5（汇报）</option></select></div>
</div>
<div class="caas-health" id="caasHealth">正在检查 HDFS / ProCP / CSA…</div>
<button class="caas-run-btn" id="caasRunBtn" disabled>▶ 运行完整系统性能对比</button>
</div>
<div class="section" style="margin-top:24px"><div class="section-title">测试环境</div><div class="env-list" id="envList"></div></div>
</div>
<div class="main glass">
<div class="caas-panel" id="caasPanel"></div>
<div id="content"></div>
</div>
</div></div>
<script>
let ws,state={engine:null,rw:"write",bs:"64k",qd:32,rt:2,env:null,samples:[]},charts={};
const COLORS={scalaafa:"#00d4ff",dpp:"#f72585",mdraid:"#4cd964",raid5f:"#ff9f0a"};
const COLOR_SOFT={scalaafa:"rgba(0,212,255,0.4)",dpp:"rgba(247,37,133,0.4)",mdraid:"rgba(76,217,100,0.4)",raid5f:"rgba(255,159,10,0.4)"};
const chartsAvailable=typeof Chart!=="undefined";
if(chartsAvailable){
  Chart.defaults.color="#9ca3af";
  Chart.defaults.borderColor="rgba(255,255,255,0.08)";
  Chart.defaults.font.family="'SF Mono',Monaco,monospace";
  Chart.defaults.font.size=10;
}

let caasJob=null,caasPoll=null,comparisonChart=null;
function caasReadyItem(label,item){
  const ok=item&&item.ready;
  return '<span class="'+(ok?'ok':'bad')+'">'+(ok?'●':'●')+'</span> '+label+' '+(item&&item.address?item.address:'未配置');
}
async function refreshCaasHealth(){
  const el=document.getElementById('caasHealth'),btn=document.getElementById('caasRunBtn');
  try{
    const h=await (await fetch('/api/caas/health')).json();
    el.innerHTML=[caasReadyItem('HDFS',h.hdfs),caasReadyItem('ProCP',h.procp),caasReadyItem('CSA',h.csa),caasReadyItem('在线 dPP 验收门',h.dpp_online)].join('<br>');
    if(h.kubernetes_native){
      const backend=h.storage_backend||'未声明存储后端';
      el.innerHTML+='<br><span class="'+(h.ok?'ok':'bad')+'">'+(h.ok?'✓ K8s CaaS 组件就绪':'⚠ K8s CaaS 数据路径不可用；禁止实验')+'</span>';
      el.innerHTML+='<br>当前后端：'+backend;
      if(!(backend.includes('ScalaAFA afa0')&&backend.includes('NVMe-oF')&&backend.includes('local PV')))el.innerHTML+='<br><span class="bad">ScalaAFA 卷仍隔离；本次 CaaS 结果不能作为 ScalaAFA 性能数据</span>';
    }
    if(h.hdfs&&!h.hdfs.datanode_stream_ready)el.innerHTML+='<br><span class="bad">DataNode 数据流未就绪</span>';
    btn.disabled=!h.ok||h.runner_state!=='idle'||!!caasJob;
    if(h.runner_state!=='idle'&&!caasJob)el.innerHTML+='<br><span class="bad">runner 当前忙碌</span>';
  }catch(e){el.textContent='CaaS-LSM 健康检查失败: '+e;btn.disabled=true;}
}
function showCaasJob(job){
  const panel=document.getElementById('caasPanel');panel.classList.add('show');
  const cmp=job.comparison||{},local=cmp.local||{},caas=cmp.caas||{},imp=cmp.improvement||{},acc=cmp.acceptance||{};
  let details='';
  if(job.state==='done'){
    const lp=local.write_latency_us||{},cp=caas.write_latency_us||{};
    details='<div class="metrics-grid">'+
      '<div class="metric-card" style="--accent:#4cd964"><div class="metric-label">原始未优化存算路径</div><div class="metric-value">'+Math.round(local.ops_per_sec||0).toLocaleString()+'<span class="metric-unit">ops/s</span></div><div class="metric-sub">本地压缩 / 本地计算 · P99 '+(lp.p99||0).toFixed(1)+' µs · CV '+(local.ops_per_sec_cv_percent||0).toFixed(1)+'%</div></div>'+ 
      '<div class="metric-card" style="--accent:#f72585"><div class="metric-label">ScalaAFA 整合优化系统</div><div class="metric-value">'+Math.round(caas.ops_per_sec||0).toLocaleString()+'<span class="metric-unit">ops/s</span></div><div class="metric-sub">在线 dPP + CaaS-LSM + 负载感知 + 写入/压缩粒度优化 · P99 '+(cp.p99||0).toFixed(1)+' µs · CV '+(caas.ops_per_sec_cv_percent||0).toFixed(1)+'% · 远程压缩 '+(caas.remote_compactions||0)+'</div></div>'+ 
      '<div class="metric-card" style="--accent:#00d4ff"><div class="metric-label">吞吐变化</div><div class="metric-value">'+(imp.throughput_percent||0).toFixed(2)+'<span class="metric-unit">%</span></div></div>'+
      '<div class="metric-card" style="--accent:#7b2ff7"><div class="metric-label">P99 降低</div><div class="metric-value">'+(imp.p99_reduction_percent||0).toFixed(2)+'<span class="metric-unit">%</span></div></div></div>'+
      '<div class="caas-message"><span class="'+(acc.passed?'ok':'bad')+'">'+(acc.passed?'✓ 正式吞吐验收通过':'⚠ 正式吞吐验收未通过')+'</span> · 门槛：至少 3 轮、优化系统中位吞吐更高、双方 CV ≤ '+(acc.max_cv_percent||20)+'%、远程路径实际生效、在线 dPP 门禁通过</div>'+ 
      '<div class="chart-box" style="margin-top:14px"><div class="chart-title">📊 原始系统与完整整合系统性能对比<span class="chart-subtitle">相同数据规模，AB/BA 交替，多轮中位数</span></div><div class="chart-container"><canvas id="caasCompareChart"></canvas></div></div>'+ 
      '<div class="samples-table"><table><thead><tr><th>模式</th><th>吞吐 ops/s</th><th>带宽 MB/s</th><th>写入耗时 s</th><th>P50 µs</th><th>P95 µs</th><th>P99 µs</th><th>远程压缩</th></tr></thead><tbody>'+
      '<tr><td>原始未优化存算路径（本地压缩 / 本地计算）</td><td>'+Math.round(local.ops_per_sec||0).toLocaleString()+'</td><td>'+(local.mb_per_sec||0).toFixed(1)+'</td><td>'+(local.seconds||0).toFixed(3)+'</td><td>'+(lp.p50||0).toFixed(1)+'</td><td>'+(lp.p95||0).toFixed(1)+'</td><td>'+(lp.p99||0).toFixed(1)+'</td><td>0</td></tr>'+ 
      '<tr><td>ScalaAFA 整合优化系统</td><td>'+Math.round(caas.ops_per_sec||0).toLocaleString()+'</td><td>'+(caas.mb_per_sec||0).toFixed(1)+'</td><td>'+(caas.seconds||0).toFixed(3)+'</td><td>'+(cp.p50||0).toFixed(1)+'</td><td>'+(cp.p95||0).toFixed(1)+'</td><td>'+(cp.p99||0).toFixed(1)+'</td><td>'+(caas.remote_compactions||0)+'</td></tr></tbody></table></div>'+
      '<div class="caas-path">数据路径: '+(cmp.storage_path||'')+'<br>结果: '+(cmp.result_json||'')+'</div>';
  }
  panel.innerHTML='<h2>🧩 原始未优化存算路径 / ScalaAFA 整合优化系统</h2><div class="caas-message">'+(job.message||job.state)+'</div>'+details;
  if(job.state==='done')setTimeout(()=>drawCaasComparison(local,caas),0);
}
function drawCaasComparison(local,caas){
  const el=document.getElementById('caasCompareChart');if(!el)return;
  if(!chartsAvailable){nativeBars('caasCompareChart',['原始未优化路径','ScalaAFA 整合系统'],[local.ops_per_sec||0,caas.ops_per_sec||0],['#4cd964','#f72585'],'');return;}
  if(comparisonChart)comparisonChart.destroy();
  comparisonChart=new Chart(el.getContext('2d'),{type:'bar',data:{labels:['原始未优化存算路径','ScalaAFA 整合优化系统'],datasets:[
    {label:'吞吐 ops/s',data:[local.ops_per_sec||0,caas.ops_per_sec||0],backgroundColor:['rgba(76,217,100,.55)','rgba(247,37,133,.55)'],borderColor:['#4cd964','#f72585'],borderWidth:2,yAxisID:'y'},
    {label:'P99 µs',data:[(local.write_latency_us||{}).p99||0,(caas.write_latency_us||{}).p99||0],backgroundColor:['rgba(0,212,255,.45)','rgba(123,47,247,.45)'],borderColor:['#00d4ff','#7b2ff7'],borderWidth:2,yAxisID:'y1'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,position:'left',title:{display:true,text:'ops/s'}},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'P99 µs'}}}}});
}
async function pollCaasJob(){
  if(!caasJob)return;
  const job=await (await fetch('/api/caas/run/'+caasJob)).json();showCaasJob(job);
  updateStatus({state:job.state==='done'?'idle':job.state,msg:job.message||job.state});
  if(job.state==='done'||job.state==='failed'){
    clearInterval(caasPoll);caasPoll=null;caasJob=null;await refreshCaasHealth();
  }
}
document.getElementById('caasRunBtn').onclick=async()=>{
  const body={num:parseInt(document.getElementById('caasNum').value),threads:parseInt(document.getElementById('caasThreads').value),value_size:parseInt(document.getElementById('caasValue').value),repeats:parseInt(document.getElementById('caasRepeats').value)};
  const data=await (await fetch('/api/caas/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  if(!data.job_id){alert('CaaS-LSM 启动失败: '+(data.error||data.detail||'未知错误'));return;}
  caasJob=data.job_id;document.getElementById('caasRunBtn').disabled=true;
  showCaasJob({state:'queued',message:'系统对比已提交：同一数据规模下交替运行未优化路径与完整 ScalaAFA 整合路径'});
  await pollCaasJob();caasPoll=setInterval(pollCaasJob,2000);
};
refreshCaasHealth();setInterval(refreshCaasHealth,10000);


// ===== 实时流式曲线 =====
let streamChart=null, streamData={iops:[],bw:[],labels:[]}, streaming=false;
function ensureStreamUI(){
  let box=document.getElementById("streamBox");
  if(!box){
    box=document.createElement("div");
    box.id="streamBox";
    box.style.cssText="background:rgba(255,255,255,0.04);border:1px solid rgba(0,212,255,0.3);border-radius:12px;padding:18px;margin-bottom:20px";
    box.innerHTML='<div class="chart-title"><span class="chart-title-icon">🔴</span><span id="streamTitle">实时性能曲线</span><span class="chart-subtitle" id="streamSub">每秒一个数据点</span></div><div style="position:relative;height:260px"><canvas id="streamChart"></canvas></div>';
    const content=document.getElementById("content");
    content.parentNode.insertBefore(box, content);
  }
  return box;
}
function startStream(d){
  streaming=true;
  streamData={iops:[],bw:[],labels:[]};
  ensureStreamUI();
  document.getElementById("streamTitle").textContent="实时性能曲线 — "+d.engine_name+" · "+d.rw+" · "+d.bs+" · QD"+d.qd;
  document.getElementById("streamSub").textContent="运行中 (0s)";
  if(!chartsAvailable){
    document.getElementById("streamSub").textContent="运行中 · 图表库不可用，仍会保存实时数据";
    return;
  }
  const ctx=document.getElementById("streamChart").getContext("2d");
  if(streamChart)streamChart.destroy();
  const col=COLORS[d.engine]||"#00d4ff";
  streamChart=new Chart(ctx,{type:"line",data:{labels:[],datasets:[
    {label:"IOPS",data:[],borderColor:col,backgroundColor:col+"22",borderWidth:2.5,pointRadius:0,tension:0.3,yAxisID:"y",fill:true},
    {label:"带宽 MiB/s",data:[],borderColor:"#f72585",backgroundColor:"rgba(247,37,133,0.1)",borderWidth:2,pointRadius:0,tension:0.3,yAxisID:"y1",fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:300},
    plugins:{legend:{position:"top",labels:{usePointStyle:true,boxWidth:8,padding:12}}},
    scales:{x:{grid:{color:"rgba(255,255,255,0.05)"},title:{display:true,text:"时间 (秒)"}},
      y:{position:"left",beginAtZero:true,grid:{color:"rgba(255,255,255,0.05)"},title:{display:true,text:"IOPS"}},
      y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:"MiB/s"}}}}});
}
function pushStreamPoint(d){
  if(!streaming)return;
  streamData.labels.push(d.t+"s");
  streamData.iops.push(d.iops);
  streamData.bw.push(d.bw_mib);
  if(!chartsAvailable){
    document.getElementById("streamSub").textContent="运行中 ("+d.t+"s) · 当前 "+d.iops.toLocaleString()+" IOPS / "+d.bw_mib+" MiB/s";
    return;
  }
  if(!streamChart)return;
  streamChart.data.labels=streamData.labels;
  streamChart.data.datasets[0].data=streamData.iops;
  streamChart.data.datasets[1].data=streamData.bw;
  streamChart.update();
  document.getElementById("streamSub").textContent="运行中 ("+d.t+"s) · 当前 "+d.iops.toLocaleString()+" IOPS / "+d.bw_mib+" MiB/s";
}
function endStream(){
  streaming=false;
  const sub=document.getElementById("streamSub");
  if(sub)sub.textContent="✓ 已完成 ("+streamData.labels.length+" 个数据点)";
}

function connect(){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  ws=new WebSocket(proto+"//"+location.host+"/ws");
  ws.onmessage=msg=>{
    const d=JSON.parse(msg.data);
    if(d.type==="state"){
      if(d.status)state.status=d.status;
      if(d.samples)state.samples=d.samples;
      if(!state.env&&state.samples.length){
        const s=state.samples[0];state.env={rw:s.rw,bs:s.bs,qd:s.qd,rt:s.rt};
      }
      render();
    }
    else if(d.type==="status"){updateStatus(d.status);}
    else if(d.type==="sample"){
      const idx=state.samples.findIndex(s=>s.engine===d.sample.engine&&s.rw===d.sample.rw&&s.bs===d.sample.bs&&s.qd===d.sample.qd&&s.rt===d.sample.rt);
      if(idx>=0)state.samples[idx]=d.sample;else state.samples.push(d.sample);
      render();
    }
    else if(d.type==="stream_start"){ startStream(d); }
    else if(d.type==="stream_point"){ pushStreamPoint(d); }
    else if(d.type==="stream_end"){ endStream(); }
  };
  ws.onclose=()=>setTimeout(connect,2000);
}
function updateStatus(s){const el=document.getElementById("status");el.className="status "+s.state;el.textContent=s.msg||s.state;}

function render(){
  renderEnvList();
  if(!state.env&&state.samples.length){
    const s=state.samples[0];state.env={rw:s.rw,bs:s.bs,qd:s.qd,rt:s.rt};
  }
  const env=state.env?state.samples.filter(s=>s.rw===state.env.rw&&s.bs===state.env.bs&&s.qd===state.env.qd&&s.rt===state.env.rt):[];
  if(!env.length){
    document.getElementById("content").innerHTML='<div class="empty-state"><div class="empty-state-icon">🚀</div><h3 style="margin-bottom:8px;color:#e4e6eb">选择参数,开始测试</h3><p style="font-size:13px">配置完成后点击"开始测试",同配置的多引擎结果会自动汇集到一起</p></div>';
    return;
  }
  renderContent(env);
}

function renderEnvList(){
  const envs={};
  (state.samples||[]).forEach(s=>{
    const k=s.rw+"|"+s.bs+"|"+s.qd+"|"+s.rt;
    if(!envs[k])envs[k]={rw:s.rw,bs:s.bs,qd:s.qd,rt:s.rt,engines:[]};
    if(!envs[k].engines.find(e=>e.key===s.engine))envs[k].engines.push({key:s.engine,name:s.engine_name});
  });
  document.getElementById("envList").innerHTML=Object.values(envs).map(e=>{
    const active=state.env&&state.env.rw===e.rw&&state.env.bs===e.bs&&state.env.qd===e.qd&&state.env.rt===e.rt;
    const badges=e.engines.map(eg=>'<span class="engine-badge '+eg.key+'">'+eg.name+'</span>').join("");
    return '<div class="env-item '+(active?"active":"")+'" onclick=\'selectEnv('+JSON.stringify(e)+')\'><div class="env-config">'+e.rw+' · '+e.bs+' · QD'+e.qd+' · '+e.rt+'s</div><div class="env-engines">'+badges+'</div></div>';
  }).join("");
}

function renderContent(env){
  // 1. 顶部指标卡
  const metricsHTML=env.map(s=>{
    const c=COLORS[s.engine];
    return '<div class="metric-card" style="--accent:'+c+'">'+
      '<div class="metric-label" style="color:'+c+'">'+s.engine_name+'</div>'+
      '<div class="metric-value">'+s.iops.toLocaleString()+'<span class="metric-unit">IOPS</span></div>'+
      '<div class="metric-sub">'+s.bw_mib+' MiB/s · '+(s.lat_us||0).toFixed(0)+' µs · QD'+s.qd+'</div>'+
    '</div>';
  }).join("");
  
  // 2. 图表区(12列布局)
  const chartsHTML='<div class="charts-grid">'+
    '<div class="chart-box col-4"><div class="chart-title"><span class="chart-title-icon">📊</span>IOPS 对比<span class="chart-subtitle">每秒IO数</span></div><div class="chart-container"><canvas id="iopsChart"></canvas></div></div>'+
    '<div class="chart-box col-4"><div class="chart-title"><span class="chart-title-icon">⚡</span>带宽对比<span class="chart-subtitle">MiB/s</span></div><div class="chart-container"><canvas id="bwChart"></canvas></div></div>'+
    '<div class="chart-box col-4"><div class="chart-title"><span class="chart-title-icon">⏱</span>平均延迟<span class="chart-subtitle">µs (越低越好)</span></div><div class="chart-container"><canvas id="latChart"></canvas></div></div>'+
    '<div class="chart-box col-6"><div class="chart-title"><span class="chart-title-icon">🎯</span>多维性能雷达<span class="chart-subtitle">五维综合对比</span></div><div class="chart-container tall"><canvas id="radarChart"></canvas></div></div>'+
    '<div class="chart-box col-6"><div class="chart-title"><span class="chart-title-icon">📈</span>延迟长尾分布<span class="chart-subtitle">百分位 (对数轴)</span></div><div class="chart-container tall"><canvas id="pctChart"></canvas></div></div>'+
    '<div class="chart-box col-6"><div class="chart-title"><span class="chart-title-icon">📦</span>延迟区间分布<span class="chart-subtitle">IO 在各延迟桶的占比</span></div><div class="chart-container"><canvas id="latDistChart"></canvas></div></div>'+
    '<div class="chart-box col-3"><div class="chart-title"><span class="chart-title-icon">⚙</span>CPU 占用<span class="chart-subtitle">%</span></div><div class="chart-container"><canvas id="cpuChart"></canvas></div></div>'+
    '<div class="chart-box col-3"><div class="chart-title"><span class="chart-title-icon">🎚</span>IO 深度分布<span class="chart-subtitle">实际深度占比</span></div><div class="chart-container"><canvas id="depthChart"></canvas></div></div>'+
    '<div class="chart-box col-6"><div class="chart-title"><span class="chart-title-icon">📉</span>延迟统计 (min/avg/max)<span class="chart-subtitle">µs (对数轴)</span></div><div class="chart-container"><canvas id="latStatsChart"></canvas></div></div>'+
    '<div class="chart-box col-6"><div class="chart-title"><span class="chart-title-icon">📊</span>性能稳定性<span class="chart-subtitle">IOPS 标准差 (越低越稳)</span></div><div class="chart-container"><canvas id="stabilityChart"></canvas></div></div>'+
  '</div>';
  
  // 3. 详细表格
  const tableRows=env.map(s=>{
    return '<tr><td class="engine-cell"><span class="engine-dot dot-'+s.engine+'"></span>'+s.engine_name+'</td>'+
      '<td>'+s.iops.toLocaleString()+'</td>'+
      '<td>'+s.bw_mib+'</td>'+
      '<td>'+(s.lat_us||0).toFixed(1)+'</td>'+
      '<td>'+(s.lat_min||0).toFixed(1)+'</td>'+
      '<td>'+(s.lat_max||0).toFixed(0)+'</td>'+
      '<td>'+(s.lat_stdev||0).toFixed(1)+'</td>'+
      '<td>'+((s.cpu&&s.cpu.usr)||0).toFixed(1)+'%</td>'+
      '<td>'+(s.pct&&s.pct["99"]?s.pct["99"].toFixed(0):"-")+'</td>'+
      '<td>'+(s.pct&&s.pct["99.9"]?s.pct["99.9"].toFixed(0):"-")+'</td></tr>';
  }).join("");
  const tableHTML='<div class="samples-table"><table><thead><tr><th>引擎</th><th>IOPS</th><th>带宽 MiB/s</th><th>平均延迟µs</th><th>最小µs</th><th>最大µs</th><th>标准差</th><th>CPU 用户</th><th>P99</th><th>P99.9</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
  
  document.getElementById("content").innerHTML='<div class="metrics-grid">'+metricsHTML+'</div>'+chartsHTML+tableHTML;
  drawAllCharts(env);
}

function nativeBars(id, labels, values, colors, suffix){
  const canvas=document.getElementById(id);
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const width=Math.max(240, canvas.clientWidth||600), height=Math.max(180, canvas.clientHeight||260);
  canvas.width=width*dpr;canvas.height=height*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,width,height);
  const left=42,right=12,top=18,bottom=42;
  const plotW=width-left-right,plotH=height-top-bottom;
  const nums=values.map(v=>Number.isFinite(Number(v))?Number(v):0);
  const max=Math.max(...nums,1);
  ctx.strokeStyle="rgba(255,255,255,.16)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,top+plotH);ctx.lineTo(width-right,top+plotH);ctx.stroke();
  ctx.font="10px sans-serif";ctx.textAlign="right";ctx.fillStyle="#9ca3af";
  ctx.fillText(String(Math.round(max)),left-6,top+4);ctx.fillText("0",left-6,top+plotH+4);
  const step=plotW/Math.max(nums.length,1),barW=Math.max(18,step*.58);
  nums.forEach((v,i)=>{
    const bh=(v/max)*plotH,x=left+i*step+(step-barW)/2,y=top+plotH-bh;
    ctx.fillStyle=colors[i]||"#00d4ff";ctx.globalAlpha=.82;ctx.fillRect(x,y,barW,bh);ctx.globalAlpha=1;
    ctx.textAlign="center";ctx.fillStyle="#e4e6eb";ctx.fillText(String(v)+(suffix||""),x+barW/2,Math.max(top+11,y-5));
    ctx.fillStyle="#9ca3af";ctx.fillText(String(labels[i]).slice(0,12),x+barW/2,height-16);
  });
}

function drawFallbackCharts(env){
  const labels=env.map(s=>s.engine_name), colors=env.map(s=>COLORS[s.engine]||"#00d4ff");
  nativeBars("iopsChart",labels,env.map(s=>s.iops),colors,"");
  nativeBars("bwChart",labels,env.map(s=>s.bw_mib),colors,"");
  nativeBars("latChart",labels,env.map(s=>s.lat_us||0),colors,"");
  nativeBars("radarChart",["IOPS","带宽","低延迟","稳定性","低CPU"],[
    Math.round(env.reduce((a,s)=>a+s.iops,0)/Math.max(env.length,1)),
    Math.round(env.reduce((a,s)=>a+s.bw_mib,0)/Math.max(env.length,1)),
    Math.round(100-Math.min(100,env.reduce((a,s)=>a+(s.lat_us||0),0)/Math.max(env.length,1))),
    Math.round(100-Math.min(100,env.reduce((a,s)=>a+(s.lat_stdev||0),0)/Math.max(env.length,1))),
    Math.round(100-Math.min(100,env.reduce((a,s)=>a+((s.cpu&&s.cpu.usr)||0),0)/Math.max(env.length,1)))
  ],["#00d4ff","#7b2ff7","#4cd964","#ff9f0a","#f72585"],"");
  const first=env[0]||{};
  const pctLabels=["1","5","10","20","30","40","50","60","70","80","90","95","99","99.5","99.9","99.95","99.99"];
  nativeBars("pctChart",pctLabels,pctLabels.map(p=>parseFloat(first.pct&&first.pct[p])||0),pctLabels.map(()=>"#00d4ff"),"");
  const buckets=Object.keys(first.lat_dist||{});
  nativeBars("latDistChart",buckets,buckets.map(k=>first.lat_dist[k]||0),buckets.map(()=>"#f72585"),"");
  nativeBars("cpuChart",labels,env.map(s=>(s.cpu&&s.cpu.usr)||0),colors,"%");
  const depths=Object.keys(first.io_depths||{});
  nativeBars("depthChart",depths,depths.map(k=>first.io_depths[k]||0),depths.map(()=>"#7b2ff7"),"%");
  nativeBars("latStatsChart",labels,env.map(s=>s.lat_us||0),colors,"");
  nativeBars("stabilityChart",labels,env.map(s=>(s.iops_stat&&s.iops_stat.stdev)||0),colors,"");
}

function drawAllCharts(env){
  if(!chartsAvailable){drawFallbackCharts(env);return;}
  const labels=env.map(s=>s.engine_name);
  const bgs=env.map(s=>COLOR_SOFT[s.engine]);
  const borders=env.map(s=>COLORS[s.engine]);
  
  // 柱状图通用配置
  const barOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(255,255,255,0.05)"}}}};
  
  draw("iopsChart","bar",{labels,datasets:[{data:env.map(s=>s.iops),backgroundColor:bgs,borderColor:borders,borderWidth:2,borderRadius:8}]},barOpts);
  draw("bwChart","bar",{labels,datasets:[{data:env.map(s=>s.bw_mib),backgroundColor:bgs,borderColor:borders,borderWidth:2,borderRadius:8}]},barOpts);
  draw("latChart","bar",{labels,datasets:[{data:env.map(s=>s.lat_us),backgroundColor:bgs,borderColor:borders,borderWidth:2,borderRadius:8}]},barOpts);
  
  // 雷达图: 5维 (归一化到 0-100)
  const maxIops=Math.max(...env.map(s=>s.iops))||1;
  const maxBw=Math.max(...env.map(s=>s.bw_mib))||1;
  const maxLat=Math.max(...env.map(s=>s.lat_us||0))||1;
  const maxStdev=Math.max(...env.map(s=>s.lat_stdev||0))||1;
  const maxCpu=Math.max(...env.map(s=>(s.cpu&&s.cpu.usr)||0))||1;
  const radarDatasets=env.map(s=>({
    label:s.engine_name,
    data:[
      Math.round(s.iops/maxIops*100),
      Math.round(s.bw_mib/maxBw*100),
      Math.round(100-(s.lat_us||0)/maxLat*100), // 延迟越低越好
      Math.round(100-(s.lat_stdev||0)/maxStdev*100), // 标准差越低越稳
      Math.round(100-(s.cpu&&s.cpu.usr||0)/maxCpu*100) // CPU 越低越好
    ],
    backgroundColor:COLOR_SOFT[s.engine],
    borderColor:COLORS[s.engine],
    borderWidth:2,
    pointBackgroundColor:COLORS[s.engine],
    pointRadius:4
  }));
  draw("radarChart","radar",{labels:["IOPS","带宽","低延迟","稳定性","低CPU"],datasets:radarDatasets},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"bottom",labels:{padding:12,usePointStyle:true}}},
    scales:{r:{min:0,max:100,grid:{color:"rgba(255,255,255,0.1)"},angleLines:{color:"rgba(255,255,255,0.1)"},pointLabels:{color:"#e4e6eb",font:{size:11}},ticks:{display:false}}}
  });
  
  // 长尾百分位曲线
  const pctLabels=["1","5","10","20","30","40","50","60","70","80","90","95","99","99.5","99.9","99.95","99.99"];
  const pctDatasets=env.map(s=>({
    label:s.engine_name,
    data:pctLabels.map(p=>parseFloat(s.pct[p])||null),
    borderColor:COLORS[s.engine],
    backgroundColor:COLOR_SOFT[s.engine],
    borderWidth:2.5,pointRadius:3,pointHoverRadius:6,tension:0.3,spanGaps:true
  }));
  draw("pctChart","line",{labels:pctLabels,datasets:pctDatasets},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"top",labels:{padding:10,usePointStyle:true,boxWidth:8}}},
    scales:{x:{grid:{color:"rgba(255,255,255,0.05)"},title:{display:true,text:"百分位"}},y:{type:"logarithmic",grid:{color:"rgba(255,255,255,0.05)"},title:{display:true,text:"延迟 µs"}}}
  });
  
  // 延迟区间分布(堆叠柱状)
  const allBuckets=new Set();
  env.forEach(s=>Object.keys(s.lat_dist||{}).forEach(k=>allBuckets.add(k)));
  const sortedBuckets=[...allBuckets].sort((a,b)=>{
    const pa=parseInt(a),pb=parseInt(b);
    const ua=a.includes("msec")?1000:1,ub=b.includes("msec")?1000:1;
    return pa*ua-pb*ub;
  });
  const distDatasets=env.map(s=>({
    label:s.engine_name,
    data:sortedBuckets.map(b=>s.lat_dist[b]||0),
    backgroundColor:COLOR_SOFT[s.engine],
    borderColor:COLORS[s.engine],
    borderWidth:2,borderRadius:4
  }));
  draw("latDistChart","bar",{labels:sortedBuckets,datasets:distDatasets},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"top",labels:{padding:8,usePointStyle:true,boxWidth:8}}},
    scales:{x:{grid:{display:false},title:{display:true,text:"延迟区间"}},y:{beginAtZero:true,max:100,grid:{color:"rgba(255,255,255,0.05)"},title:{display:true,text:"占比 %"}}}
  });
  
  // CPU 占用 (堆叠)
  draw("cpuChart","bar",{labels,datasets:[
    {label:"用户",data:env.map(s=>(s.cpu&&s.cpu.usr)||0),backgroundColor:"rgba(0,212,255,0.7)",stack:"cpu"},
    {label:"系统",data:env.map(s=>(s.cpu&&s.cpu.sys)||0),backgroundColor:"rgba(255,159,10,0.7)",stack:"cpu"},
    {label:"空闲",data:env.map(s=>(s.cpu&&s.cpu.idle)||0),backgroundColor:"rgba(76,217,100,0.3)",stack:"cpu"}
  ]},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"bottom",labels:{padding:6,boxWidth:10,font:{size:9}}}},
    scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,max:100,grid:{color:"rgba(255,255,255,0.05)"}}}
  });
  
  // IO 深度 (前两个引擎)
  const firstEngine=env[0];
  if(firstEngine && firstEngine.io_depths){
    const depths=Object.entries(firstEngine.io_depths).filter(([k,v])=>v>0);
    draw("depthChart","doughnut",{
      labels:depths.map(([k])=>"d="+k),
      datasets:[{data:depths.map(([,v])=>v),backgroundColor:["#00d4ff","#7b2ff7","#f72585","#ff9f0a","#4cd964","#ff453a","#64c8ff"],borderColor:"rgba(255,255,255,0.1)",borderWidth:2}]
    },{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"right",labels:{padding:6,font:{size:9},boxWidth:10}}}
    });
  }
  
  // 延迟统计 min/avg/max (对数)
  draw("latStatsChart","bar",{labels,datasets:[
    {label:"Min",data:env.map(s=>s.lat_min||0),backgroundColor:"rgba(76,217,100,0.6)",borderRadius:4},
    {label:"Avg",data:env.map(s=>s.lat_us||0),backgroundColor:"rgba(0,212,255,0.6)",borderRadius:4},
    {label:"Max",data:env.map(s=>s.lat_max||0),backgroundColor:"rgba(255,69,58,0.6)",borderRadius:4}
  ]},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"top",labels:{padding:8,usePointStyle:true,boxWidth:8}}},
    scales:{x:{grid:{display:false}},y:{type:"logarithmic",grid:{color:"rgba(255,255,255,0.05)"}}}
  });
  
  // 稳定性: IOPS 标准差
  draw("stabilityChart","bar",{labels,datasets:[
    {label:"IOPS 标准差",data:env.map(s=>(s.iops_stat&&s.iops_stat.stdev)||0),backgroundColor:bgs,borderColor:borders,borderWidth:2,borderRadius:8}
  ]},{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(255,255,255,0.05)"}}}
  });
}

function draw(id,type,data,options){
  const el=document.getElementById(id);
  if(!el)return;
  const ctx=el.getContext("2d");
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart(ctx,{type,data,options});
}

function selectEnv(e){state.env=e;render();}

async function refreshEngineCatalog(){
  try{
    const result=await (await fetch('/api/engines')).json();
    for(const engine of result.engines||[]){
      const button=document.querySelector('#engineGroup .btn[data-val="'+engine.key+'"]');
      if(!button)continue;
      button.disabled=!engine.runnable;
      button.title=engine.reason||engine.mode||'';
      if(engine.key==='mdraid'&&engine.runnable)button.textContent='mdraid（隔离虚拟盘）';
    }
  }catch(e){
    document.querySelectorAll('#engineGroup .btn').forEach(button=>{button.disabled=true;button.title='无法读取引擎安全门禁';});
  }
}

document.getElementById("runBtn").onclick=async()=>{
  if(!state.engine){alert("请先选择引擎");return;}
  const res=await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({engine:state.engine,rw:state.rw,bs:state.bs,qd:state.qd,rt:state.rt})});
  const d=await res.json();
  if(!d.ok)alert("错误: "+d.err);
};

["engineGroup","rwGroup","bsGroup","qdGroup","rtGroup"].forEach(gid=>{
  const group=document.getElementById(gid);
  const key=gid.replace("Group","");
  group.querySelectorAll(".btn").forEach(btn=>{
    btn.onclick=()=>{
      group.querySelectorAll(".btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const v=btn.getAttribute("data-val");
      state[key]=(key==="qd"||key==="rt")?parseInt(v):v;
    };
  });
});

connect();
refreshEngineCatalog();
</script>
</body></html>"""

@app.get("/")
async def index():
    return HTMLResponse(HTML)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=WEB_PORT)
