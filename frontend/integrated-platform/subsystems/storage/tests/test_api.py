"""Synthetic fixtures only; these tests never execute ssh or touch a device."""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/system-3/src/api/server'))
test_results = tempfile.TemporaryDirectory(prefix='system3-tests-')
os.environ['RESULTS_DIR'] = test_results.name
os.environ['BENCH_ENABLE_RUN'] = '0'
import app

FIO = '''write: IOPS=16.0k, BW=1000MiB/s
    clat (usec): min=1, max=90, avg=10.5, stdev=2.0
    clat percentiles (usec):
     | 99.00th=[ 42], 99.90th=[ 60]
    cpu : usr=2.0%, sys=3.0%, ctx=42
    IO depths : 1=1.0%, 32=99.0%
'''


class ParserTests(unittest.TestCase):
    def test_summary_units_and_percentiles(self):
        sample = app.build_sample('scalaafa', 'write', '64k', 32, 5, app.parse_text(FIO))
        self.assertEqual(sample['iops'], 16000)
        self.assertEqual(sample['bw_mib'], 1000)
        self.assertEqual(sample['lat_us'], 10.5)
        self.assertEqual(sample['pct']['99.0'], 42)
        self.assertEqual(sample['cpu']['idle'], 95)

    def test_missing_metrics_fail(self):
        with self.assertRaisesRegex(RuntimeError, 'no IOPS'):
            app.parse_text('ERROR: no device')

    def test_unit_conversion(self):
        self.assertEqual(app._to_usec(1000, 'nsec'), 1)
        self.assertEqual(app._to_usec(2, 'msec'), 2000)
        self.assertEqual(app._to_kib_s(1, 'GiB/s'), 1048576)


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app.run_task = None
        app.run_lock = asyncio.Lock()

    async def test_health_is_liveness_only(self):
        result = await app.health()
        self.assertTrue(result['ok'])
        self.assertFalse(result['run_enabled'])

    async def test_disabled_run_never_schedules(self):
        with patch.object(app, 'execute', new_callable=AsyncMock) as execute:
            result = await app.run(app.RunRequest(engine='scalaafa'))
            self.assertFalse(result['ok'])
            execute.assert_not_called()

    async def test_raid5f_restriction(self):
        result = await app.run(app.RunRequest(engine='raid5f', bs='64k'))
        self.assertIn('256k', result['err'])

    async def test_shell_injection_rejected(self):
        for change in [{'engine': 'scalaafa;id'}, {'rw': 'write;id'}, {'bs': '64k;id'}]:
            result = await app.run(app.RunRequest(**{'engine': 'scalaafa', **change}))
            self.assertFalse(result['ok'])

    async def test_concurrent_requests_do_not_queue(self):
        with patch.object(app, 'run_enabled', True), patch.object(app, 'execute', new_callable=AsyncMock) as execute:
            request = app.RunRequest(engine='scalaafa')
            first = await app.run(request)
            second = await app.run(request)
            self.assertTrue(first['ok'])
            self.assertFalse(second['ok'])
            await app.run_task
            execute.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
