import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest

from io_guard import HeartbeatMonitor, read_json, retry_fs


class SharedHeartbeatTests(unittest.TestCase):
    def test_real_sharing_conflict_retries_after_release(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'heartbeat.json'
            file.write_text('{"updatedMs":1000}', encoding='utf-8')
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                           wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
            kernel.CreateFileW.restype = wintypes.HANDLE
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            handle = kernel.CreateFileW(str(file), 0x80000000, 0, None, 3, 0x80, None)
            self.assertNotEqual(handle, wintypes.HANDLE(-1).value)
            release = threading.Timer(.12, lambda: kernel.CloseHandle(handle))
            release.start()
            try:
                self.assertEqual(read_json(file, timeout=1), {'updatedMs': 1000})
            finally:
                release.join()

    def test_concurrent_atomic_replacements_do_not_escape_monitor(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'heartbeat.json'
            file.write_text('{"updatedMs":1000}', encoding='utf-8')
            errors = []

            def writer():
                try:
                    for i in range(150):
                        pending = file.with_suffix('.pending')
                        pending.write_text(json.dumps({'updatedMs': 1000 + i}), encoding='utf-8')
                        retry_fs(lambda: os.replace(pending, file))
                except BaseException as error:
                    errors.append(error)

            thread = threading.Thread(target=writer)
            thread.start()
            monitor = HeartbeatMonitor(1)
            while thread.is_alive():
                monitor.poll(file, 10)
            thread.join()
            self.assertFalse(errors)
            self.assertEqual(read_json(file)['updatedMs'], 1149)

    def test_missing_and_invalid_heartbeats_keep_last_good_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'heartbeat.json'
            monitor = HeartbeatMonitor(100)
            self.assertEqual(monitor.poll(file, 110), 100)
            file.write_text('{"updatedMs":115000}', encoding='utf-8')
            self.assertEqual(monitor.poll(file, 120), 115)
            file.write_text('损坏的数据', encoding='utf-8')
            self.assertEqual(monitor.poll(file, 400), 115)
            self.assertGreater(400 - monitor.last, 180)
            self.assertEqual(monitor.read_failures, 2)

    def test_permanent_errors_are_bounded_and_disk_full_is_not_retried(self):
        started = time.monotonic()
        with self.assertRaises(PermissionError):
            retry_fs(lambda: (_ for _ in ()).throw(PermissionError('持续拒绝访问')), timeout=.05)
        self.assertLess(time.monotonic() - started, .3)
        calls = []

        def full():
            calls.append(1)
            raise OSError(28, '磁盘空间不足')

        with self.assertRaises(OSError):
            retry_fs(full)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
