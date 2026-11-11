"""停止目标游戏后完整归档原版数据，并在隔离目录验证关键存档恢复。"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import time

PACKAGE = "net.toyknight.aeii.android"
ORIGINAL_SHA = "51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b"
ROOT = Path(__file__).resolve().parents[2]
DATA_ROOTS = [f"user/0/{PACKAGE}", f"user_de/0/{PACKAGE}"]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.relative_to(ROOT / "ai_training" / "hard_native_3000_20261022")
    output.mkdir(parents=True, exist_ok=False)
    events = (output / "events.jsonl").open("x", encoding="utf-8")
    prefix = [args.adb, "-s", args.device]

    def record(kind: str, **details) -> None:
        row = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "kind": kind, **details}
        events.write(json.dumps(row, ensure_ascii=False) + "\n")
        events.flush()
        visible = {key: (value[:600] + "…" if isinstance(value, str) and len(value) > 600 else value)
                   for key, value in row.items()}
        print(json.dumps(visible, ensure_ascii=False), flush=True)

    def call(*parts: str, timeout: int = 60) -> str:
        result = subprocess.run([*prefix, *parts], capture_output=True, timeout=timeout)
        text = result.stdout.decode("utf-8", errors="replace")
        record("adb", arguments=list(parts), returncode=result.returncode,
               stdout=text, stderr=result.stderr.decode("utf-8", errors="replace"))
        if result.returncode and not (parts[:2] == ("shell", "pidof") and result.returncode == 1 and not text.strip()):
            raise RuntimeError("ADB命令失败")
        return text

    def shell(command: str, timeout: int = 60) -> str:
        return call("shell", "su", "-c", "'" + command + "'", timeout=timeout)

    try:
        if shutil.disk_usage(output).free < 40 * 1024**3:
            raise RuntimeError("电脑可用空间不足40GiB，停止备份")
        package_path = call("shell", "pm", "path", PACKAGE).strip().removeprefix("package:")
        if not package_path.startswith("/data/app/") or "\n" in package_path:
            raise RuntimeError("安装路径不是单一 APK")
        if call("shell", "sha256sum", package_path).split()[0] != ORIGINAL_SHA:
            raise RuntimeError("当前安装包不是登记原版")
        call("pull", package_path, str(output / "original.apk"), timeout=120)
        if digest(output / "original.apk") != ORIGINAL_SHA:
            raise RuntimeError("原版APK备份摘要不符")
        # 停止明确目标应用，避免归档期间数据库和历史采集文件发生写入。
        call("shell", "am", "force-stop", PACKAGE)
        if call("shell", "pidof", PACKAGE).strip():
            raise RuntimeError("游戏仍在运行")
        record("original_stopped_and_apk_preserved")
        roots = " ".join(DATA_ROOTS)
        raw = shell("cd /data && find " + roots + " -type f -exec sha256sum {} +", timeout=1800)
        (output / "device-files.sha256").write_text(raw, encoding="utf-8")
        expected = {}
        for line in raw.splitlines():
            value, name = line.split(None, 1)
            name = name.strip()
            if name in expected or not any(name.startswith(root + "/") for root in DATA_ROOTS):
                raise RuntimeError("备份文件路径重复或越界")
            expected[name] = value
        if not expected:
            raise RuntimeError("原版数据文件清单为空")
        record("source_hashes_complete", files=len(expected))
        archive = output / "original-data.tar"
        command = "cd /data && tar -cf - " + roots
        started = time.monotonic()
        with archive.open("xb") as target, (output / "tar.stderr.log").open("xb") as error:
            process = subprocess.Popen([*prefix, "exec-out", "su", "-c", command],
                                       stdout=subprocess.PIPE, stderr=error)
            assert process.stdout is not None
            copied = 0
            last = time.monotonic()
            while block := process.stdout.read(4 * 1024**2):
                target.write(block)
                copied += len(block)
                if time.monotonic() - last >= 20:
                    record("archive_copy", bytes=copied, seconds=time.monotonic() - started)
                    last = time.monotonic()
            target.flush()
            os.fsync(target.fileno())
            if process.wait() != 0:
                raise RuntimeError("归档进程失败，保留部分文件")
        checked = {}
        critical_names = []
        with tarfile.open(archive, "r:") as source:
            for member in source:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts:
                    raise RuntimeError("归档成员越界")
                if member.isfile():
                    if member.name in checked:
                        raise RuntimeError("重复归档成员")
                    stream = source.extractfile(member)
                    assert stream is not None
                    checked[member.name] = hashlib.file_digest(stream, "sha256").hexdigest()
                    # 历史大数据也已完整校验；设备恢复试验只复制关键配置和存档。
                    if "/files/.aeii/" not in member.name and member.size <= 8 * 1024**2:
                        critical_names.append(member.name)
        if checked != expected:
            raise RuntimeError("完整归档与设备逐文件摘要或文件集合不符")
        critical = output / "restore-probe.tar"
        with tarfile.open(archive, "r:") as source, tarfile.open(critical, "w") as target:
            for name in critical_names:
                member = source.getmember(name)
                target.addfile(member, source.extractfile(member))
        remote = "/data/local/tmp/aeii-hard-restore-probe-" + output.name
        if not output.name.replace("-", "").replace("_", "").isalnum():
            raise RuntimeError("恢复探针目录名非法")
        call("push", str(critical), remote + ".tar", timeout=120)
        shell("mkdir " + remote + " && tar -xf " + remote + ".tar -C " + remote, timeout=180)
        restored_raw = shell("cd " + remote + " && find . -type f -exec sha256sum {} +", timeout=180)
        restored = {line.split(None, 1)[1].strip().removeprefix("./"): line.split()[0]
                    for line in restored_raw.splitlines()}
        if restored != {name: expected[name] for name in critical_names}:
            raise RuntimeError("隔离恢复后关键文件摘要不符")
        result = {"schema": "original-apk-data-backup-v1", "package": PACKAGE,
                  "device": args.device, "originalApkSha256": ORIGINAL_SHA,
                  "archive": str(archive), "archiveSha256": digest(archive),
                  "archiveBytes": archive.stat().st_size, "files": len(checked),
                  "allDeviceFileHashesEqual": True, "criticalRestoreFiles": len(restored),
                  "criticalRestoreHashesEqual": True, "restoreProbeRemote": remote,
                  "fullPostReinstallRestoreTested": False, "apkUninstalled": False,
                  "externalAppDataObserved": False, "elapsedSeconds": time.monotonic() - started}
        (output / "BACKUP_VERIFIED.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        record("backup_verified", files=len(checked), criticalRestoreFiles=len(restored),
               archiveBytes=archive.stat().st_size)
    except Exception as error:
        record("failed", error=repr(error))
        raise
    finally:
        events.close()


if __name__ == "__main__":
    main()
