"""
启动: cd frontend && python server.py
可选环境变量: PORT, EDGE_URL, CLOUD_URL, EDGE_NUM_FRAMES, CLOUD_NUM_FRAMES
"""
import os
import sys
import json
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "python" / "src"))

from frame_extractor import VideoFrameExtractor  # noqa: E402
from coordinator import CloudEdgeCoordinator     # noqa: E402

VIDEO_DIR = REPO_ROOT / "data" / "ssv2_videos" / "20bn-something-something-v2"
EDGE_URL  = os.environ.get("EDGE_URL",  "http://10.166.33.43:8002/v1/chat/completions")
CLOUD_URL = os.environ.get("CLOUD_URL", "http://localhost:8003/v1/chat/completions")

app = FastAPI(title="视频理解协作系统")

_ext = VideoFrameExtractor(
    fast_num_frames     = int(os.environ.get("EDGE_NUM_FRAMES",      "4")),
    motion_num_frames   = int(os.environ.get("EDGE_MOTION_FRAMES",   "4")),
    resample_num_frames = int(os.environ.get("EDGE_RESAMPLE_FRAMES", "6")),
    full_num_frames     = int(os.environ.get("CLOUD_NUM_FRAMES",     "8")),
    edge_max_side       = int(os.environ.get("EDGE_MAX_SIDE",        "448")),
    cloud_max_side      = int(os.environ.get("CLOUD_MAX_SIDE",       "672")),
)
_coord = CloudEdgeCoordinator(edge_url=EDGE_URL, cloud_url=CLOUD_URL)


class AnalyzeRequest(BaseModel):
    video: str
    prompt: str


class ChatRequest(BaseModel):
    prompt: str


@app.get("/")
def index():
    return HTMLResponse((Path(__file__).parent / "index.html").read_text("utf-8"))


SIMULATED_VIDEO = "100010.webm"


@app.get("/videos")
def list_videos():
    real = sorted(p.name for p in VIDEO_DIR.glob("*.webm"))[:10] if VIDEO_DIR.exists() else []
    if SIMULATED_VIDEO not in real:
        real = [SIMULATED_VIDEO] + real
    return JSONResponse({"videos": real})


def _ev(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _simulate_stream():
    """仿真路径：100010.webm 固定结果，不调用真实模型。"""
    # 抽帧阶段
    yield _ev({"type": "stage_start", "stage": "extract"})
    time.sleep(0.35)
    yield _ev({"type": "stage_done", "stage": "extract",
               "latency": 0.35, "frames": 8, "difficulty": 0.412})

    # 任务评估阶段（~2s）
    yield _ev({"type": "stage_start", "stage": "assess"})
    time.sleep(2.05)
    yield _ev({"type": "stage_done", "stage": "assess",
               "latency": 2.05, "action": "stay_edge",
               "score": 0.873, "edge_answer": "手拿起指甲油瓶"})

    # 网络路由阶段（~1s）
    yield _ev({"type": "stage_start", "stage": "route"})
    time.sleep(1.02)
    yield _ev({"type": "stage_done", "stage": "route",
               "latency": 1.02, "path": "stay_edge_verified", "source": "Edge (Jetson-06)"})

    yield _ev({
        "type": "result",
        "answer": "手拿起指甲油瓶",
        "source": "Edge (Jetson-06)",
        "route_path": "stay_edge_verified",
        "latencies": {"extract": 0.35, "assess": 2.05, "route": 1.02, "total": 3.42},
    })


def _analyze_stream(video_name: str, prompt: str):
    video_path = str(VIDEO_DIR / video_name)

    # ── Stage 1: 抽帧 ────────────────────────────────────────────
    yield _ev({"type": "stage_start", "stage": "extract"})
    t0 = time.time()
    try:
        stats    = _ext.compute_video_complexity(video_path)
        u_frames = _ext.extract_fast_as_base64(video_path)
        m_frames = _ext.extract_motion_as_base64(video_path)
    except Exception as e:
        yield _ev({"type": "error", "message": f"抽帧失败: {e}"}); return
    extract_lat = round(time.time() - t0, 2)
    yield _ev({
        "type": "stage_done", "stage": "extract",
        "latency": extract_lat,
        "frames": len(u_frames) + len(m_frames),
        "difficulty": round(stats.get("difficulty_score", 0), 3),
    })

    # ── Stage 2: 任务评估 ─────────────────────────────────────────
    yield _ev({"type": "stage_start", "stage": "assess"})
    t1 = time.time()
    u_res  = _coord._run_edge_pass(u_frames, prompt, "uniform_4")
    m_res  = _coord._run_edge_pass(m_frames, prompt, "motion_4")
    u_dec  = _coord._safe_parse_decision(u_res, "均匀首判失败")
    m_dec  = _coord._safe_parse_decision(m_res, "运动首判失败")
    route  = _coord.router.decide(u_dec, m_dec, stats)
    pref   = _coord.router.pick_preferred_decision(u_dec, m_dec)
    assess_lat = round(time.time() - t1, 2)
    yield _ev({
        "type": "stage_done", "stage": "assess",
        "latency": assess_lat,
        "action": route.action,
        "score": round(route.score, 3),
        "edge_answer": pref.answer,
    })

    # ── Stage 3: 网络路由 ─────────────────────────────────────────
    yield _ev({"type": "stage_start", "stage": "route"})
    t2     = time.time()
    action = route.action
    answer = ""
    source = ""
    rpath  = ""

    if action == "stay_edge":
        vfy     = _coord._run_edge_verification_pass(m_frames, prompt, pref)
        vfy_dec = _coord.router.parse_verification_output(vfy["text"] if vfy["ok"] else "")
        if not _coord._should_downgrade_edge_acceptance(vfy, vfy_dec):
            answer, source, rpath = pref.answer, "Edge (Jetson-06)", "stay_edge_verified"
        else:
            action = "local_resample"

    if action == "local_resample":
        try:
            r_frames = _ext.extract_resample_as_base64(video_path)
            r_res    = _coord._run_edge_pass(r_frames, prompt, "resample_6")
            r_dec    = _coord._safe_parse_decision(r_res, "补看失败")
            r_route  = _coord.router.decide_after_resample(pref, r_dec, stats, route.consistency)
            if r_route.action == "stay_edge":
                answer = _coord.router.pick_preferred_decision(pref, r_dec).answer
                source, rpath = "Edge (Jetson-06)", "local_resample_then_edge"
            else:
                action, rpath = "send_cloud", "local_resample_then_cloud"
        except Exception:
            action, rpath = "send_cloud", "local_resample_then_cloud"

    if action == "send_cloud" or not answer:
        try:
            f_frames = _ext.extract_full_as_base64(video_path)
            c_res    = _coord._run_cloud_refine_pass(f_frames, prompt, [u_dec, m_dec], route.reason)
            if c_res["ok"]:
                answer, source = c_res["text"], "Cloud (P3-02)"
                rpath = rpath or "direct_cloud"
            else:
                answer, source = pref.answer, "Edge (fallback)"
                rpath = rpath or "cloud_failed"
        except Exception:
            answer, source = pref.answer, "Edge (fallback)"
            rpath = rpath or "cloud_failed"

    route_lat = round(time.time() - t2, 2)
    yield _ev({"type": "stage_done", "stage": "route", "latency": route_lat, "path": rpath, "source": source})
    yield _ev({
        "type": "result",
        "answer": answer,
        "source": source,
        "route_path": rpath,
        "latencies": {
            "extract": extract_lat,
            "assess": assess_lat,
            "route": route_lat,
            "total": round(extract_lat + assess_lat + route_lat, 2),
        },
    })


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    stream = _simulate_stream() if req.video == SIMULATED_VIDEO else _analyze_stream(req.video, req.prompt)
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat")
def chat(req: ChatRequest):
    import requests as rq
    try:
        resp = rq.post(
            CLOUD_URL,
            json={
                "model": "/model",
                "messages": [{"role": "user", "content": req.prompt}],
                "temperature": 0.7,
                "max_tokens": 512,
            },
            timeout=60,
        )
        resp.raise_for_status()
        return JSONResponse({"ok": True, "answer": resp.json()["choices"][0]["message"]["content"].strip()})
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
