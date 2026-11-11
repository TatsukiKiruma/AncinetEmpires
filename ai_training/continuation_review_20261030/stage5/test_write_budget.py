"""写入预算按持久预留拒绝越界，剩余空间不足时失败关闭。"""
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import write_budget as budget


class BudgetTest(unittest.TestCase):
    def test_scan_only_once(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(budget, 'ROOT', Path(folder)), patch.object(budget, 'DATABASE', Path(folder) / 'ledger.sqlite3'):
                budget.reserve(10)
                with patch.object(Path, 'rglob', side_effect=AssertionError('不应重复扫描')):
                    self.assertEqual(budget.reserve(20)['reservedBytes'], 30)

    def test_reservations_survive_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(budget, 'ROOT', Path(folder)), patch.object(budget, 'DATABASE', Path(folder) / 'ledger.sqlite3'):
                first = budget.reserve(1_500_000_000)
                self.assertEqual(first['reservedBytes'], 1_500_000_000)
                with self.assertRaises(RuntimeError):
                    budget.reserve(1_500_000_000)
                self.assertEqual(budget.reserve(0)['reservedBytes'], 1_500_000_000)

    def test_low_space_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(budget, 'ROOT', Path(folder)), patch.object(budget, 'DATABASE', Path(folder) / 'ledger.sqlite3'), patch.object(budget.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 14_999_999_999})()):
                with self.assertRaises(RuntimeError):
                    budget.reserve(1)


if __name__ == '__main__':
    unittest.main()
