"""Tests for the staged production dashboard-caas v19 source."""
import asyncio
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[1] / 'apps/system-3/deploy/dashboard-caas-v19'
test_root = tempfile.TemporaryDirectory(prefix='dashboard-caas-v19-')
root = Path(test_root.name)
(root / 'static').mkdir()
results = root / 'results'
results.mkdir()
os.environ['PLATFORM_ROOT'] = str(root)
os.environ['RESULTS_DIR'] = str(results)
os.environ['BENCH_ENABLE_RUN'] = '0'
spec = importlib.util.spec_from_file_location('dashboard_caas_v19', MODULE_DIR / 'dashboard_v1.py')
dashboard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dashboard)

FIO = '''write: IOPS=16.0k, BW=1000MiB/s
    clat (usec): min=1, max=90, avg=10.5, stdev=2.0
    clat percentiles (usec):
     | 99.00th=[ 42], 99.90th=[ 60]
    cpu : usr=2.0%, sys=3.0%, ctx=42
    IO depths : 1=1.0%, 32=99.0%
'''


class EngineContractTests(unittest.TestCase):
    def test_catalog_includes_dpp_and_explains_disabled_mdraid(self):
        payload = asyncio.run(dashboard.api_engines())
        engines = {engine['key']: engine for engine in payload['engines']}
        self.assertEqual(set(engines), {'scalaafa', 'raid5f', 'dpp', 'mdraid'})
        self.assertTrue(engines['dpp']['runnable'])
        self.assertFalse(engines['mdraid']['runnable'])
        self.assertIn('禁用', engines['mdraid']['reason'])

    def test_health_and_run_route_are_disabled_by_default(self):
        health = asyncio.run(dashboard.api_health())
        self.assertFalse(health['run_enabled'])
        response = asyncio.run(dashboard.api_run(dashboard.RunReq(engine='raid5f', bs='256k')))
        self.assertFalse(response['ok'])
        self.assertIn('默认关闭', response['err'])


class ResultHistoryTests(unittest.TestCase):
    def test_restores_only_canonical_logs_as_historical_samples(self):
        dashboard.samples.clear()
        canonical = results / 'scalaafa_write_bs64k_qd32.log'
        canonical.write_text(FIO, encoding='utf-8')
        os.utime(canonical, (1, 1))
        versioned = results / 'scalaafa_write_bs64k_qd32_0123456789abcdef0123456789abcdef.log'
        versioned.write_text(FIO.replace('IOPS=16.0k', 'IOPS=17.0k'), encoding='utf-8')
        restored = dashboard.restore_result_history()
        self.assertEqual(restored, 1)
        samples = list(dashboard.samples.values())
        self.assertEqual(len(samples), 1)
        self.assertEqual(samples[0]['engine'], 'scalaafa')
        self.assertEqual(samples[0]['iops'], 17000)
        self.assertEqual(samples[0]['rt'], 0)
        self.assertTrue(samples[0]['historical'])
        self.assertEqual(samples[0]['ts'], versioned.stat().st_mtime)


if __name__ == '__main__':
    unittest.main()
