"""完整PC备份通过后标准卸载、安装困难APK，再流式恢复原始归档并全量验收。"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import sys
import tarfile
import threading
import time

from contract import EXPECTED, file_sha256, inspect_apk, require_identity

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

PACKAGE = EXPECTED["package"]
ORIGINAL_SHA = "51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b"
ROOT = Path(__file__).resolve().parents[2] / "ai_training/hard_native_3000_20261022"
DATA_ROOTS = ("user/0/" + PACKAGE, "user_de/0/" + PACKAGE)
EXPECTED_FILES = 43993
EXPECTED_PROBE_FILES = 10
MIN_RESERVE = 2 * 1024**3
TRANSPORT = "adb-exec-in-raw-v1"


def write_json(path: Path, value) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def safe_data_path(name: str, allow_root: bool = False) -> str:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"..", "."} for part in path.parts) or "\n" in name or "\r" in name or "\x00" in name or name != str(path):
        raise ValueError("原始归档路径不规范或越界：" + repr(name))
    if not any(name.startswith(root + "/") or (allow_root and name == root) for root in DATA_ROOTS):
        raise ValueError("归档路径不属于已备份的游戏CE/DE目录：" + repr(name))
    return name


def parse_hashes(text: str, leading_dot: bool = False) -> dict[str, str]:
    result = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        pieces = line.split(None, 1)
        if len(pieces) != 2 or not re.fullmatch(r"[0-9a-fA-F]{64}", pieces[0]):
            raise ValueError("文件摘要行格式不正确")
        name = pieces[1].strip()
        if leading_dot:
            name = name.removeprefix("./")
        safe_data_path(name)
        if name in result:
            raise ValueError("文件摘要存在重复路径：" + name)
        result[name] = pieces[0].lower()
    return result


def inspect_archive(path: Path, expected: dict[str, str], probe: bool = False) -> dict:
    files = set()
    hashes = {}
    directories = set()
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            name = safe_data_path(member.name, allow_root=member.isdir())
            if member.isfile():
                if name in files or name not in expected:
                    raise ValueError("归档包含重复或未登记文件：" + name)
                files.add(name)
                if probe:
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise ValueError("关键恢复文件不可读取")
                    hashes[name] = hashlib.file_digest(stream, "sha256").hexdigest()
            elif member.isdir():
                directories.add(name)
            else:
                # 本次实际完整归档只有普通文件与目录；不恢复链接或设备节点。
                raise ValueError("拒绝归档中的链接或特殊节点：" + name)
    if probe:
        if len(files) != EXPECTED_PROBE_FILES or hashes != {name: expected[name] for name in files}:
            raise ValueError("关键恢复探针不是已验证的10个原始文件")
    elif files != set(expected) or not set(DATA_ROOTS).issubset(directories):
        raise ValueError("完整归档成员集合与43993文件清单不一致")
    return {"files": len(files), "directories": len(directories), "probeHashes": hashes}


def parse_available_bytes(text: str) -> int:
    lines = [line.split() for line in text.splitlines() if line.strip()]
    if len(lines) != 2 or len(lines[1]) < 6 or not lines[1][3].isdigit():
        raise ValueError("无法唯一读取/data可用空间")
    return int(lines[1][3]) * 1024


def restore_arguments(prefix: list[str], destination: str) -> list[str]:
    # exec-in专用输入协议已实测保留二进制；末尾整条su命令不能再包外层字面单引号。
    return [*prefix, "exec-in", "su", "-c", "tar -xf - -C " + shlex.quote(destination)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument("-h", "--help", action="help", help="显示说明，不连接设备")
    parser.add_argument("--adb", required=True, help="ADB可执行文件")
    parser.add_argument("--device", required=True, help="明确设备序列号")
    parser.add_argument("--backup", type=Path, required=True, help="完整备份目录")
    parser.add_argument("--target", type=Path, required=True, help="指定困难APK")
    parser.add_argument("--output", type=Path, required=True, help="新的安装证据目录")
    args = parser.parse_args()
    backup, output, target = args.backup.resolve(), args.output.resolve(), args.target.resolve()
    for path in (backup, output, target):
        path.relative_to(ROOT)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", output.name):
        raise ValueError("安装证据目录名不规范")
    output.mkdir(parents=True, exist_ok=False)
    events = (output / "events.jsonl").open("x", encoding="utf-8")
    prefix = [args.adb, "-s", args.device]
    stage = "verify_pc_backup"
    uninstalled = False
    installed = False
    restored = False
    archive = backup / "original-data.tar"

    def record(kind: str, **details):
        row = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "stage": stage, "kind": kind, **details}
        events.write(json.dumps(row, ensure_ascii=False) + "\n")
        events.flush()
        os.fsync(events.fileno())
        print(json.dumps({key: value[:700] if isinstance(value, str) else value for key, value in row.items()}, ensure_ascii=False), flush=True)

    def call(*parts: str, timeout: int = 120, missing: bool = False) -> str:
        result = subprocess.run([*prefix, *parts], capture_output=True, timeout=timeout)
        stdout = result.stdout.decode("utf-8", errors="strict")
        stderr = result.stderr.decode("utf-8", errors="replace")
        record("adb", arguments=list(parts), returncode=result.returncode, stdout=stdout, stderr=stderr)
        if result.returncode and not (missing and result.returncode == 1 and not stdout.strip() and not stderr.strip()):
            raise RuntimeError("ADB命令失败，停止并保留PC完整备份及恢复证据")
        return stdout

    def shell(command: str, timeout: int = 120) -> str:
        return call("shell", "su", "-c", shlex.quote("set -e; " + command), timeout=timeout)

    def file_hashes(base: str, label: str, leading_dot: bool = False) -> dict[str, str]:
        relative = " ".join(shlex.quote(root) for root in DATA_ROOTS) if base == "/data" else "."
        raw = shell("cd " + shlex.quote(base) + " && find " + relative + " -type f -exec sha256sum {} +", timeout=1800)
        (output / (label + ".sha256")).write_text(raw, encoding="utf-8", newline="\n")
        return parse_hashes(raw, leading_dot=leading_dot)

    def stream_archive(source: Path, destination: str, label: str, expected_sha: str):
        # 专用exec-in原始stdin；stdout/stderr直写文件，不把23GB压到手机临时目录。
        arguments = restore_arguments(prefix, destination)
        started = time.monotonic()
        deadline = threading.Event()
        before = source.stat()
        copied = 0
        streamed_hash = hashlib.sha256()
        process = None
        with (output / (label + ".stdout.log")).open("xb") as stdout, (output / (label + ".stderr.log")).open("xb") as stderr, source.open("rb") as input_stream:
            process = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr)
            def expired():
                deadline.set()
                try:
                    process.terminate()
                except OSError:
                    pass
            timer = threading.Timer(3600, expired)
            timer.daemon = True
            timer.start()
            try:
                record("stream_restore_started", label=label, arguments=arguments, bytes=before.st_size, destination=destination)
                last_progress = time.monotonic()
                assert process.stdin is not None
                while block := input_stream.read(4 * 1024**2):
                    process.stdin.write(block)
                    copied += len(block)
                    streamed_hash.update(block)
                    if time.monotonic() - last_progress >= 20:
                        record("stream_restore_progress", label=label, copiedBytes=copied, totalBytes=before.st_size, elapsedSeconds=time.monotonic() - started)
                        last_progress = time.monotonic()
                process.stdin.close()
                returncode = process.wait(timeout=60)
                if deadline.is_set() or returncode != 0:
                    raise RuntimeError("流式恢复超时或tar退出失败，设备数据可能不完整；PC归档保留")
                after = source.stat()
                if copied != before.st_size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or streamed_hash.hexdigest() != expected_sha:
                    raise RuntimeError("实际流式输入的大小/时间/摘要与已验证归档不一致")
                os.fsync(stdout.fileno())
                os.fsync(stderr.fileno())
                record("stream_restore_completed", label=label, bytes=copied, sha256=streamed_hash.hexdigest(), elapsedSeconds=time.monotonic() - started)
            except BaseException:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=15)
                raise
            finally:
                timer.cancel()
                if process.stdin is not None and not process.stdin.closed:
                    process.stdin.close()

    try:
        receipt = json.loads((backup / "BACKUP_VERIFIED.json").read_text(encoding="utf-8"))
        recovery_path = ROOT / "parking-recovery-02/RECOVERY_VERIFIED.json"
        recovery = json.loads(recovery_path.read_text(encoding="utf-8"))
        if not (receipt.get("allDeviceFileHashesEqual") is True and receipt.get("criticalRestoreHashesEqual") is True
                and receipt.get("files") == EXPECTED_FILES and receipt.get("criticalRestoreFiles") == EXPECTED_PROBE_FILES
                and receipt.get("device") == args.device and receipt.get("package") == PACKAGE
                and receipt.get("originalApkSha256") == ORIGINAL_SHA
                and recovery.get("allOriginalFileHashesEqual") is True and recovery.get("restoredFiles") == EXPECTED_FILES
                and recovery.get("originalInstalled") is True):
            raise RuntimeError("43993文件完整备份、10文件恢复及上次完整恢复资格未全部成立")
        if file_sha256(backup / "original.apk") != ORIGINAL_SHA:
            raise RuntimeError("PC原版APK摘要不符")
        if archive.stat().st_size != receipt["archiveBytes"] or file_sha256(archive) != receipt["archiveSha256"]:
            raise RuntimeError("完整PC归档大小或SHA已变化")
        expected = parse_hashes((backup / "device-files.sha256").read_text(encoding="utf-8"))
        if len(expected) != EXPECTED_FILES:
            raise RuntimeError("PC原文件摘要清单数量不是43993")
        full_members = inspect_archive(archive, expected)
        probe = backup / "restore-probe.tar"
        probe_members = inspect_archive(probe, expected, probe=True)
        probe_sha = file_sha256(probe)
        require_identity(inspect_apk(target))
        write_json(output / "INPUT_IDENTITY.json", {"device": args.device, "package": PACKAGE, "backupReceiptSha256": file_sha256(backup / "BACKUP_VERIFIED.json"),
            "recoveryReceiptSha256": file_sha256(recovery_path), "sourceSha256": file_sha256(Path(__file__)),
            "originalManifestSha256": file_sha256(backup / "device-files.sha256"), "archiveSha256": receipt["archiveSha256"], "archiveBytes": receipt["archiveBytes"], "transport": TRANSPORT,
            "originalApkSha256": ORIGINAL_SHA, "targetApkSha256": EXPECTED["sha256"], "probeSha256": probe_sha, "archiveMembers": full_members, "probeMembers": probe_members})

        stage = "verify_device_original_and_scope"
        if call("get-state").strip() != "device":
            raise RuntimeError("指定设备不可用")
        users = re.findall(r"UserInfo\{(\d+):", shell("pm list users"))
        if "0" not in users:
            raise RuntimeError("无法确认主用户")
        for user in users:
            if user != "0":
                packages = shell("pm list packages --user " + user + " " + PACKAGE)
                if "package:" + PACKAGE in packages.splitlines():
                    raise RuntimeError("其他用户安装了游戏，当前备份不覆盖，拒绝卸载")
                shell("test ! -e /data/user/" + user + "/" + PACKAGE + "; test ! -e /data/user_de/" + user + "/" + PACKAGE)
            for kind in ("data", "obb", "media"):
                shell("test ! -e /storage/emulated/" + user + "/Android/" + kind + "/" + PACKAGE)
        volumes = shell("ls /storage; ls /mnt/expand")
        if set(volumes.split()) - {"emulated", "self"}:
            raise RuntimeError("发现额外外部卷，须先检查并完整备份")
        package_path = call("shell", "pm", "path", PACKAGE).strip().removeprefix("package:")
        if not re.fullmatch(r"/data/app/[A-Za-z0-9_./=+@~-]+\.apk", package_path):
            raise RuntimeError("原版安装路径不是明确单一APK")
        if shell("sha256sum " + shlex.quote(package_path)).split()[0] != ORIGINAL_SHA:
            raise RuntimeError("设备APK不是登记原版，拒绝卸载")
        call("shell", "am", "force-stop", PACKAGE)
        if call("shell", "pidof", PACKAGE, missing=True).strip():
            raise RuntimeError("原版仍在运行")
        # 恢复凭证之外再次核验当前原件，避免凭旧回执卸载已变化的数据。
        if file_hashes("/data", "original-immediately-before") != expected:
            raise RuntimeError("当前原文件集合或SHA与PC完整备份不一致，拒绝卸载")
        free_before = parse_available_bytes(shell("df -Pk /data"))
        sizes = shell("du -sk " + " ".join("/data/" + root for root in DATA_ROOTS))
        allocated = sum(int(line.split()[0]) * 1024 for line in sizes.splitlines())
        required = receipt["archiveBytes"] + MIN_RESERVE
        if free_before + allocated - target.stat().st_size < required:
            raise RuntimeError("预估卸载后空间不足完整归档加2GiB，拒绝卸载")
        record("pre_uninstall_space_verified", freeBeforeBytes=free_before, originalAllocatedBytes=allocated, requiredAfterUninstallBytes=required)

        stage = "raw_stdin_isolated_restore_probe"
        remote_probe = "/data/local/tmp/aeii-archive-stream-probe-" + output.name
        shell("test ! -e " + shlex.quote(remote_probe) + "; mkdir -m 0700 " + shlex.quote(remote_probe))
        stream_archive(probe, remote_probe, "restore-probe", probe_sha)
        restored_probe = file_hashes(remote_probe, "restore-probe-device", leading_dot=True)
        if restored_probe != probe_members["probeHashes"]:
            raise RuntimeError("原始stdin隔离恢复10个关键文件SHA不一致，拒绝卸载")
        write_json(output / "STREAM_PROBE_VERIFIED.json", {"passed": True, "files": len(restored_probe), "sourceSha256": probe_sha, "remoteDirectoryRetained": remote_probe, "rawStdin": True, "transport": TRANSPORT})

        stage = "standard_uninstall_original"
        if "Success" not in call("uninstall", PACKAGE, timeout=600):
            raise RuntimeError("原版标准卸载未确认成功")
        uninstalled = True
        stage = "verify_post_uninstall_space"
        free_after = parse_available_bytes(shell("df -Pk /data"))
        if free_after < required:
            raise RuntimeError("实际卸载后空间不足归档加2GiB，PC备份保留，暂不安装或恢复")
        record("post_uninstall_space_verified", freeBytes=free_after, requiredBytes=required)

        stage = "standard_install_hard_apk"
        if "Success" not in call("install", str(target), timeout=240):
            raise RuntimeError("困难版安装未确认成功；PC原版APK及归档保留")
        installed = True
        call("shell", "am", "force-stop", PACKAGE)
        if call("shell", "pidof", PACKAGE, missing=True).strip():
            raise RuntimeError("新安装游戏进程未停止")
        installed_path = call("shell", "pm", "path", PACKAGE).strip().removeprefix("package:")
        if not re.fullmatch(r"/data/app/[A-Za-z0-9_./=+@~-]+\.apk", installed_path) or shell("sha256sum " + shlex.quote(installed_path)).split()[0] != EXPECTED["sha256"]:
            raise RuntimeError("新安装APK摘要不符")
        uid_match = re.search(r"\buserId=(\d+)", call("shell", "dumpsys", "package", PACKAGE))
        if not uid_match or not 10000 <= int(uid_match[1]) <= 19999:
            raise RuntimeError("无法唯一确定新应用UID")
        app_uid = uid_match[1]
        for root in DATA_ROOTS:
            shell("test -d /data/" + root + "; test ! -L /data/" + root)
        links = shell("find " + " ".join("/data/" + root for root in DATA_ROOTS) + " -type l")
        if links.strip():
            raise RuntimeError("新安装数据目录含链接，禁止未经核验的覆盖恢复")
        roots_command = "stat -c '%d:%i' " + " ".join("/data/" + root for root in DATA_ROOTS)
        roots_before = shell(roots_command).splitlines()
        if len(roots_before) != 2 or any(not re.fullmatch(r"\d+:\d+", value) for value in roots_before):
            raise RuntimeError("无法绑定新安装CE/DE根目录inode")
        fresh_hashes = file_hashes("/data", "fresh-before-restore")
        write_json(output / "FRESH_BASELINE.json", {"rootDeviceAndInodes": dict(zip(DATA_ROOTS, roots_before)), "fileHashes": fresh_hashes, "appUid": int(app_uid)})
        if parse_available_bytes(shell("df -Pk /data")) < required:
            raise RuntimeError("安装后剩余空间不足归档加2GiB")

        stage = "stream_complete_original_archive"
        stream_archive(archive, "/data", "restore-complete-original", receipt["archiveSha256"])
        if shell(roots_command).splitlines() != roots_before:
            raise RuntimeError("恢复改变新安装CE/DE根inode，停止并保留完整PC归档")
        stage = "restore_uid_and_selinux"
        shell("chown -R " + app_uid + ":" + app_uid + " " + " ".join("/data/" + root for root in DATA_ROOTS)
              + "; restorecon -RF " + " ".join("/data/" + root for root in DATA_ROOTS), timeout=600)
        stage = "verify_all_restored_file_hashes"
        actual = file_hashes("/data", "restored-after-install")
        missing = sorted(set(expected) - set(actual))
        changed = sorted(name for name in expected.keys() & actual.keys() if expected[name] != actual[name])
        extras = {name: actual[name] for name in actual.keys() - expected.keys()}
        unexpected = sorted(name for name, value in extras.items() if fresh_hashes.get(name) != value)
        write_json(output / "RESTORED_FILE_COMPARISON.json", {"expectedOriginalFiles": len(expected), "actualFiles": len(actual), "missing": missing, "changed": changed, "observedFreshExtras": extras, "unapprovedExtras": unexpected})
        if missing or changed or unexpected or len(actual) != EXPECTED_FILES + len(extras):
            raise RuntimeError("恢复后的原文件SHA/数量或额外文件资格不一致，尚不启动应用")
        if shell(roots_command).splitlines() != roots_before:
            raise RuntimeError("验收时新安装CE/DE根inode变化")
        restored = True
        result = {"installed": True, "targetApkSha256": EXPECTED["sha256"], "originalApkSha256": ORIGINAL_SHA, "device": args.device,
                  "backupReceiptSha256": file_sha256(backup / "BACKUP_VERIFIED.json"), "archiveSha256": receipt["archiveSha256"], "archiveBytes": receipt["archiveBytes"],
                  "restoredFiles": EXPECTED_FILES, "totalFilesAfterRestore": len(actual), "freshExtraFiles": len(extras), "allOriginalFileHashesEqual": True,
                  "rootDeviceAndInodesPreserved": True, "streamProbePassed": True, "rawStdinStreaming": True, "transport": TRANSPORT, "standardUninstallInstall": True,
                  "otherUsersAndExternalStorageChecked": True, "appUid": int(app_uid), "accountLoginVerified": False, "appRuntimeVerified": False,
                  "originalArchiveRetained": True, "originalApkRetained": True, "rootDirectoriesMovedOrDeletedByRestore": False,
                  "historicalFilesRecoveredFromVerifiedArchive": True, "applicationStillForceStopped": True}
        write_json(output / "INSTALL_VERIFIED.json", result)
        record("installation_and_archive_restore_verified", restoredFiles=EXPECTED_FILES, freshExtraFiles=len(extras))
        return 0
    except BaseException as error:
        write_json(output / "INSTALL_FAILURE.json", {"stage": stage, "error": repr(error), "device": args.device,
            "originalUninstallConfirmed": uninstalled, "hardInstallConfirmed": installed, "fullRestoreVerified": restored,
            "backup": str(backup), "originalPCArchiveRetained": True, "originalPCApkRetained": True,
            "applicationDataMayBePartial": uninstalled and not restored, "automaticRollbackAttempted": False,
            "nextAction": "保留原始PC备份及所有日志；核对明确stage后，由操作员从完整归档恢复，不能凭部分文件启动或验收"})
        record("failed", error=repr(error), originalUninstallConfirmed=uninstalled, hardInstallConfirmed=installed, fullRestoreVerified=restored)
        raise
    finally:
        events.close()


if __name__ == "__main__":
    raise SystemExit(main())
