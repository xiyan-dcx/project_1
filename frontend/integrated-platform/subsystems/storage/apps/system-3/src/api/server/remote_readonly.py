"""Local, receive-only adapter for the existing dashboard. Never submits jobs."""
import asyncio
from contextlib import asynccontextmanager
import json
import os
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from websockets.asyncio.client import connect

ENGINES = {'scalaafa': 'ScalaAFA', 'mdraid': 'mdraid', 'raid5f': 'RAID5F'}
READ_PATHS = {'/api/health', '/api/caas/health'}


def source_urls(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}:
        raise ValueError('SYSTEM3_REMOTE_URL must be a plain http(s) origin')
    origin = url.rstrip('/')
    return origin, ('wss' if parsed.scheme == 'https' else 'ws') + '://' + parsed.netloc + '/ws'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_json(origin, path):
    if path not in READ_PATHS:
        raise ValueError('Only allowlisted health GETs are permitted')
    with build_opener(NoRedirect).open(origin + path, timeout=4) as response:
        result = json.loads(response.read(1024 * 1024))
    if not isinstance(result, dict):
        raise ValueError('Expected a health object')
    return result


def supported_sample(sample):
    return (isinstance(sample, dict) and sample.get('engine') in ENGINES
            and sample.get('rw') in {'write','read','randwrite','randread'}
            and isinstance(sample.get('bs'), str)
            and all(isinstance(sample.get(k), (int, float)) for k in ('qd','rt','iops','bw_mib')))


class Mirror:
    def __init__(self):
        self.source = ''
        self.connected = False
        self.last_message_at = None
        self.checked_at = None
        self.transport_error = '等待服务器 WebSocket 首帧'
        self.api = {'ok': False, 'error': '尚未检查'}
        self.downstream = {'ok': False, 'error': '尚未检查'}
        self.status = {'state': 'idle', 'msg': '等待远端状态'}
        self.samples = []
        self.unsupported = 0
        self.active_engine = None

    def info(self):
        return {'source': self.source, 'connected': self.connected,
                'snapshot_stale': not self.connected, 'last_message_at': self.last_message_at,
                'checked_at': self.checked_at, 'transport_error': self.transport_error,
                'api_ok': self.api.get('ok') is True,
                'downstream_ok': self.downstream.get('ok') is True,
                'api_error': self.api.get('error', ''),
                'downstream_error': self.downstream.get('error', ''),
                'unsupported_samples': self.unsupported}

    def snapshot(self):
        return {'type': 'state', 'status': self.status, 'samples': self.samples, 'remote': self.info()}

    def accept(self, message):
        kind = message.get('type')
        self.last_message_at = time.time()
        if kind == 'state':
            self.status = message.get('status', {'state':'idle','msg':''})
            incoming = message.get('samples', [])
            self.samples = [s for s in incoming if supported_sample(s)]
            self.unsupported = len(incoming) - len(self.samples)
            return self.snapshot()
        if kind == 'status':
            self.status = message['status']
            return message
        if kind == 'sample' and supported_sample(message.get('sample')):
            sample = message['sample']
            key = lambda s: tuple(s[k] for k in ('engine','rw','bs','qd','rt'))
            existing = next((i for i,s in enumerate(self.samples) if key(s) == key(sample)), None)
            if existing is None: self.samples.append(sample)
            else: self.samples[existing] = sample
            return message
        if kind == 'stream_start':
            self.active_engine = message.get('engine')
            return message if self.active_engine in ENGINES else None
        if kind == 'stream_point' and self.active_engine in ENGINES:
            return message if all(isinstance(message.get(k), (int,float)) for k in ('t','iops','bw_mib')) else None
        if kind == 'stream_end':
            supported = self.active_engine in ENGINES
            self.active_engine = None
            return message if supported else None
        return None


mirror = Mirror()
clients = set()
send_lock = asyncio.Lock()


async def broadcast(message):
    async with send_lock:
        for client in list(clients):
            try: await asyncio.wait_for(client.send_json(message), 2)
            except Exception: clients.discard(client)


async def health_loop(origin):
    while True:
        async def probe(path):
            try: return await asyncio.to_thread(read_json, origin, path)
            except Exception as error: return {'ok': False, 'error': str(error)[:300]}
        mirror.api, mirror.downstream = await asyncio.gather(probe('/api/health'), probe('/api/caas/health'))
        mirror.checked_at = time.time()
        await broadcast({'type':'remote_health', 'remote': mirror.info()})
        await asyncio.sleep(5)


async def receive_loop(ws_url):
    while True:
        try:
            # No application messages are ever sent upstream; only receive + protocol ping/pong.
            async with connect(ws_url, open_timeout=5, close_timeout=2, max_size=4*1024*1024, ping_interval=15, ping_timeout=10) as upstream:
                first = json.loads(await asyncio.wait_for(upstream.recv(), 5))
                if not isinstance(first, dict) or first.get('type') != 'state':
                    raise ValueError('Expected initial state snapshot')
                mirror.connected = True
                mirror.transport_error = ''
                await broadcast(mirror.accept(first))
                async for raw in upstream:
                    message = json.loads(raw)
                    if not isinstance(message, dict): continue
                    accepted = mirror.accept(message)
                    if accepted is not None: await broadcast(accepted)
        except Exception as error:
            mirror.transport_error = str(error)[:300]
        mirror.connected = False
        mirror.active_engine = None
        await broadcast({'type':'remote_health', 'remote': mirror.info()})
        await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app):
    origin, ws_url = source_urls(os.environ['SYSTEM3_REMOTE_URL'])
    mirror.source = origin
    tasks = [asyncio.create_task(health_loop(origin)), asyncio.create_task(receive_loop(ws_url))]
    try: yield
    finally:
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title='System 3 receive-only adapter', lifespan=lifespan)


@app.middleware('http')
async def deny_writes(request, call_next):
    if request.method not in {'GET', 'HEAD'}:
        return JSONResponse({'ok': False, 'err': '只读适配层禁止提交测试，未转发到服务器'}, status_code=403)
    return await call_next(request)


@app.get('/api/health')
async def health():
    return {'ok': True, 'driver':'remote-readonly', 'run_enabled': False,
            'state': mirror.status['state'], 'remote': mirror.info()}


@app.get('/api/state')
async def state():
    return mirror.snapshot()


@app.get('/api/engines')
async def engines():
    # Local display vocabulary only, not a claim of remotely runnable engines.
    return {'source':'local-display-contract', 'engines': [{'key': k,'name':v,'run_enabled':False} for k,v in ENGINES.items()]}


@app.websocket('/ws')
async def websocket(socket: WebSocket):
    await socket.accept()
    try:
        async with send_lock:
            await socket.send_json(mirror.snapshot())
            clients.add(socket)
        while True: await socket.receive_text()  # Discard; never forward client messages.
    except WebSocketDisconnect: pass
    finally: clients.discard(socket)
