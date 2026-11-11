"""同一加密父目录内用libc原子重命名保全数据，替换APK后原位恢复。"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from contract import EXPECTED, file_sha256, inspect_apk, require_identity
from atomic_device_fs import AtomicDeviceFs

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

PACKAGE = EXPECTED["package"]
ORIGINAL_SHA = "51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b"
ROOT = Path(__file__).resolve().parents[2] / "ai_training/hard_native_3000_20261022"


def main() -> None:
    raise RuntimeError("此候选方案未执行且已停用：卸载可能按CE目录inode追踪改名原件；请使用完整归档恢复方案")
    # 保留候选源码作为未执行方案的审查证据。
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    backup, output, target = args.backup.resolve(), args.output.resolve(), args.target.resolve()
    backup.relative_to(ROOT)
    output.relative_to(ROOT)
    target.relative_to(ROOT)
    receipt = json.loads((backup / "BACKUP_VERIFIED.json").read_text(encoding="utf-8"))
    recovered = json.loads((ROOT / "parking-recovery-02/RECOVERY_VERIFIED.json").read_text(encoding="utf-8"))
    if not recovered.get("allOriginalFileHashesEqual"):
        raise RuntimeError("上次暂存未证明完整恢复，拒绝下一次安装")
    if not (receipt["allDeviceFileHashesEqual"] and receipt["criticalRestoreHashesEqual"]
            and receipt["device"] == args.device and receipt["originalApkSha256"] == ORIGINAL_SHA
            and receipt["files"] >= 1 and file_sha256(backup / "original.apk") == ORIGINAL_SHA):
        raise RuntimeError("完整备份与隔离恢复资格不成立")
    if file_sha256(backup / "original-data.tar") != receipt["archiveSha256"]:
        raise RuntimeError("完整归档摘要已变化")
    require_identity(inspect_apk(target))
    output.mkdir(parents=True, exist_ok=False)
    log = (output / "events.jsonl").open("x", encoding="utf-8")
    prefix = [args.adb, "-s", args.device]
    stage = "preflight"

    def call(*parts: str, timeout=120, missing=False) -> str:
        result = subprocess.run([*prefix, *parts], capture_output=True, timeout=timeout)
        text = result.stdout.decode("utf-8", errors="replace")
        row = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "stage": stage,
               "arguments": list(parts), "returncode": result.returncode,
               "stdout": text, "stderr": result.stderr.decode("utf-8", errors="replace")}
        log.write(json.dumps(row, ensure_ascii=False) + "\n")
        log.flush()
        print(json.dumps({**row, "stdout": text[:700]}, ensure_ascii=False), flush=True)
        if result.returncode and not missing:
            raise RuntimeError("安装步骤失败，停止并保留暂存数据及备份")
        return text

    def shell(command: str, timeout=120) -> str:
        return call("shell", "su", "-c", "'set -e; " + command + "'", timeout=timeout)

    parking = {"ce": "/data/user/0/." + PACKAGE + ".aeii-backup-" + output.name,
               "de": "/data/user_de/0/." + PACKAGE + ".aeii-backup-" + output.name}
    fresh = {"ce": "/data/user/0/." + PACKAGE + ".aeii-fresh-" + output.name,
             "de": "/data/user_de/0/." + PACKAGE + ".aeii-fresh-" + output.name}
    if not re.fullmatch(r"[A-Za-z0-9_-]+", output.name):
        raise RuntimeError("暂存目录名非法")
    ce, de = "/data/user/0/" + PACKAGE, "/data/user_de/0/" + PACKAGE
    atomic = None
    try:
        users = shell("pm list users")
        user_ids = re.findall(r"UserInfo\{(\d+):", users)
        if "0" not in user_ids:
            raise RuntimeError("无法确认主用户")
        for user in user_ids:
            if user != "0":
                packages = call("shell", "pm", "list", "packages", "--user", user, PACKAGE)
                if ("package:" + PACKAGE) in packages.splitlines():
                    raise RuntimeError("其他用户也安装了目标游戏，当前备份未覆盖，拒绝卸载")
                shell("test ! -e /data/user/" + user + "/" + PACKAGE
                      + "; test ! -e /data/user_de/" + user + "/" + PACKAGE)
            for kind in ("data", "obb"):
                shell("test ! -e /storage/emulated/" + user + "/Android/" + kind + "/" + PACKAGE)
        volumes = shell("ls /storage; ls /mnt/expand")
        if set(volumes.split()) - {"emulated", "self"}:
            raise RuntimeError("发现额外外部卷，须先核验并备份游戏目录")
        original_path = call("shell", "pm", "path", PACKAGE).strip().removeprefix("package:")
        if call("shell", "sha256sum", original_path).split()[0] != ORIGINAL_SHA:
            raise RuntimeError("设备已不是预期原版，拒绝替换")
        call("shell", "am", "force-stop", PACKAGE)
        if call("shell", "pidof", PACKAGE, missing=True).strip():
            raise RuntimeError("目标游戏未停止")
        # 同分区仍可能跨加密策略；只用同一父目录内的libc rename，绝无复制回退。
        stage = "park_original_data"
        atomic = AtomicDeviceFs(call, output)
        atomic.__enter__()
        atomic.rename(ce, parking["ce"])
        try:
            atomic.rename(de, parking["de"])
        except Exception:
            atomic.rename(parking["ce"], ce)
            raise
        stage = "replace_apk"
        removed = call("uninstall", PACKAGE, timeout=180)
        if "Success" not in removed:
            raise RuntimeError("原版卸载未确认成功；数据仍保留在暂存区")
        installed = call("install", str(target), timeout=240)
        if "Success" not in installed:
            raise RuntimeError("困难版安装未确认成功；须用备份原版回滚")
        call("shell", "am", "force-stop", PACKAGE)
        installed_path = call("shell", "pm", "path", PACKAGE).strip().removeprefix("package:")
        if call("shell", "sha256sum", installed_path).split()[0] != EXPECTED["sha256"]:
            raise RuntimeError("安装后APK摘要不符")
        package_dump = call("shell", "dumpsys", "package", PACKAGE)
        uid = re.search(r"\buserId=(\d+)", package_dump)
        if not uid or not 10000 <= int(uid[1]) <= 19999:
            raise RuntimeError("无法确认新安装应用UID")
        app_uid = uid[1]
        stage = "restore_original_data"
        for key, path in (("ce", ce), ("de", de)):
            if shell("if [ -e " + path + " ]; then echo exists; fi").strip() == "exists":
                atomic.rename(path, fresh[key])
            atomic.rename(parking[key], path)
        shell("chown -R " + app_uid + ":" + app_uid + " " + ce + " " + de
              + "; restorecon -RF " + ce + " " + de, timeout=300)
        stage = "verify_restored_data"
        raw = shell("cd /data && find user/0/" + PACKAGE + " user_de/0/" + PACKAGE
                    + " -type f -exec sha256sum {} +", timeout=1800)
        actual = {line.split(None, 1)[1].strip(): line.split()[0] for line in raw.splitlines()}
        expected = {line.split(None, 1)[1].strip(): line.split()[0]
                    for line in (backup / "device-files.sha256").read_text(encoding="utf-8").splitlines() if line.strip()}
        if actual != expected:
            raise RuntimeError("恢复后原数据文件集合或摘要不一致，尚不启动应用")
        result = {"installed": True, "targetApkSha256": EXPECTED["sha256"],
                  "originalApkSha256": ORIGINAL_SHA, "device": args.device,
                  "backupReceiptSha256": file_sha256(backup / "BACKUP_VERIFIED.json"),
                  "restoredFiles": len(actual), "allOriginalFileHashesEqual": True,
                  "appUid": int(app_uid), "parking": parking, "freshDataRetained": fresh,
                  "atomicRenameOnly": True, "copyFallback": False,
                  "accountLoginVerified": False, "appRuntimeVerified": False,
                  "otherUsersAndExternalStorageChecked": True,
                  "originalArchiveRetained": True, "noHistoricalFilesDeleted": True}
        (output / "INSTALL_VERIFIED.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False), flush=True)
    except Exception as error:
        (output / "INSTALL_FAILURE.json").write_text(json.dumps({"stage": stage, "error": repr(error),
                                                                  "parking": parking, "backup": str(backup)}, ensure_ascii=False, indent=2), encoding="utf-8")
        raise
    finally:
        if atomic is not None:
            atomic.__exit__(None, None, None)
        log.close()


if __name__ == "__main__":
    main()
