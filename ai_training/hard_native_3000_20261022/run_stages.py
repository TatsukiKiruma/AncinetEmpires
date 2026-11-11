"""顺序调用既有控制器完成1局、20局与3000局；不自行认定父局验收通过。"""

from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TOOLS = ROOT / "tools/phone_training_hard"
sys.path.insert(0, str(TOOLS))
import batch_controller as batch  # noqa: E402

PHASES = ("smoke", "acceptance", "formal")


def executable(value: str) -> str:
    path = Path(value)
    resolved = path.resolve() if path.is_file() else Path(shutil.which(value) or "")
    if not resolved.is_file():
        raise ValueError("可执行文件不存在：" + value)
    return str(resolved.resolve())


def build_protocol(args) -> dict:
    batch.load_plan(batch.DEFAULT_PLAN)
    import frida
    package = Path(frida.__file__).resolve().parent
    runtime_files = {str(path.relative_to(package)).replace("\\", "/"): batch.digest(path)
                     for path in sorted(package.rglob("*")) if path.is_file() and path.suffix in {".py", ".pyd"}}
    runtime_path = HERE / "assets/RUNTIME_ENVIRONMENT.json"
    declared = batch.read_json(runtime_path)
    if (frida.__version__ != declared["fridaVersion"] or str(package) != declared["fridaPackage"]
            or runtime_files != declared["fridaFilesSha256"] or os.environ.get("PYTHONPATH") != declared["pythonPath"]):
        raise RuntimeError("实际Frida依赖或Python隔离路径与本轮实机通过的环境不符")
    inputs = {name: {"path": str(path.resolve()), "sha256": batch.digest(path)} for name, path in (
        ("plan", batch.DEFAULT_PLAN), ("baseConfig", args.base_config_zip), ("javaBridge", args.java_bridge),
        ("runtimeDeclaration", runtime_path))}
    sources = batch.source_identity()
    commands = {}
    for index, phase in enumerate(PHASES):
        command = [args.python, str(TOOLS / "batch_controller.py"), "--phase", phase,
            "--run-dir", str(args.run_root / phase), "--plan", str(batch.DEFAULT_PLAN),
            "--adb", args.adb, "--device", args.device,
            "--frida-port", str(getattr(args, "frida_port", 27042)), "--python", args.python,
            "--base-config-zip", str(args.base_config_zip), "--base-config-entry", args.base_config_entry,
            "--java-bridge", str(args.java_bridge), "--max-actions", "20000", "--max-seconds", "21600",
            "--kill-via", "su", "--archive-device-copies", "--wait-resources"]
        if index:
            command.extend(["--prerequisite-run", str(args.run_root / PHASES[index - 1])])
        commands[phase] = command
    return {"schema": "native-hard-stage-driver-v1", "runRoot": str(args.run_root),
        "driver": {"path": str(Path(__file__).resolve()), "sha256": batch.digest(Path(__file__))},
        "device": args.device, "fridaPort": getattr(args, "frida_port", 27042), "expectedDeviceApk": batch.EXPECTED,
        "executables": {name: {"path": path, "sha256": batch.digest(Path(path))}
                        for name, path in (("python", args.python), ("adb", args.adb))},
        "inputs": inputs, "baseConfigEntry": args.base_config_entry, "collectorSources": sources,
        "fridaClient": {"version": frida.__version__, "package": str(package), "fileHashes": runtime_files,
                        "pythonPath": os.environ.get("PYTHONPATH")},
        "collectorSourceSha256": batch.object_sha(sources), "commands": commands,
        "phaseSequence": list(PHASES), "targets": batch.PHASE_COUNTS,
        "preflightGamesCountToward3000": False, "archiveDeviceCopies": True, "waitResources": True,
        "qualificationAuthority": "tools/phone_training_hard/batch_controller.py及其独立验收回执"}


def bind_protocol(args) -> dict:
    expected = build_protocol(args)
    path = args.run_root / "PROTOCOL.json"
    if path.exists():
        actual = batch.read_json(path)
        actual.pop("createdUtc", None)
        if actual != expected:
            raise RuntimeError("重启参数、驱动、输入或采集来源改变；拒绝修改既有PROTOCOL")
        if batch.digest(args.run_root / "driver-source.py") != expected["driver"]["sha256"]:
            raise RuntimeError("本轮保存的驱动源码副本改变")
    else:
        if any(path.name not in {"controller.lock", "sessions"} for path in args.run_root.iterdir()):
            raise RuntimeError("新轮次目录含未登记内容；拒绝接管历史阶段或覆盖证据")
        with (args.run_root / "driver-source.py").open("xb") as output:
            output.write(Path(__file__).read_bytes())
            output.flush()
            os.fsync(output.fileno())
        if batch.digest(args.run_root / "driver-source.py") != expected["driver"]["sha256"]:
            raise RuntimeError("冻结驱动副本时源文件变化")
        batch.write_new(path, {"createdUtc": batch.utc(), **expected})
    return expected


def controller_state(directory: Path) -> dict:
    path = directory / "STATE.json"
    if not path.exists():
        return {}
    try:
        return batch.read_json(path)
    except (OSError, ValueError) as error:
        return {"stateReadError": str(error)}


def pipeline_state(root: Path, session: Path, phase: str | None, stage: str,
                   child_pid: int | None = None, child_running: bool = False, error: str | None = None) -> None:
    reported = controller_state(root / phase) if phase else {}
    batch.write_status(root / "PIPELINE_STATE.json", {
        "updatedUtc": batch.utc(), "stage": stage, "phase": phase, "driverPID": os.getpid(),
        "session": str(session), "childPID": child_pid, "childRunning": child_running,
        "qualifiedParents": reported.get("qualifiedParents", 0),
        "formalQualifiedParents": controller_state(root / "formal").get("formalQualifiedParents", 0),
        "countsAreControllerReported": True, "childSTATE": reported, "error": error})


def wait_safely(process) -> None:
    # 驱动异常时仍持有OS锁等待子控制器；不终止在途原生采集或另开一份控制器。
    while process.poll() is None:
        try:
            process.wait(timeout=15)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            continue


def run_phase(args, protocol: dict, session: Path, phase: str) -> tuple[int, bool]:
    if build_protocol(args) != protocol:
        raise RuntimeError("阶段开始前冻结身份改变，停止调度")
    command = protocol["commands"][phase]
    batch.write_new(session / (phase + ".command.json"), {"utc": batch.utc(), "command": command})
    print("开始阶段：" + phase + "，父局验收交由既有控制器。", flush=True)
    interrupted = False
    with (session / (phase + ".stdout.log")).open("xb") as stdout, (session / (phase + ".stderr.log")).open("xb") as stderr:
        process = subprocess.Popen(command, cwd=ROOT, stdout=stdout, stderr=stderr)
        try:
            batch.write_new(session / (phase + ".child.json"), {"startedUtc": batch.utc(), "childPID": process.pid})
            while True:
                pipeline_state(args.run_root, session, phase, "running", process.pid, process.poll() is None)
                try:
                    code = process.wait(timeout=15)
                    break
                except subprocess.TimeoutExpired:
                    continue
                except KeyboardInterrupt:
                    if not interrupted:
                        print("已记录停止请求，保持等待当前子控制器安全退出；不进入下一阶段。", flush=True)
                    interrupted = True
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
        except BaseException:
            wait_safely(process)
            raise
    batch.write_new(session / (phase + ".exit.json"), {"exitedUtc": batch.utc(), "returncode": code,
        "childPID": process.pid, "stopAfterChildRequested": interrupted})
    pipeline_state(args.run_root, session, phase, "stage_exited" if code == 0 else "stopped_on_child_failure",
                   process.pid, False, None if code == 0 else "子控制器非零退出：" + str(code))
    if code == 0:
        completion = args.run_root / phase / "complete.json"
        if not completion.is_file():
            raise RuntimeError("子控制器退出0但缺少完整阶段回执，禁止进入下一阶段")
        completed = batch.read_json(completion)
        if (completed.get("passed") is not True or completed.get("phase") != phase
                or completed.get("qualifiedParents") != batch.PHASE_COUNTS[phase]):
            raise RuntimeError("子控制器退出0但没有对应的完整阶段回执，禁止进入下一阶段")
    print("阶段退出：" + phase + "，退出码 " + str(code) + "。", flush=True)
    return code, interrupted


def execute(args, protocol: dict, session: Path) -> int:
    # 每次从smoke开始调用controller验证恢复；不凭文件存在跳过任何门禁。
    for phase in PHASES:
        code, interrupted = run_phase(args, protocol, session, phase)
        if code != 0 or interrupted:
            pipeline_state(args.run_root, session, phase, "stopped", error="阶段失败或已请求停止；没有自动重试")
            return code if code > 0 else 4 if interrupted else 2
    if build_protocol(args) != protocol:
        raise RuntimeError("所有子阶段结束后冻结身份发生改变")
    batch.write_new(session / "result.json", {"allStagesExitedZero": True, "completedUtc": batch.utc(),
        "phaseCompletionHashes": {phase: batch.digest(args.run_root / phase / "complete.json") for phase in PHASES},
        "qualificationAuthority": protocol["qualificationAuthority"]})
    pipeline_state(args.run_root, session, "formal", "complete")
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__, add_help=False)
    result.add_argument("-h", "--help", action="help", help="显示中文说明，不连接设备")
    result.add_argument("--run-root", type=Path, required=True, help="本轮目录内独立新目录；相同参数可恢复")
    result.add_argument("--adb", required=True, help="ADB可执行文件")
    result.add_argument("--device", required=True, help="明确ADB序列号")
    result.add_argument("--frida-port", type=batch.parse_frida_port, default=27042, help="设备端Frida监听端口，默认27042，范围1至65535")
    result.add_argument("--base-config-zip", type=Path, required=True)
    result.add_argument("--base-config-entry", required=True)
    result.add_argument("--java-bridge", type=Path, required=True)
    result.add_argument("--python", default=sys.executable, help="Python解释器，默认当前解释器")
    return result


def main() -> int:
    args = parser().parse_args()
    args.run_root = args.run_root.resolve()
    if args.run_root == HERE or not args.run_root.is_relative_to(HERE):
        raise ValueError("--run-root必须在本轮目录内另建独立子目录")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", args.device) or not re.fullmatch(r"[A-Za-z0-9_.-]+\.bin", args.base_config_entry):
        raise ValueError("设备序列号或配置条目格式不安全")
    args.python, args.adb = executable(args.python), executable(args.adb)
    args.base_config_zip, args.java_bridge = args.base_config_zip.resolve(), args.java_bridge.resolve()
    args.run_root.mkdir(parents=True, exist_ok=True)
    with batch.run_lock(args.run_root):
        sessions = args.run_root / "sessions"
        sessions.mkdir(exist_ok=True)
        session = sessions / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8])
        session.mkdir()
        bound = False
        try:
            protocol = bind_protocol(args)
            bound = True
            pipeline_state(args.run_root, session, None, "starting")
            return execute(args, protocol, session)
        except (Exception, KeyboardInterrupt) as error:
            batch.write_new(session / "failure.json", {"utc": batch.utc(), "error": str(error), "automaticRetry": False})
            if bound:
                previous = batch.read_json(args.run_root / "PIPELINE_STATE.json") if (args.run_root / "PIPELINE_STATE.json").exists() else {}
                pipeline_state(args.run_root, session, previous.get("phase"), "stopped_on_failure", error=str(error))
            print("阶段驱动停止，证据保留：" + str(error), file=sys.stderr, flush=True)
            return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
