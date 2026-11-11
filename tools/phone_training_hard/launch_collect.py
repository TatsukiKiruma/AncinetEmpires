"""严格身份门禁后的完整单父局入口；保留短冒烟旧版本与全部尝试。"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import gzip
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
import zipfile

from collect_contract import EXPECTED, MAX_ACTIONS, SUCCESS_FILES, file_sha256, inspect_apk, parse_device_sha, parse_package_path, require_identity, summarize_evidence, validate_job

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


class Journal:
    def __init__(self, path: Path):
        self.output = path.open("x", encoding="utf-8")
        self.lock = threading.Lock()
        self.events: list[dict] = []

    def append(self, value: dict) -> None:
        value = {"hostUtc": dt.datetime.now(dt.timezone.utc).isoformat(), **value}
        with self.lock:
            self.events.append(value)
            self.output.write(json.dumps(value, ensure_ascii=False) + "\n")
            self.output.flush()
            os.fsync(self.output.fileno())

    def close(self) -> None:
        self.output.close()


class Adb:
    def __init__(self, executable: str, serial: str, journal: Journal):
        self.prefix = [executable, "-s", serial]
        self.journal = journal

    def call(self, *parts: str, timeout: int = 30, allow_missing: bool = False) -> str:
        completed = subprocess.run([*self.prefix, *parts], capture_output=True, timeout=timeout, check=False)
        stdout = completed.stdout.decode("utf-8", errors="replace")
        stderr = completed.stderr.decode("utf-8", errors="replace")
        self.journal.append({"kind": "adb_result", "arguments": list(parts), "returncode": completed.returncode,
                             "stdout": stdout, "stderr": stderr})
        if completed.returncode and not (allow_missing and completed.returncode == 1 and not stdout.strip() and not stderr.strip()):
            raise RuntimeError("ADB命令失败：" + stderr + stdout)
        return stdout


def identity_gate(adb: Adb, directory: Path, shared_apk: Path | None = None) -> dict:
    if adb.call("get-state").strip() != "device":
        raise RuntimeError("设备不是可用device状态")
    installed_path = parse_package_path(adb.call("shell", "pm", "path", EXPECTED["package"]))
    digest = parse_device_sha(adb.call("shell", "sha256sum", installed_path), installed_path)
    observed = {"installedPath": installed_path, "deviceSha256": digest, "expected": EXPECTED}
    write_json(directory / "device-hash-gate.json", observed)
    if digest != EXPECTED["sha256"]:
        raise RuntimeError("设备端APK摘要与目标困难补丁不符；拒绝push、spawn或附加Frida")
    local = shared_apk.resolve() if shared_apk else directory / "device-installed.apk"
    if shared_apk:
        local.relative_to(ROOT / "ai_training/hard_native_3000_20261022")
        local.parent.mkdir(parents=True, exist_ok=True)
    if not local.exists():
        adb.call("pull", installed_path, str(local), timeout=90)
    if file_sha256(local) != digest:
        raise RuntimeError("设备APK传输摘要不符")
    actual = inspect_apk(local)
    actual["artifactPath"] = str(local)
    write_json(directory / "device-static-identity.json", actual)
    require_identity(actual)
    return actual


def locate_java_bridge(requested: Path | None) -> Path:
    if requested is not None:
        bridge = requested.resolve()
    else:
        spec = importlib.util.find_spec("frida_tools")
        if spec is None or spec.origin is None:
            raise RuntimeError("缺少frida_tools Java bridge；请明确传 --java-bridge，不自动安装")
        bridge = Path(spec.origin).parent / "bridges" / "java.js"
    if not bridge.is_file():
        raise RuntimeError("Java bridge文件不存在：" + str(bridge))
    return bridge


def export_artifacts(exports, directory: Path) -> list[dict]:
    artifacts = exports.artifacts()
    destination = directory / "native"
    destination.mkdir()
    allowed = {"config.bin", "initial.bin", "final.bin", "actions.jsonl.gz", "states.bin.gz",
               "result.json", "worker-error.json", "decision-evidence.jsonl"}
    seen = set()
    for item in artifacts:
        name, size = item["name"], item["bytes"]
        if name not in allowed or name in seen or type(size) is not int or not 0 <= size <= 8 * 1024**3:
            raise RuntimeError("产物名称重复、未知或超过一局冒烟大小限制")
        seen.add(name)
        partial = destination / (name + ".partial")
        with partial.open("xb") as output:
            offset = 0
            while offset < size:
                if shutil.disk_usage(directory).free < 12 * 1024**3:
                    raise RuntimeError("电脑剩余空间不足12GiB，停止导出并保留手机原件")
                data = base64.b64decode(exports.chunk(name, offset, min(131072, size - offset)), validate=True)
                if not data or len(data) > min(131072, size - offset):
                    raise RuntimeError("产物分块长度不符")
                output.write(data)
                offset += len(data)
            output.flush()
            os.fsync(output.fileno())
        if file_sha256(partial) != item["sha256"]:
            raise RuntimeError("产物传输摘要不一致；保留partial与设备原件")
        partial.rename(destination / name)
    write_json(directory / "artifact-transfer.json", {"transferHashesVerified": True, "files": artifacts,
               "completeSuccessSet": SUCCESS_FILES.issubset(seen), "missingSuccessFiles": sorted(SUCCESS_FILES - seen),
               "nativeStrictReplayVerified": False})
    return artifacts


def verify_streams(directory: Path, result: dict) -> dict:
    actions = []
    with gzip.open(directory / "actions.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            actions.append(json.loads(line))
    count = 0
    with gzip.open(directory / "states.bin.gz", "rb") as stream:
        while True:
            prefix = stream.read(4)
            if not prefix:
                break
            if len(prefix) != 4:
                raise RuntimeError("状态长度头不完整")
            size = struct.unpack(">i", prefix)[0]
            if not 0 < size <= 64 * 1024**2 or len(stream.read(size)) != size:
                raise RuntimeError("原生状态长度不合法或数据截断")
            count += 1
    if count != result["actions"] or len(actions) != count:
        raise RuntimeError("状态、动作和结果数量不一致")
    for index, action in enumerate(actions):
        if (action.get("index"), action.get("parentId"), action.get("attemptId"), action.get("path")) != (
                index, result["parentId"], result["attemptId"], "hard_js_primary"):
            raise RuntimeError("动作身份、索引或路径不一致")
    return {"gzipFootersComplete": True, "actions": count, "states": count, "nativeStrictReplayVerified": False}


def verify_success_artifacts(directory: Path, result: dict) -> dict:
    native = directory / "native"
    missing = sorted(name for name in SUCCESS_FILES if not (native / name).is_file())
    if missing:
        raise RuntimeError("成功原生证据集合不完整：" + repr(missing))
    native_result = json.loads((native / "result.json").read_text(encoding="utf-8"))
    if native_result != result:
        raise RuntimeError("宿主workerResult与原生result.json不一致")
    transfer = json.loads((directory / "artifact-transfer.json").read_text(encoding="utf-8"))
    entries = transfer.get("files", [])
    by_name = {entry["name"]: entry for entry in entries}
    if (transfer.get("transferHashesVerified") is not True or transfer.get("completeSuccessSet") is not True
            or len(by_name) != len(entries) or not SUCCESS_FILES.issubset(by_name)):
        raise RuntimeError("传输证据未证明必需文件集合及摘要完整")
    for name in SUCCESS_FILES:
        path, entry = native / name, by_name[name]
        if path.stat().st_size <= 0 or path.stat().st_size != entry["bytes"] or file_sha256(path) != entry["sha256"]:
            raise RuntimeError("必需产物的字节数或摘要不一致：" + name)
    return {"successEvidenceSetComplete": True, "hostNativeResultEqual": True,
            "transferHashesVerified": True, **verify_streams(native, result)}


def verify_while_resident(args, directory: Path, journal: Journal) -> int:
    verifier, plan = args.verifier.resolve(), args.verification_plan.resolve()
    command = [sys.executable, str(verifier), "--attempt-dir", str(directory), "--adb", args.adb,
               "--device", args.device, "--frida-port", str(args.frida_port), "--plan", str(plan)]
    write_json(directory / "independent-verifier-command.json", {
        "command": command, "verifierSha256": file_sha256(verifier), "planSha256": file_sha256(plan),
        "collectorResident": True, "startedUtc": dt.datetime.now(dt.timezone.utc).isoformat()})
    started = time.monotonic()
    with (directory / "independent-verifier.stdout.log").open("xb") as stdout, (directory / "independent-verifier.stderr.log").open("xb") as stderr:
        process = subprocess.Popen(command, cwd=ROOT, stdout=stdout, stderr=stderr)
        journal.append({"kind": "independent_verifier_started", "hostPid": process.pid, "collectorResident": True})
        last_progress = 0.0
        try:
            while process.poll() is None:
                if time.monotonic() - last_progress >= 30:
                    progress = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "phase": "independent_verification",
                                "parentId": args.parent_id, "verifierHostPid": process.pid, "collectorResident": True}
                    (directory / "progress.json").write_text(json.dumps(progress, ensure_ascii=False), encoding="utf-8")
                    print(json.dumps(progress, ensure_ascii=False), flush=True)
                    last_progress = time.monotonic()
                try:
                    process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    continue
                except KeyboardInterrupt:
                    print("独立重放仍在运行，采集器继续驻留等待完成，不调度新动作。", flush=True)
        finally:
            # 不因宿主中断或日志错误卸载仍在进行的独立原生重放。
            while process.poll() is None:
                try:
                    process.wait(timeout=1)
                except (subprocess.TimeoutExpired, KeyboardInterrupt):
                    continue
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
    write_json(directory / "independent-verifier-exit.json", {
        "returncode": process.returncode, "hostPid": process.pid, "wallSeconds": time.monotonic() - started,
        "collectorResident": True, "endedUtc": dt.datetime.now(dt.timezone.utc).isoformat()})
    journal.append({"kind": "independent_verifier_exited", "hostPid": process.pid,
                    "returncode": process.returncode, "collectorResident": True})
    return process.returncode


def run_resident(adb: Adb, args, directory: Path, job: dict, journal: Journal) -> dict:
    # 现有进程没有可证明的首次启动历史，绝不自动停止或附加。
    if adb.call("shell", "su", "-c", "'pidof " + EXPECTED["package"] + "'", allow_missing=True).strip():
        raise RuntimeError("发现已有应用进程；无法证明困难单例空闲，拒绝运行。此入口不自动force-stop")
    if not args.base_config_zip or not args.base_config_entry:
        raise ValueError("执行冒烟需要明确的 --base-config-zip 与 --base-config-entry")
    requested_zip = args.base_config_zip.resolve()
    base_zip = directory / "base-config.zip"
    shutil.copy2(requested_zip, base_zip)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.bin", args.base_config_entry):
        raise ValueError("配置条目必须是明确的bin文件名")
    with zipfile.ZipFile(base_zip) as archive:
        matches = [item for item in archive.infolist() if item.filename == args.base_config_entry]
        if len(matches) != 1 or not 0 < matches[0].file_size <= 8 * 1024**2:
            raise ValueError("配置ZIP条目缺失、重复、为空或过大")
    write_json(directory / "base-config-identity.json", {"requestedZipPath": str(requested_zip), "frozenZipPath": str(base_zip), "zipSha256": file_sha256(base_zip),
                                                        "entry": args.base_config_entry})
    bridge = locate_java_bridge(args.java_bridge)
    bridge_bytes = bridge.read_bytes()
    (directory / "source" / "frida-java-bridge.js").write_bytes(bridge_bytes)
    write_json(directory / "runtime-source-sha256.json", {path.name: file_sha256(path) for path in (directory / "source").iterdir()})
    remote_stage = "/data/local/tmp/aeii-hard-collect-" + job["attemptId"]
    adb.call("shell", "mkdir", remote_stage)
    remote_zip = remote_stage + "/base-config.zip"
    adb.call("push", str(base_zip), remote_zip)
    if parse_device_sha(adb.call("shell", "sha256sum", remote_zip), remote_zip) != file_sha256(base_zip):
        raise RuntimeError("配置ZIP设备端传输摘要不符")
    # ADB选择明确设备建立一次性转发，避免任意远程端点连接到另一台设备。
    port = adb.call("forward", "tcp:0", "tcp:" + str(args.frida_port)).strip()
    if not port.isdigit():
        raise RuntimeError("无法取得本次ADB转发端口")
    device = None
    session = script = None
    pid = None
    resumed = False
    detached = threading.Event()
    bootstrap = threading.Event()
    script_failed = threading.Event()
    status = {"workerAlive": None, "fatal": None, "cleanup": "not_started"}
    exports = None
    try:
        import frida
        device = frida.get_device_manager().add_remote_device("127.0.0.1:" + port)
        # 再查一次进程，仍有竞争则由新进程bootstrap静态门禁进一步拒绝。
        if adb.call("shell", "su", "-c", "'pidof " + EXPECTED["package"] + "'", allow_missing=True).strip():
            raise RuntimeError("准备期间出现应用进程，拒绝spawn")
        pid = device.spawn([EXPECTED["package"]])
        journal.append({"kind": "spawned_suspended", "pid": pid})
        raw_stat = adb.call("shell", "su", "-c", f"'cat /proc/{pid}/stat'").strip()
        start_ticks = raw_stat.rsplit(")", 1)[1].split()[19]
        write_json(directory / "owned-process.json", {
            "pid": pid, "startTimeTicks": start_ticks, "procStarttime": start_ticks,
            "device": args.device, "package": EXPECTED["package"],
            "fridaRemotePort": args.frida_port,
            "parentId": job["parentId"], "attemptId": job["attemptId"], "launcherOwned": True,
        })
        session = device.attach(pid)
        session.on("detached", lambda *details: (journal.append({"kind": "session_detached", "details": str(details)}), detached.set()))
        source = bridge_bytes.decode("utf-8") + "\nglobalThis.Java=bridge;\nconst HARD_EXPECTED=" + json.dumps(EXPECTED) + ";\n"
        source += (directory / "source/audit_contract.js").read_text(encoding="utf-8") + "\n" + (directory / "source/resident_collect.frida.js").read_text(encoding="utf-8")
        script = session.create_script(source, name="原生困难一局候选采集器")

        def on_message(message, _data):
            payload = message.get("payload") if message.get("type") == "send" else {"kind": "frida_error", "raw": message}
            if not isinstance(payload, dict):
                payload = {"kind": "frida_unexpected_message", "raw": str(payload)}
            journal.append(payload)
            if payload.get("kind") == "bootstrap_ready":
                bootstrap.set()
            if payload.get("kind") in {"bootstrap_error", "frida_error", "frida_unexpected_message", "audit_write_error"}:
                script_failed.set()

        script.on("message", on_message)
        script.load()
        if not bootstrap.wait(10) or script_failed.is_set():
            raise RuntimeError("新进程框架观察入口未就绪，拒绝启动采集")
        device.resume(pid)
        resumed = True
        exports = script.exports_sync
        ready_deadline = time.monotonic() + 30
        while time.monotonic() < ready_deadline:
            if detached.is_set() or script_failed.is_set():
                raise RuntimeError("应用bootstrap观察失败")
            status = exports.status()
            if status.get("ready"):
                break
            if status.get("fatal"):
                raise RuntimeError("应用独占准备失败：" + str(status["fatal"]))
            time.sleep(0.25)
        else:
            raise RuntimeError("30秒内未观察到首次Activity绑定，不启动采集")
        config = {"package": EXPECTED["package"], "job": job, "baseConfigZip": remote_zip,
                  "baseConfigName": args.base_config_entry,
                  "nativeRoot": "/data/user/0/" + EXPECTED["package"] + "/files/.aeii-hard-collect/" + job["attemptId"]}
        write_json(directory / "launch-config.json", config)
        try:
            status = exports.start(config, (directory / "source/native_engine_collect.rhino.js").read_text(encoding="utf-8"),
                                   (directory / "source/worker_collect.rhino.js").read_text(encoding="utf-8"))
        except Exception as error:
            # 线程先注册再启动；启动RPC失败后也检查真实线程，不能按RPC结果直接detach。
            journal.append({"kind": "start_rpc_error", "error": str(error)})
            status = exports.status()
            if not status.get("hasRun"):
                raise
        deadline = time.monotonic() + args.max_seconds
        cancelled = False
        last_resource = 0.0
        while True:
            if detached.is_set():
                raise RuntimeError("采集进程已退出或连接丢失，证据不完整")
            try:
                status = exports.status()
                now = time.monotonic()
                if now - last_resource >= 30:
                    raw = adb.call("shell", "dumpsys battery; df -k /data")
                    battery = re.search(r"^\s*level:\s*(\d+)", raw, re.MULTILINE)
                    temperature = re.search(r"^\s*temperature:\s*(\d+)", raw, re.MULTILINE)
                    disk = [line.split() for line in raw.splitlines() if line.startswith("/dev/")]
                    if not battery or not temperature or len(disk) != 1:
                        raise RuntimeError("运行中资源读数不完整")
                    if int(battery[1]) < 20 or int(temperature[1]) >= 450 or int(disk[0][3]) < 2 * 1024**2:
                        exports.cancel()
                        cancelled = True
                        journal.append({"kind": "resource_stop", "battery": int(battery[1]), "temperature": int(temperature[1]) / 10})
                    progress = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                                "parentId": job["parentId"], "attemptId": job["attemptId"],
                                "pid": pid, "status": status}
                    (directory / "progress.json").write_text(json.dumps(progress, ensure_ascii=False), encoding="utf-8")
                    print(json.dumps({"phase": "collecting", "parentId": job["parentId"],
                                      "actions": status.get("committedActions"),
                                      "battery": int(battery[1]), "celsius": int(temperature[1]) / 10}, ensure_ascii=False), flush=True)
                    last_resource = now
                if status.get("workerAlive") is False:
                    break
                if (time.monotonic() >= deadline or script_failed.is_set()) and not cancelled:
                    exports.cancel()
                    cancelled = True
                    journal.append({"kind": "cancel_requested", "reason": "墙钟上限或Frida异常", "residentUntilWorkerStops": True})
                time.sleep(0.5)
            except KeyboardInterrupt:
                # 中止只阻止后续决策；在途桥接不能通过强制detach伪装排空。
                if not cancelled:
                    exports.cancel()
                    cancelled = True
                print("已请求停止，继续驻留等待原生线程退出；不会调度下一局。", flush=True)
        status = exports.finish()
        write_json(directory / "resident-final-status.json", status)
        if status.get("pendingCallbacks") or status.get("pageLoadPending"):
            journal.append({"kind": "artifact_export_refused", "reason": "仍有在途UI回调；设备原件保留，需进程恢复后另行取证"})
        else:
            try:
                export_artifacts(exports, directory)
            except Exception as error:
                journal.append({"kind": "artifact_export_error", "error": str(error)})
        final_status = exports.status()
        write_json(directory / "resident-after-export.json", final_status)
        if args.verify_before_detach:
            if (final_status.get("workerAlive") is False and final_status.get("cleanup") == "safe"
                    and final_status.get("fatal") is None and final_status.get("pendingCallbacks") == 0
                    and final_status.get("pageLoadPending") is False and final_status.get("workerResult") is not None):
                verify_while_resident(args, directory, journal)
                final_status = exports.status()
                write_json(directory / "resident-after-verification.json", final_status)
            else:
                write_json(directory / "independent-verifier-skipped.json", {"reason": "采集未安全完成，不启动独立重放", "status": final_status})
        return final_status
    finally:
        try:
            # 运行中的原生线程无论RPC是否失败都不得被旧的done语义提前卸钩。
            if exports is not None and not detached.is_set():
                while True:
                    try:
                        current = exports.status()
                        if current.get("workerAlive") is not True:
                            break
                        exports.cancel()
                        print("原生线程尚在运行，保留Frida驻留并等待退出。", flush=True)
                        time.sleep(1)
                    except KeyboardInterrupt:
                        continue
                    except Exception:
                        if detached.wait(1):
                            break
                        print("无法确认原生线程停止，继续保留会话等待进程退出。", flush=True)
            if session is not None and not detached.is_set():
                session.detach()
            if pid is not None and not resumed:
                # 没有启动采集时仅解除本次spawn的悬挂，不终止或清理应用数据。
                try:
                    device.resume(pid)
                    journal.append({"kind": "resume_without_collection", "pid": pid})
                except Exception as error:
                    journal.append({"kind": "resume_cleanup_error", "error": str(error)})
        finally:
            adb.call("forward", "--remove", "tcp:" + port)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="候选原生困难一局采集；不安装、不force-stop，不支持既有进程附加", add_help=False)
    result.add_argument("-h", "--help", action="help", help="显示中文参数说明并退出，不连接设备")
    mode = result.add_mutually_exclusive_group(required=True)
    mode.add_argument("--identity-only", action="store_true", help="只读核验设备APK，不push或启动应用")
    mode.add_argument("--execute-smoke", action="store_true", help="身份相符且没有既有进程时执行唯一一局冒烟")
    result.add_argument("--adb", default="adb", help="ADB可执行文件路径")
    result.add_argument("--device", required=True, help="明确的ADB设备序列号")
    result.add_argument("--frida-port", type=int, default=27042, help="设备本地Frida端口，范围1至65535")
    result.add_argument("--parent-id", default="hard-smoke-parent", help="父局身份；每次尝试另建唯一attempt目录")
    result.add_argument("--attempt-id", help="明确的本次尝试身份；已存在目录拒绝覆盖")
    result.add_argument("--shared-apk", type=Path, help="本轮共享只读APK副本，每局仍核验设备端摘要")
    result.add_argument("--map", default="(2) Duel.aem", help="APK官方地图文件名")
    result.add_argument("--seed", type=int, default=20261022, help="原生cfg seed；不控制HTML随机源")
    result.add_argument("--max-actions", type=int, default=50, help=f"原子动作上限1至{MAX_ACTIONS}，截断不算自然结束")
    result.add_argument("--max-seconds", type=int, default=180, help="墙钟上限；达到后请求停止并保持驻留直至线程退出")
    result.add_argument("--base-config-zip", type=Path)
    result.add_argument("--base-config-entry")
    result.add_argument("--java-bridge", type=Path)
    result.add_argument("--verify-before-detach", action="store_true", help="采集线程安全退出和导出后，保持会话驻留至独立验收子进程结束")
    result.add_argument("--verifier", type=Path, default=HERE / "verification/run.py", help="独立验收入口")
    result.add_argument("--verification-plan", type=Path, default=ROOT / "ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json")
    result.add_argument("--output-root", type=Path, default=ROOT / "ai_training/hard_native_3000_20261022/attempts")
    return result


def main() -> int:
    args = parser().parse_args()
    if not 1 <= args.frida_port <= 65535:
        raise ValueError("Frida设备端口必须在1至65535之间")
    if args.verify_before_detach and (not args.verifier.is_file() or not args.verification_plan.is_file()):
        raise ValueError("驻留独立验收的入口或冻结计划不存在")
    if args.max_seconds < 1 or args.max_seconds > 21600:
        raise ValueError("一局冒烟墙钟上限必须在1至21600秒")
    attempt_id = args.attempt_id or "hard-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:12]
    job = {"parentId": args.parent_id, "attemptId": attempt_id, "map": args.map, "seed": args.seed,
           "maxActions": args.max_actions, "requestedPlayerType": 3, "jsRngMode": "original_webview_rng"}
    validate_job(job)
    directory = args.output_root.resolve() / attempt_id
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "source").mkdir()
    for source in [HERE / name for name in ("launch_collect.py", "collect_contract.py", "contract.py",
                                          "resident_collect.frida.js", "audit_contract.js",
                                          "native_engine_collect.rhino.js", "worker_collect.rhino.js")]:
        shutil.copy2(source, directory / "source" / source.name)
    write_json(directory / "source-sha256.json", {path.name: file_sha256(path) for path in (directory / "source").iterdir()})
    write_json(directory / "request.json", {"mode": "identity_only" if args.identity_only else "one_smoke", "job": job,
                                          "device": args.device, "fridaRemotePort": args.frida_port,
                                          "expected": EXPECTED, "collectorAcceptancePassed": False})
    journal = Journal(directory / "host-events.jsonl")
    status = {"workerAlive": None, "fatal": "未执行", "cleanup": "not_started"}
    try:
        adb = Adb(args.adb, args.device, journal)
        identity_gate(adb, directory, args.shared_apk)
        if args.identity_only:
            write_json(directory / "identity-only-result.json", {"identityMatched": True, "collectionStarted": False})
            print("APK身份核验完成，未启动采集：" + str(directory))
            return 0
        status = run_resident(adb, args, directory, job, journal)
        result = status.get("workerResult")
        summary = summarize_evidence(journal.events, result, status)
        if result and all((directory / "native" / name).is_file() for name in SUCCESS_FILES):
            streams = verify_success_artifacts(directory, result)
            write_json(directory / "stream-verification.json", streams)
        else:
            summary["runtimeSmokeValid"] = False
            summary["artifactEvidenceIncomplete"] = True
        write_json(directory / "summary.json", summary)
        print(json.dumps({"directory": str(directory), **summary}, ensure_ascii=False))
        if args.verify_before_detach:
            receipt = directory / "independent-verifier-exit.json"
            report = directory / "verification.json"
            if (not receipt.is_file() or not report.is_file()
                    or json.loads(receipt.read_text(encoding="utf-8")).get("returncode") != 0
                    or json.loads(report.read_text(encoding="utf-8")).get("passed") is not True):
                return 4
        return 0 if summary["runtimeSmokeValid"] else 3
    except Exception as error:
        write_json(directory / "failure.json", {"error": str(error), "status": status, "collectorAcceptancePassed": False})
        journal.append({"kind": "host_failure", "error": str(error)})
        print("采集拒绝或失败，全部尝试证据保留于：" + str(directory) + "\n" + str(error), file=sys.stderr)
        return 2
    finally:
        journal.close()


if __name__ == "__main__":
    raise SystemExit(main())
