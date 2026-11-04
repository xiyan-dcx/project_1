"""Static UI route tests; these do not call the production API."""
import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/system-3/deploy'))
import ui_server


class VueHistoryFallbackTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory(prefix='system3-ui-')
        self.dist = Path(self.tempdir.name).resolve()
        (self.dist / 'assets').mkdir()
        (self.dist / 'index.html').write_text('<div id="app"></div>', encoding='utf-8')
        (self.dist / 'assets' / 'app.js').write_text('bundle', encoding='utf-8')

    def tearDown(self):
        self.tempdir.cleanup()

    def request(self, path):
        with patch.object(ui_server, 'DIST_DIR', self.dist):
            return asyncio.run(ui_server.vue_app(path))

    def test_root_and_vue_deep_links_return_index(self):
        for path in ('', 'comparison', 'benchmark'):
            with self.subTest(path=path):
                response = self.request(path)
                self.assertEqual(Path(response.path), self.dist / 'index.html')

    def test_existing_asset_is_served(self):
        response = self.request('assets/app.js')
        self.assertEqual(Path(response.path), self.dist / 'assets' / 'app.js')

    def test_path_traversal_is_rejected(self):
        response = self.request('../outside.js')
        self.assertEqual(response.status_code, 400)

    def test_missing_asset_does_not_fall_back_to_html(self):
        response = self.request('assets/missing.js')
        self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()
