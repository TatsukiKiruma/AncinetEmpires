"""增量跳过必须有匹配主机、真实文件和正确摘要，防止漏下载。"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from aeii_download_history import verified_history, atomic_json


class HistoryTests(unittest.TestCase):
    def test_verified_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'good.bin').write_bytes(b'replay')
            report = {'host': 'aer.augix.me', 'downloads': [
                {'id': 'good', 'file': 'good.bin', 'sha256': hashlib.sha256(b'replay').hexdigest()},
                {'id': 'corrupt', 'file': 'good.bin', 'sha256': '0' * 64},
                {'id': 'missing', 'file': 'missing.bin', 'sha256': '0' * 64}]}
            atomic_json(root / 'download_report.json', report)
            self.assertEqual(list(verified_history([root / 'download_report.json'], 'aer.augix.me')), ['good'])
            self.assertEqual(verified_history([root / 'download_report.json'], 'other'), {})
            self.assertEqual(json.loads((root / 'download_report.json').read_text()), report)
            self.assertFalse((root / 'download_report.json.tmp').exists())

    def test_repeated_resume_keeps_verified_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'response.bin'
            source.write_bytes(b'finished')
            entry = {'id': 'parent', 'file': source.name, 'sha256': hashlib.sha256(b'finished').hexdigest()}
            report = root / 'download_report.json'
            atomic_json(report, {'host': 'game', 'downloads': [entry]})
            for _ in range(3):
                known = verified_history([report], 'game')
                self.assertIn('parent', known)
                atomic_json(report, {'host': 'game', 'downloads': [], 'skipped_verified_history': list(known.values())})
            source.write_bytes(b'corrupted')
            self.assertEqual(verified_history([report], 'game'), {})


if __name__ == '__main__':
    unittest.main()
