"""归档已双重验收的手机冗余副本；PC原件始终保留，只删当前成功叶目录。"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from contract import EXPECTED, SUCCESS_FILES, parse_device_sha


def sha(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("归档输入必须是JSON对象")
    return value


def save(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def root_call(adb, command: str) -> str:
    # 动态部分只来自固定包名、通过校验的attemptId和七个固定文件名。
    if "'" in command or "\n" in command or "\r" in command:
        raise ValueError("归档命令不接受引号或换行")
    return adb.call("shell", "su", "-c", "'" + command + "'")


def one_line(text: str) -> str:
    lines = text.strip().splitlines()
    if len(lines) != 1:
        raise RuntimeError("设备归档路径或类型无法唯一解析")
    return lines[0]


def require_regular(adb, path: str, size: int, expected_sha: str) -> dict:
    # stat默认不跟随符号链接，类型必须精确为regular file。
    observed = one_line(root_call(adb, 'stat -c "%F %s" ' + path))
    if observed != "regular file " + str(size):
        raise RuntimeError("设备文件不是大小相符的普通文件：" + path)
    actual_sha = parse_device_sha(root_call(adb, "sha256sum " + path), path)
    if actual_sha != expected_sha:
        raise RuntimeError("设备文件SHA与PC独立验收原件不一致：" + path)
    return {"sha256": actual_sha, "bytes": size, "type": "regular file", "symbolicLink": False}


def require_inventory(adb, target: str) -> None:
    if one_line(root_call(adb, 'stat -c "%F" ' + target)) != "directory":
        raise RuntimeError("当前尝试叶目录不是普通目录，拒绝归档")
    output = root_call(adb, "find " + target + " -mindepth 1 -maxdepth 1 -print0")
    entries = output.split("\x00")
    if not entries or entries[-1] != "":
        raise RuntimeError("设备目录清单不是完整NUL分隔格式")
    entries = entries[:-1]
    expected = {target + "/" + name for name in SUCCESS_FILES}
    if len(entries) != len(SUCCESS_FILES) or set(entries) != expected:
        raise RuntimeError("设备成功目录含未知条目、子目录或缺失文件；全部保留不归档")


def archive_verified_device_copies(adb, attempt: Path, job: dict, device: str,
                                  process_exit: dict, destination: Path) -> dict:
    if destination.exists():
        raise FileExistsError("归档回执已存在，拒绝自动重试或覆盖")
    receipt = {"schema": "native-hard-verified-device-archive-v1", "enabled": True, "removed": False,
        "startedUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "device": device,
        "parentId": job.get("parentId"), "attemptId": job.get("attemptId"), "files": [],
        "pcOriginalsRetained": True, "leafRemoved": False, "partialRemoval": False}
    try:
        attempt_id = job.get("attemptId")
        if not isinstance(attempt_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", attempt_id):
            raise ValueError("归档attemptId必须是当前job的安全单一目录名")
        if (process_exit.get("processExited") is not True or type(process_exit.get("pid")) is not int
                or process_exit["pid"] <= 0 or adb.pids()):
            raise RuntimeError("未确认owned进程退出或仍有应用进程，拒绝归档")
        request = load(attempt / "request.json")
        verification = load(attempt / "verification.json")
        if request.get("device") != device:
            raise RuntimeError("归档设备与当前尝试不符")
        for field in ("parentId", "attemptId"):
            if request.get("job", {}).get(field) != job.get(field) or verification.get(field) != job.get(field):
                raise RuntimeError("归档身份与当前已验收job不符")
        if (any(verification.get(field) is not True for field in
                ("passed", "nativeReplayVerified", "projectStrictVerified", "initialPlanMatched"))
                or verification.get("apkSha256") != EXPECTED["sha256"]
                or set(verification.get("artifactHashes", {})) != SUCCESS_FILES):
            raise RuntimeError("归档需要完整且身份相符的双路独立验收")
        package = EXPECTED["package"]
        virtual_base = "/data/user/0/" + package + "/files/.aeii-hard-collect"
        allowed_bases = {virtual_base, "/data/data/" + package + "/files/.aeii-hard-collect"}
        native_root = load(attempt / "launch-config.json").get("nativeRoot")
        if native_root not in {base + "/" + attempt_id for base in allowed_bases}:
            raise RuntimeError("nativeRoot不是当前安全attempt叶目录，拒绝读取或删除")
        host_files = {}
        for name in sorted(SUCCESS_FILES):
            path = attempt / "native" / name
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or path.is_symlink():
                raise RuntimeError("PC原件不是普通文件，禁止归档手机副本")
            actual_sha = sha(path)
            if actual_sha != verification["artifactHashes"][name]:
                raise RuntimeError("PC原件SHA不再匹配独立验收：" + name)
            host_files[name] = {"path": str(path.resolve()), "sha256": actual_sha, "bytes": info.st_size}
        receipt.update({"hostFiles": host_files, "verificationSha256": sha(attempt / "verification.json"),
                        "ownedPid": process_exit["pid"], "ownedProcessExited": True, "requestedNativeRoot": native_root})
        canonical_base = one_line(root_call(adb, "readlink -f " + virtual_base))
        canonical_target = one_line(root_call(adb, "readlink -f " + native_root))
        if canonical_base not in allowed_bases or canonical_target != canonical_base + "/" + attempt_id:
            raise RuntimeError("归档canonical base或target不相符；拒绝任意prefix路径")
        receipt.update({"canonicalBase": canonical_base, "canonicalTarget": canonical_target})
        require_inventory(adb, canonical_target)
        for name, host in host_files.items():
            observed = require_regular(adb, canonical_target + "/" + name, host["bytes"], host["sha256"])
            receipt["files"].append({"name": name, "hostSha256": host["sha256"], "deviceSha256": observed["sha256"],
                                     "bytes": host["bytes"], "removed": False})
        # 完成七件全量核对后才开始删除；逐件复查，禁止通配、递归rm或清理base。
        require_inventory(adb, canonical_target)
        if adb.pids():
            raise RuntimeError("归档核对期间出现应用进程，保留全部设备文件")
        for item in receipt["files"]:
            host = host_files[item["name"]]
            if sha(Path(host["path"])) != host["sha256"]:
                raise RuntimeError("PC原件在设备删除前发生变化")
            remote = canonical_target + "/" + item["name"]
            require_regular(adb, remote, item["bytes"], item["deviceSha256"])
            root_call(adb, "rm -- " + remote)
            item["removed"] = True
            receipt["partialRemoval"] = True
        root_call(adb, "rmdir -- " + canonical_target)
        receipt["leafRemoved"] = True
        remaining = one_line(root_call(adb, "if [ -e " + canonical_target + " ] || [ -L " + canonical_target
                                       + " ]; then echo PRESENT; else echo ABSENT; fi"))
        if remaining != "ABSENT":
            raise RuntimeError("设备叶目录未确认删除完成")
        if any(sha(Path(item["path"])) != item["sha256"] for item in host_files.values()):
            raise RuntimeError("设备归档完成后PC原件摘要发生变化")
        receipt.update({"removed": True, "partialRemoval": False,
                        "completedUtc": dt.datetime.now(dt.timezone.utc).isoformat()})
        save(destination, receipt)
        return receipt
    except (Exception, KeyboardInterrupt) as error:
        receipt.update({"error": str(error), "completedUtc": dt.datetime.now(dt.timezone.utc).isoformat()})
        if not destination.exists():
            save(destination, receipt)
        raise RuntimeError("设备冗余副本归档未完成；保留PC证据并停止调度：" + str(error)) from error
