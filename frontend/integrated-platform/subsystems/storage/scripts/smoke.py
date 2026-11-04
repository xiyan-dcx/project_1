"""Check local API + Vite proxy without enabling SSH or real benchmarks."""
import asyncio
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from websockets.asyncio.client import connect


def request(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=5) as response:
        return json.load(response)


async def check():
    payload = {"engine": "scalaafa", "rw": "write", "bs": "64k", "qd": 32, "rt": 5}
    for base, ws in [
        ("http://127.0.0.1:8000", "ws://127.0.0.1:8000/ws"),
        ("http://127.0.0.1:5173/system-3", "ws://127.0.0.1:5173/system-3/ws"),
    ]:
        health = request(base + "/api/health")
        assert health["ok"] and health["run_enabled"] is False, "STOP: not a safe preview backend"
        assert len(request(base + "/api/engines")["engines"]) == 3
        state = request(base + "/api/state")
        assert state["type"] == "state"
        disabled = request(base + "/api/run", payload)
        assert disabled["ok"] is False and "disabled" in disabled["err"]
        invalid = request(base + "/api/run", {**payload, "engine": "raid5f"})
        assert invalid["ok"] is False and "256k" in invalid["err"]
        try:
            request(base + "/api/run", {**payload, "qd": 0})
        except HTTPError as error:
            assert error.code == 422
        else:
            raise AssertionError("invalid queue depth was accepted")
        async with connect(ws, open_timeout=5) as socket:
            message = json.loads(await asyncio.wait_for(socket.recv(), timeout=5))
            assert message["type"] == "state"
            assert message["samples"] == state["samples"]
        print(f"PASS: health, engines, state, disabled run, validation, WebSocket: {base}")
    with urlopen("http://127.0.0.1:5173/system-3/", timeout=5) as response:
        assert b'id="app"' in response.read()
    print("PASS: frontend HTML reachable (not a browser visual test)")


if __name__ == "__main__":
    asyncio.run(check())
