import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock
from starlette.requests import Request
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/system-3/src/api/server'))
import remote_readonly as adapter

SAMPLE = {'engine':'scalaafa','rw':'read','bs':'64k','qd':1,'rt':2,'iops':100,'bw_mib':6.25}

class MirrorTests(unittest.TestCase):
    def test_url_validation(self):
        self.assertEqual(adapter.source_urls('http://localhost:30082'), ('http://localhost:30082','ws://localhost:30082/ws'))
        for url in ['file:///etc/passwd','http://host/api/run','http://u:p@host','http://host?x=1']:
            with self.assertRaises(ValueError): adapter.source_urls(url)

    def test_only_health_paths_allowed(self):
        with self.assertRaises(ValueError): adapter.read_json('http://localhost', '/api/run')

    def test_snapshot_and_unknown_engine(self):
        mirror = adapter.Mirror()
        result = mirror.accept({'type':'state','status':{'state':'idle','msg':''},'samples':[SAMPLE,{**SAMPLE,'engine':'dpp'}]})
        self.assertEqual(result['samples'], [SAMPLE])
        self.assertEqual(result['remote']['unsupported_samples'], 1)
        self.assertTrue(result['remote']['snapshot_stale'])

    def test_sample_replacement(self):
        mirror = adapter.Mirror()
        mirror.accept({'type':'sample','sample':SAMPLE})
        mirror.accept({'type':'sample','sample':{**SAMPLE,'iops':200}})
        self.assertEqual(len(mirror.samples), 1)
        self.assertEqual(mirror.samples[0]['iops'], 200)

    def test_stream_whitelist(self):
        mirror = adapter.Mirror()
        self.assertIsNone(mirror.accept({'type':'stream_start','engine':'dpp'}))
        self.assertIsNone(mirror.accept({'type':'stream_point','t':1,'iops':100,'bw_mib':1}))
        mirror.accept({'type':'stream_start','engine':'scalaafa'})
        self.assertIsNotNone(mirror.accept({'type':'stream_point','t':1,'iops':100,'bw_mib':1}))
        self.assertIsNotNone(mirror.accept({'type':'stream_end'}))

class WriteTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_writes_rejected_without_forward(self):
        for method in ['POST','PUT','PATCH','DELETE','OPTIONS']:
            request = Request({'type':'http','method':method,'path':'/api/run','headers':[]})
            forward = AsyncMock()
            response = await adapter.deny_writes(request, forward)
            self.assertEqual(response.status_code, 403)
            forward.assert_not_called()

    async def test_health_never_enables_run(self):
        result = await adapter.health()
        self.assertFalse(result['run_enabled'])
        self.assertEqual(result['driver'], 'remote-readonly')
