"""二次过滤只核验状态摘要清单和候选身份的边界回归。"""

import gzip
import hashlib
import json
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

from filter_prefix import load_hashes


HUMAN = Path(__file__).resolve().parent


class FilterTest(unittest.TestCase):
    def test_plain_numeric_hash_and_explicit_jsonl_fields(self):
        first, second = '1' * 64, 'a' * 64
        self.assertEqual(load_hashes((first + '\n').encode()), {first})
        data = (json.dumps({'canonicalBeforeHash': first, 'sourceStateHash': second}) + '\n').encode()
        self.assertEqual(load_hashes(gzip.compress(data)), {first, second})
        with self.assertRaises(ValueError):
            load_hashes(json.dumps({'sha256': first}).encode())

    def test_both_hash_kinds_filtered_and_bad_identity_rejected(self):
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        root = HUMAN / 'checks' / ('filter-fixture-' + stamp)
        root.mkdir(parents=True)
        h1, h2, h3, h4 = ('1' * 64, '2' * 64, '3' * 64, '4' * 64)
        excluded = root / 'excluded.txt.gz'
        excluded.write_bytes(gzip.compress((h1 + '\n' + h2 + '\n').encode(), mtime=0))
        rows = [{'canonicalBeforeHash': h1, 'sourceStateHash': h3, 'humanController': True},
                {'canonicalBeforeHash': h3, 'sourceStateHash': h2, 'humanController': False},
                {'canonicalBeforeHash': h3, 'sourceStateHash': h4, 'humanController': True}]
        candidate = root / 'candidates.jsonl.gz'
        candidate.write_bytes(gzip.compress(('\n'.join(json.dumps(row) for row in rows) + '\n').encode(), mtime=0))
        sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
        manifest = root / 'manifest.json'
        manifest.write_text(json.dumps({'candidateRows': {'path': str(candidate), 'sha256': sha(candidate), 'count': 3}}), encoding='utf-8')
        splits = root / 'DATA_SPLITS_FIXTURE.json'
        value = {'fixtureOnly': True, 'exclusionIndexes': [{'path': str(excluded), 'sha256': sha(excluded)}]}
        splits.write_text(json.dumps(value), encoding='utf-8')
        command = [sys.executable, str(HUMAN / 'filter_prefix.py'), '--data-splits', str(splits),
                   '--candidates-manifest', str(manifest), '--output', str(root / 'valid-result')]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads((root / 'valid-result' / 'result.json').read_text(encoding='utf-8'))
        self.assertEqual(receipt['admittedPolicyActions'], 1)
        self.assertEqual(receipt['excludedPolicyActions'], 2)
        self.assertFalse(receipt['valueMask'])
        value['exclusionIndexes'][0]['sha256'] = '0' * 64
        splits.write_text(json.dumps(value), encoding='utf-8')
        bad = subprocess.run(command[:-1] + [str(root / 'bad-result')], capture_output=True, text=True)
        self.assertNotEqual(bad.returncode, 0)
        self.assertFalse((root / 'bad-result').exists())


if __name__ == '__main__':
    unittest.main()
