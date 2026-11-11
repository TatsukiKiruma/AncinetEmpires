"""标准归档恢复入口的离线路径、摘要和归档边界回归。"""
import hashlib
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from install_from_archive import DATA_ROOTS, inspect_archive, parse_available_bytes, parse_hashes, restore_arguments, safe_data_path


class ArchiveInstallTest(unittest.TestCase):
    def test_scope_and_hash_manifest_rejects_escape_or_duplicate(self):
        name = DATA_ROOTS[0] + "/files/原始存档"
        value = "a" * 64
        self.assertEqual(parse_hashes(value + "  " + name), {name: value})
        for path in ["/" + name, DATA_ROOTS[0] + "/../other", DATA_ROOTS[0] + "//file", "user/0/other.app/file"]:
            with self.assertRaises(ValueError):
                safe_data_path(path)
        with self.assertRaises(ValueError):
            parse_hashes((value + "  " + name + "\n") * 2)
        with self.assertRaises(ValueError):
            parse_hashes("invalid " + name)

    def test_archive_member_set_and_special_nodes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "probe.tar"
            expected = {}
            with tarfile.open(path, "w") as archive:
                for i in range(10):
                    name = DATA_ROOTS[i % 2] + "/files/存档_" + str(i)
                    data = str(i).encode()
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
                    expected[name] = hashlib.sha256(data).hexdigest()
            self.assertEqual(inspect_archive(path, expected, probe=True)["files"], 10)
            expected[next(iter(expected))] = "0" * 64
            with self.assertRaises(ValueError):
                inspect_archive(path, expected, probe=True)
            with tarfile.open(path, "w") as archive:
                info = tarfile.TarInfo(DATA_ROOTS[0] + "/files/link")
                info.type = tarfile.SYMTYPE
                info.linkname = "/data/other"
                archive.addfile(info)
            with self.assertRaises(ValueError):
                inspect_archive(path, expected)

    def test_df_space_is_exact_and_ambiguous_output_fails(self):
        self.assertEqual(parse_available_bytes("Filesystem 1K-blocks Used Available Use% Mounted\n/data 100 25 75 25% /data\n"), 75 * 1024)
        with self.assertRaises(ValueError):
            parse_available_bytes("错误")

    def test_binary_restore_uses_exec_in_without_literal_command_quotes(self):
        self.assertEqual(restore_arguments(["adb", "-s", "device"], "/data"), ["adb", "-s", "device", "exec-in", "su", "-c", "tar -xf - -C /data"])


if __name__ == "__main__":
    unittest.main()
