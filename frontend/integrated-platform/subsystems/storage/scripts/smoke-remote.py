"""Read remote state via the local adapter; POST probe stays local and must fail."""
import asyncio
import json
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from websockets.asyncio.client import connect


async def main():
    for base, ws in [('http://127.0.0.1:8001', 'ws://127.0.0.1:8001/ws'),
                     ('http://127.0.0.1:5174/system-3', 'ws://127.0.0.1:5174/system-3/ws')]:
        with urlopen(base+'/api/health', timeout=5) as response: health = json.load(response)
        assert health['driver'] == 'remote-readonly' and health['run_enabled'] is False
        with urlopen(base+'/api/state', timeout=5) as response: state = json.load(response)
        assert state['type'] == 'state'
        async with connect(ws, open_timeout=5) as socket:
            snapshot = json.loads(await asyncio.wait_for(socket.recv(), 5))
            assert snapshot['type'] == 'state'
            assert snapshot['remote']['source'] == health['remote']['source']
        try:
            # Explicitly local loopback URL; never sent to the remote benchmark endpoint.
            urlopen(Request(base+'/api/run', data=b'{}', headers={'Content-Type':'application/json'}), timeout=5)
        except HTTPError as error:
            assert error.code == 403
        else: raise AssertionError('Write request was not blocked')
        print(json.dumps({'base':base,'remote':health['remote'],'samples':len(state['samples']),'local_write_block':'PASS'}, ensure_ascii=False))


asyncio.run(main())
