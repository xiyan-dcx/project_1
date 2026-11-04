"""Serve Vue and proxy to the existing dashboard-caas Service.

No benchmark implementation or credentials live here. This offline-compatible
container is used because the server cannot currently pull an Nginx base image.
"""

import asyncio
from contextlib import suppress
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request as URLRequest, build_opener, HTTPRedirectHandler

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import FileResponse, RedirectResponse, Response
from websockets.asyncio.client import connect


API_ORIGIN = "http://dashboard-caas:8000"
WS_ORIGIN = "ws://dashboard-caas:8000/ws"
DIST_DIR = Path("/app/dist").resolve()
app = FastAPI(title="ScalaAFA Vue dashboard UI")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def forward(method: str, path: str, body: bytes, content_type: str) -> tuple[int, bytes, str]:
    request = URLRequest(
        f"{API_ORIGIN}/api/{path}",
        data=body if method == "POST" else None,
        method=method,
        headers={"Content-Type": content_type or "application/json"},
    )
    try:
        with build_opener(NoRedirect).open(request, timeout=30) as upstream:
            return upstream.status, upstream.read(8 * 1024 * 1024), upstream.headers.get("Content-Type", "application/json")
    except HTTPError as error:
        return error.code, error.read(8 * 1024 * 1024), error.headers.get("Content-Type", "application/json")


@app.get("/")
async def root():
    return RedirectResponse("/system-3/", status_code=302)


@app.api_route("/system-3/api/{path:path}", methods=["GET", "POST"])
async def api_proxy(path: str, request: Request):
    if not path or ".." in path.split("/"):
        return Response(status_code=400)
    body = await request.body()
    if len(body) > 1024 * 1024:
        return Response(status_code=413)
    try:
        status, payload, media_type = await asyncio.to_thread(
            forward, request.method, path, body, request.headers.get("content-type", "application/json")
        )
    except Exception:
        return Response(content='{"ok":false,"error":"upstream unavailable"}', status_code=502, media_type="application/json")
    return Response(content=payload, status_code=status, media_type=media_type)


@app.websocket("/system-3/ws")
async def ws_proxy(browser: WebSocket):
    await browser.accept()
    try:
        async with connect(WS_ORIGIN, open_timeout=5, max_size=4 * 1024 * 1024) as upstream:
            async def to_browser():
                async for message in upstream:
                    await browser.send_text(message if isinstance(message, str) else message.decode())

            async def to_upstream():
                while True:
                    await upstream.send(await browser.receive_text())

            tasks = [asyncio.create_task(to_browser()), asyncio.create_task(to_upstream())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                with suppress(Exception):
                    await task
    except Exception:
        with suppress(Exception):
            await browser.close()


@app.get("/system-3/{path:path}")
async def vue_app(path: str = ""):
    """Serve built assets and fall back to index.html for Vue Router deep links."""
    candidate = (DIST_DIR / path).resolve()
    if candidate != DIST_DIR and not candidate.is_relative_to(DIST_DIR):
        return Response(status_code=400)
    if candidate.is_file():
        return FileResponse(candidate)
    if candidate == DIST_DIR or not Path(path).suffix:
        return FileResponse(DIST_DIR / "index.html")
    return Response(status_code=404)
