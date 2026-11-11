"""独立验收七件原生证据；严格重放与可靠自然终局资格分别保存。"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, str(HERE.parent))
from contract import EXPECTED, SUCCESS_FILES, require_identity  # noqa: E402


def sha(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, value) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def source_hashes() -> dict:
    paths = set(HERE.glob("*.py")) | set(HERE.glob("*.ts")) | set(HERE.glob("*.js"))
    paths |= set((ROOT / "src/game").rglob("*.ts"))
    paths |= set((ROOT / "ai_training/data_acceptance_20261016/native_reader").glob("*.ts"))
    paths |= {ROOT / name for name in ["ai_training/data_acceptance_20261016/phone/projection.ts", "ai_training/data_acceptance_20261016/phone/semantic_actions.ts", "tools/apk_game_get_validate.ts", "tools/phone_training_hard/contract.py"]}
    return {str(path.relative_to(ROOT)).replace("\\", "/"): sha(path) for path in sorted(paths)}


def evidence(directory: Path, result: dict, job: dict) -> dict:
    events = [json.loads(line) for line in (directory / "native/decision-evidence.jsonl").read_text(encoding="utf-8").splitlines() if line]
    count = result.get("actions")
    if type(count) is not int or count < 1:
        raise ValueError("没有可验收动作")
    forbidden = {"fatal", "ordinary_ai", "hard_fallback_required", "hard_java_fallback_started", "create_action_rejected", "unexpected_lifecycle", "unexpected_selection", "decision_error", "apk_bridge_error", "browser_error", "frida_error", "bootstrap_error", "frida_unexpected_message"}
    if any(event.get("kind") in forbidden for event in events):
        raise ValueError("困难证据包含回退、普通AI或运行错误")
    stages = ["decision_begin", "decision_return", "decision_accepted", "action_committed"]
    observed = [event for event in events if event.get("kind") in stages]
    if len(observed) != count * 4:
        raise ValueError("决策闭环事件数量不符")
    for index in range(count):
        chain = observed[index * 4:(index + 1) * 4]
        if [row.get("kind") for row in chain] != stages:
            raise ValueError("决策闭环顺序不符")
        if any(row.get("parentId") != job["parentId"] or row.get("attemptId") != job["attemptId"] or row.get("actionIndex") != index for row in chain):
            raise ValueError("决策闭环身份不符")
        returned, accepted, committed = chain[1:]
        if any(row.get("path") != "hard_js_primary" for row in (returned, accepted, committed)) or returned.get("returnedId") is None or returned.get("returnedId") != accepted.get("actionId"):
            raise ValueError("提交动作未绑定困难JS主路径返回对象")
    return {"decisionChainsClosed": True, "decisionCount": count, "allCommittedFromHardJsPrimary": True, "forbiddenEvents": 0}


def proc_starttime(text: str) -> str:
    # comm字段可含空格和括号；最后右括号以后第20项才是/proc/stat字段22。
    tail = text[text.rfind(")") + 2:].split()
    if len(tail) < 20 or not tail[19].isdigit():
        raise ValueError("无法读取唯一进程starttime")
    return tail[19]


def frida_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Frida端口必须是1至65535的整数") from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Frida端口必须在1至65535之间")
    return port


def native_replay(args, directory: Path, job: dict, hashes: dict) -> dict:
    owned = load(directory / "owned-process.json")
    if owned.get("launcherOwned") is not True or owned.get("device") != args.device or owned.get("package") != EXPECTED["package"] or owned.get("parentId") != job["parentId"] or owned.get("attemptId") != job["attemptId"] or type(owned.get("pid")) is not int:
        raise ValueError("不是本次launcher拥有的明确进程")
    def adb(*parts):
        completed = subprocess.run([args.adb, "-s", args.device, *parts], capture_output=True, check=True, timeout=30)
        return completed.stdout.decode("utf-8").strip()
    pid = str(owned["pid"])
    expected_start = str(owned.get("procStarttime", owned.get("startTimeTicks", "")))
    def owned_proc(name: str) -> str:
        # Android 10限制shell读其他UID的/proc；仅用root读取明确已登记PID的这两个字段。
        if name not in {"stat", "cmdline"} or not pid.isdigit():
            raise ValueError("不支持的进程只读字段")
        return adb("shell", "su", "-c", "'cat /proc/" + pid + "/" + name + "'")
    if not expected_start.isdigit() or proc_starttime(owned_proc("stat")) != expected_start:
        raise ValueError("原采集PID已退出或被复用")
    command = owned_proc("cmdline").strip("\x00")
    if command != EXPECTED["package"]:
        raise ValueError("PID包名不符")
    bridge = directory / "source/frida-java-bridge.js"
    if not bridge.is_file():
        raise ValueError("缺少此次采集冻结的Frida Java bridge")
    port = adb("forward", "tcp:0", "tcp:" + str(args.frida_port))
    if not port.isdigit():
        raise ValueError("ADB转发端口无效")
    session = None
    try:
        import frida
        device = frida.get_device_manager().add_remote_device("127.0.0.1:" + port)
        session = device.attach(owned["pid"])
        source = bridge.read_text(encoding="utf-8") + "\nglobalThis.Java=bridge;\n" + (HERE / "replay.frida.js").read_text(encoding="utf-8")
        script = session.create_script(source, name="困难轨迹独立完整快照重放")
        errors = []
        script.on("message", lambda message, _: errors.append(message) if message.get("type") == "error" else None)
        script.load()
        launch = load(directory / "launch-config.json")
        replay_job = {"parentId": job["parentId"], "attemptId": job["attemptId"], "nativeRoot": launch.get("nativeRoot"), "expectedActions": load(directory / "native/result.json")["actions"], "artifactHashes": hashes, "verifierSourceSha256": sha(HERE / "replay.rhino.js")}
        replay = script.exports_sync.replay(replay_job, (HERE / "replay.rhino.js").read_text(encoding="utf-8"))
        if errors:
            raise RuntimeError("独立Frida重放脚本错误：" + repr(errors))
        if proc_starttime(owned_proc("stat")) != expected_start:
            raise ValueError("重放期间进程身份变化")
        replay["ownedPid"] = owned["pid"]
        replay["procStarttime"] = expected_start
        replay["fridaJavaBridgeSha256"] = sha(bridge)
        replay["fridaRemotePort"] = args.frida_port
        replay["adbForwardLocalPort"] = int(port)
        return replay
    finally:
        if session is not None:
            session.detach()
        adb("forward", "--remove", "tcp:" + port)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument("-h", "--help", action="help", help="显示中文说明并退出，不连接设备")
    parser.add_argument("--attempt-dir", type=Path, required=True, help="已安全停止的单次尝试目录")
    parser.add_argument("--adb", default="adb", help="ADB可执行文件")
    parser.add_argument("--device", required=True, help="明确的ADB设备序列号")
    parser.add_argument("--frida-port", type=frida_port, default=27042, help="设备Frida服务端口，默认27042，范围1至65535")
    parser.add_argument("--plan", type=Path, default=ROOT / "ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json", help="冻结的官方默认开局采样计划")
    parser.add_argument("--node", default="node", help="Node可执行文件")
    args = parser.parse_args()
    directory = args.attempt_dir.resolve()
    destination = directory / "verification.json"
    if destination.exists():
        raise FileExistsError("已有验收回执，拒绝覆盖：" + str(destination))
    report = {"schema": "native-hard-independent-verification-v1", "createdUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "passed": False, "nativeReplayVerified": False, "projectStrictVerified": False, "initialPlanMatched": False,
              "reliableValue": False, "valueEligible": False, "policyEligible": False, "forced": False,
              "fridaRemotePort": args.frida_port, "device": args.device}
    try:
        sources = source_hashes()
        hashes = {name: sha(directory / "native" / name) for name in sorted(SUCCESS_FILES)}
        job = load(directory / "request.json")["job"]
        result = load(directory / "native/result.json")
        report.update({"parentId": job["parentId"], "attemptId": job["attemptId"], "apkSha256": EXPECTED["sha256"], "resultSha256": hashes["result.json"], "artifactHashes": hashes, "sourceHashes": sources, "planSha256": sha(args.plan)})
        require_identity(load(directory / "device-static-identity.json"))
        gate = load(directory / "device-hash-gate.json")
        if gate.get("deviceSha256") != EXPECTED["sha256"]:
            raise ValueError("设备APK动态摘要门禁失败")
        for key in ("parentId", "attemptId", "map", "seed"):
            if result.get(key) != job.get(key):
                raise ValueError("结果身份与请求不符：" + key)
        if result.get("strategyFamily") != "apk_hard_js" or result.get("jsRngMode") != "original_webview_rng" or result.get("jsSeedControlled") is not False or result.get("rngModified") is not False:
            raise ValueError("困难策略身份或随机源契约不符")
        status = load(directory / "resident-after-export.json")
        if status.get("workerAlive") is not False or status.get("cleanup") != "safe" or status.get("pendingCallbacks") != 0 or status.get("pageLoadPending") is not False or status.get("fatal") is not None or status.get("workerResult") != result:
            raise ValueError("无法证明采集线程已安全停止并且结果一致")
        report["decisionEvidence"] = evidence(directory, result, job)
        transfer = load(directory / "artifact-transfer.json")
        entries = transfer.get("files", [])
        by_name = {row["name"]: row for row in entries}
        if len(by_name) != len(entries) or transfer.get("transferHashesVerified") is not True or transfer.get("completeSuccessSet") is not True:
            raise ValueError("原生传输集合身份无效")
        for name, digest in hashes.items():
            item = by_name.get(name, {})
            if item.get("sha256") != digest or item.get("bytes") != (directory / "native" / name).stat().st_size:
                raise ValueError("原生传输大小/摘要不一致：" + name)
        projected_path = directory / "project-strict-verification.json"
        completed = subprocess.run([args.node, "--import", "tsx", str(HERE / "project_strict.ts"), str(directory), str(args.plan.resolve()), str(projected_path)], cwd=ROOT, capture_output=True, timeout=1800)
        (directory / "project-strict.stdout.log").write_bytes(completed.stdout)
        (directory / "project-strict.stderr.log").write_bytes(completed.stderr)
        projected = load(projected_path)
        report["projectStrict"] = projected
        report["projectStrictVerified"] = projected.get("projectStrictVerified") is True
        report["initialPlanMatched"] = projected.get("initialPlanMatched") is True
        # 独立原生验收即使项目转移失败也仍执行，保留两个引擎各自的结论。
        replay = native_replay(args, directory, job, hashes)
        save(directory / "native-replay-verification.json", replay)
        report["nativeReplay"] = replay
        report["nativeReplayVerified"] = replay.get("nativeReplayVerified") is True and replay.get("artifactHashes") == hashes and replay.get("verifierSourceSha256") == sha(HERE / "replay.rhino.js")
        if hashes != {name: sha(directory / "native" / name) for name in sorted(SUCCESS_FILES)} or sources != source_hashes():
            raise ValueError("验收期间输入或源码变化")
        report["passed"] = report["nativeReplayVerified"] and report["projectStrictVerified"] and report["initialPlanMatched"]
        report["policyEligible"] = report["passed"]
        report["reliableValue"] = report["passed"] and projected.get("reliableNaturalOutcome") is True
        report["valueEligible"] = report["reliableValue"]
        report["qualification"] = "独立原生完整序列化快照相等及项目投影strict验收；原生完整候选mask未独立查询；训练准入仍须父局去重和数据切分"
    except Exception as error:
        report["error"] = str(error)
    save(destination, report)
    print(json.dumps({key: report.get(key) for key in ("parentId", "attemptId", "passed", "nativeReplayVerified", "projectStrictVerified", "initialPlanMatched", "reliableValue", "error")}, ensure_ascii=False))
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
