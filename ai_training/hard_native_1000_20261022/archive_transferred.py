"""只归档已完整导出的当前手机副本；规则独立重放明确留待后续处理。"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
import re
import stat
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/phone_training_hard"))
import verified_device_archive as helpers  # noqa: E402
from contract import EXPECTED, SUCCESS_FILES  # noqa: E402


def safe_attempt_id(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value):
        raise ValueError("attemptId必须是安全的单一目录名")
    return value


def permitted_native_root(native_root, attempt_id: str) -> tuple[str, set[str]]:
    package = EXPECTED["package"]
    base = "/data/user/0/" + package + "/files/.aeii-hard-collect"
    aliases = {base, "/data/data/" + package + "/files/.aeii-hard-collect"}
    if native_root not in {root + "/" + safe_attempt_id(attempt_id) for root in aliases}:
        raise ValueError("nativeRoot必须精确指向当前attempt叶目录")
    return base, aliases


def regular_host(path: Path) -> dict:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode):
        raise RuntimeError("PC证据不是普通文件：" + str(path))
    return {"path": str(path.resolve()), "bytes": info.st_size, "sha256": helpers.sha(path)}


def archive_transferred_device_copies(adb, attempt: Path, job: dict, device: str,
                                     process_exit: dict, receipt_path: Path) -> dict:
    """只删本局七件已核SHA的手机副本，不把传输成功记为规则验收或训练准入。"""
    attempt, receipt_path = Path(attempt), Path(receipt_path)
    if receipt_path.exists() or receipt_path.is_symlink():
        raise FileExistsError("手机副本归档回执已存在，拒绝自动重试或覆盖")
    if receipt_path.parent.resolve() != attempt.resolve():
        raise ValueError("归档回执必须保存在当前attempt目录内")
    receipt = {"schema": "native-hard-transferred-device-archive-v1", "enabled": True,
        "startedUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "device": device,
        "parentId": job.get("parentId"), "attemptId": job.get("attemptId"),
        "transferOnly": True, "independentReplayDeferred": True,
        "nativeReplayVerified": False, "projectStrictVerified": False,
        "policyEligible": False, "valueEligible": False, "trainingAdmissionDecided": False,
        "pcOriginalsRetained": True, "removed": False, "leafRemoved": False,
        "partialRemoval": False, "files": [], "sourceSha256": helpers.sha(Path(__file__)),
        "helperSourceSha256": helpers.sha(Path(helpers.__file__))}
    try:
        attempt_id = safe_attempt_id(job.get("attemptId"))
        safe_attempt_id(job.get("parentId"))
        native = attempt / "native"
        for directory in (attempt, native):
            if directory.is_symlink() or not stat.S_ISDIR(directory.lstat().st_mode):
                raise RuntimeError("PC尝试或native目录含符号链接或不是目录")
        if {item.name for item in native.iterdir()} != SUCCESS_FILES:
            raise RuntimeError("PC原始证据含未知、失败或缺失条目，全部保留")
        metadata_names = ("request.json", "artifact-transfer.json", "owned-process.json",
                          "resident-after-export.json", "launch-config.json", "device-static-identity.json")
        metadata = {name: regular_host(attempt / name) for name in metadata_names}
        request = helpers.load(attempt / "request.json")
        actual_job = request.get("job", {})
        if request.get("device") != device:
            raise RuntimeError("PC尝试与归档设备不一致")
        for name in ("parentId", "attemptId", "map", "seed", "maxActions", "requestedPlayerType", "jsRngMode"):
            if name not in job or actual_job.get(name) != job[name]:
                raise RuntimeError("PC请求与当前job不一致：" + name)
        identity = helpers.load(attempt / "device-static-identity.json")
        if any(identity.get(key) != value for key, value in EXPECTED.items()):
            raise RuntimeError("采集时APK静态身份不一致")
        owned = helpers.load(attempt / "owned-process.json")
        start = owned.get("startTimeTicks", owned.get("procStarttime"))
        if (owned.get("launcherOwned") is not True or type(owned.get("pid")) is not int or owned["pid"] <= 0
                or not isinstance(start, str) or not start.isdigit()
                or ("startTimeTicks" in owned and "procStarttime" in owned and owned["startTimeTicks"] != owned["procStarttime"])
                or owned.get("device") != device or owned.get("package") != EXPECTED["package"]
                or owned.get("parentId") != job["parentId"] or owned.get("attemptId") != attempt_id):
            raise RuntimeError("owned进程身份缺失或与本局不符")
        if (process_exit.get("processExited") is not True or type(process_exit.get("pid")) is not int
                or process_exit["pid"] != owned["pid"]):
            raise RuntimeError("没有明确的本局owned进程退出凭据")
        for key in ("startTimeTicks", "procStarttime"):
            if key in process_exit and process_exit[key] != start:
                raise RuntimeError("退出凭据与owned进程起始身份不一致")
        if adb.pids():
            raise RuntimeError("仍有应用进程，保留手机副本")
        pid_gone = helpers.one_line(helpers.root_call(adb,
            "if [ -e /proc/" + str(owned["pid"]) + " ]; then echo PRESENT; else echo ABSENT; fi"))
        if pid_gone != "ABSENT":
            raise RuntimeError("owned PID仍存在或已复用，拒绝手机归档")
        status = helpers.load(attempt / "resident-after-export.json")
        if (status.get("workerAlive") is not False or status.get("workerFinished") is not True
                or status.get("cleanup") != "safe" or status.get("fatal") is not None
                or status.get("pendingCallbacks") != 0 or status.get("pageLoadPending") is not False
                or status.get("inCall") is not False or status.get("restartRequired") is not False):
            raise RuntimeError("工作线程或在途回调没有安全结束，保留手机副本")
        host_files = {name: regular_host(native / name) for name in sorted(SUCCESS_FILES)}
        result = helpers.load(native / "result.json")
        if status.get("workerResult") != result or result.get("error") is not None:
            raise RuntimeError("原生结果与安全收尾状态不一致或存在运行错误")
        for name in ("parentId", "attemptId", "map", "seed"):
            if result.get(name) != job[name]:
                raise RuntimeError("原生result身份与本局不一致")
        transfer = helpers.load(attempt / "artifact-transfer.json")
        items = transfer.get("files", [])
        by_name = {item["name"]: item for item in items}
        if (transfer.get("transferHashesVerified") is not True or transfer.get("completeSuccessSet") is not True
                or len(items) != len(SUCCESS_FILES) or len(by_name) != len(items) or set(by_name) != SUCCESS_FILES):
            raise RuntimeError("没有精确完整的七件传输凭据")
        for name, host in host_files.items():
            recorded = by_name[name]
            if (type(recorded.get("bytes")) is not int or recorded["bytes"] != host["bytes"]
                    or host["bytes"] <= 0 or recorded.get("sha256") != host["sha256"]):
                raise RuntimeError("PC七件原件大小或SHA与传输凭据不符：" + name)
        native_root = helpers.load(attempt / "launch-config.json").get("nativeRoot")
        virtual_base, allowed_bases = permitted_native_root(native_root, attempt_id)
        canonical_base = helpers.one_line(helpers.root_call(adb, "readlink -f " + virtual_base))
        canonical_target = helpers.one_line(helpers.root_call(adb, "readlink -f " + native_root))
        if canonical_base not in allowed_bases or canonical_target != canonical_base + "/" + attempt_id:
            raise RuntimeError("canonical base或当前attempt路径不规范，拒绝归档")
        for remote in (canonical_base, native_root, canonical_target):
            if helpers.one_line(helpers.root_call(adb, 'stat -c "%F" ' + remote)) != "directory":
                raise RuntimeError("手机base或叶目录是符号链接或类型不正确")
        receipt.update({"hostFiles": host_files, "metadataFiles": metadata, "apkSha256": EXPECTED["sha256"],
            "resultSha256": host_files["result.json"]["sha256"], "ownedPid": owned["pid"], "ownedStartTimeTicks": start,
            "ownedProcessExited": True, "processExit": process_exit, "requestedNativeRoot": native_root,
            "canonicalBase": canonical_base, "canonicalTarget": canonical_target, "naturalEndObserved": result.get("naturalEnd")})
        helpers.require_inventory(adb, canonical_target)
        for name, host in host_files.items():
            observed = helpers.require_regular(adb, canonical_target + "/" + name, host["bytes"], host["sha256"])
            receipt["files"].append({"name": name, "bytes": host["bytes"], "hostSha256": host["sha256"],
                "deviceSha256": observed["sha256"], "removed": False})
        # 七件完整核验以后才删除；先再次核对元数据，逐件精确rm，不递归、不通配、不清base。
        helpers.require_inventory(adb, canonical_target)
        if adb.pids():
            raise RuntimeError("手机核对期间出现应用进程，保留全部副本")
        if any(regular_host(attempt / name) != original for name, original in metadata.items()):
            raise RuntimeError("归档准备期间PC元数据变化")
        for item in receipt["files"]:
            name = item["name"]
            if regular_host(native / name) != host_files[name]:
                raise RuntimeError("删除前PC原件变化，停止归档")
            remote = canonical_target + "/" + name
            helpers.require_regular(adb, remote, item["bytes"], item["deviceSha256"])
            helpers.root_call(adb, "rm -- " + remote)
            item["removed"] = True
            receipt["partialRemoval"] = True
        helpers.root_call(adb, "rmdir -- " + canonical_target)
        receipt["leafRemoved"] = True
        remaining = helpers.one_line(helpers.root_call(adb, "if [ -e " + canonical_target + " ] || [ -L "
            + canonical_target + " ]; then echo PRESENT; else echo ABSENT; fi"))
        if remaining != "ABSENT":
            raise RuntimeError("手机attempt叶目录未确认移除")
        if any(regular_host(native / name) != original for name, original in host_files.items()):
            raise RuntimeError("手机归档后PC原件变化")
        receipt.update({"removed": True, "partialRemoval": False, "completedUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "qualification": "仅证明七件原始证据完整传输并归档手机冗余副本；未执行独立规则重放，未决定策略或Value准入"})
        helpers.save(receipt_path, receipt)
        return receipt
    except (Exception, KeyboardInterrupt) as error:
        receipt.update({"error": str(error), "completedUtc": dt.datetime.now(dt.timezone.utc).isoformat()})
        if not receipt_path.exists():
            helpers.save(receipt_path, receipt)
        raise RuntimeError("当前手机冗余副本归档未完成；PC原件及未删副本保留，停止调度：" + str(error)) from error


# 供新1000局控制器使用的短接口，语义与完整函数相同。
archive_transferred = archive_transferred_device_copies
