"""直接收集1000局手机原始轨迹；独立规则重放后置，不运行验收阶段。"""

from __future__ import annotations

import argparse
from collections import Counter
import datetime as dt
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TOOLS = ROOT / "tools/phone_training_hard"
sys.path.insert(0, str(TOOLS))
import batch_controller as common  # noqa: E402
import launch_collect as launcher  # noqa: E402

MAPS = ("(2) Crossed swords.aem", "(2) Duel.aem", "(2) Icy Paths.aem", "(2) Liberty Port.aem",
        "(2) Mourningstar.aem", "(2) Peak Island.aem", "(2) Swamplands.aem", "(2) The Crossing.aem")
SOURCE_NAMES = ("launch_collect.py", "collect_contract.py", "contract.py", "batch_controller.py",
                "resident_collect.frida.js", "audit_contract.js", "native_engine_collect.rhino.js", "worker_collect.rhino.js")


def load_plan(path: Path) -> dict:
    plan = common.read_json(path)
    jobs = plan.get("jobs", [])
    if (plan.get("schema") != "native-hard-phone-collection-1000-v1" or plan.get("total") != 1000
            or len(jobs) != 1000 or plan.get("apkSha256") != common.EXPECTED["sha256"]
            or Counter(job["map"] for job in jobs) != Counter({name: 125 for name in MAPS})
            or len({job["parentId"] for job in jobs}) != 1000 or len({job["attemptId"] for job in jobs}) != 1000):
        raise ValueError("只接受本轮1000局、八图各125局的唯一父局队列")
    for job in jobs:
        if (any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", job[key]) for key in ("parentId", "attemptId"))
                or job.get("maxActions") != 20000 or type(job.get("seed")) is not int or not 0 <= job["seed"] < 2**31
                or job.get("mode") != "SD" or job.get("requestedPlayerType") != 3
                or job.get("jsRngMode") != "original_webview_rng"):
            raise ValueError("队列父局身份、原生seed或困难JS配置不符")
    return plan


def command(args, plan: dict, job: dict, directory: Path) -> list[str]:
    inputs = plan["inputs"]
    return [args.python, str(TOOLS / "launch_collect.py"), "--execute-smoke", "--adb", args.adb,
        "--device", args.device, "--frida-port", str(args.frida_port), "--parent-id", job["parentId"],
        "--attempt-id", job["attemptId"], "--map", job["map"], "--seed", str(job["seed"]),
        "--max-actions", "20000", "--max-seconds", "21600", "--base-config-zip", inputs["baseConfigZip"]["path"],
        "--base-config-entry", inputs["baseConfigEntry"], "--java-bridge", inputs["javaBridge"]["path"],
        "--shared-apk", inputs["sharedApk"]["path"], "--output-root", str(directory / "launcher")]


def protocol(args, plan: dict) -> dict:
    if plan.get("device") != args.device or plan.get("fridaPort") != args.frida_port:
        raise ValueError("CLI设备或端口与已下发PLAN不符")
    for key in ("baseConfigZip", "javaBridge", "sharedApk"):
        item = plan["inputs"][key]
        path = Path(item["path"])
        if not path.is_absolute() or common.digest(path) != item["sha256"]:
            raise ValueError("PLAN输入必须是摘要相符的绝对路径：" + key)
    paths = [Path(__file__).resolve(), HERE / "archive_transferred.py", *[TOOLS / name for name in SOURCE_NAMES]]
    return {"schema": "phone-collection-1000-run-v1", "planPath": str(args.plan), "planSha256": common.digest(args.plan),
        "device": args.device, "fridaPort": args.frida_port, "python": args.python, "adb": args.adb,
        "pythonPath": os.environ.get("PYTHONPATH"), "inputs": plan["inputs"], "independentReplayDeferred": True,
        "sources": {str(path): common.digest(path) for path in paths}}


class Queue:
    def __init__(self, args, plan: dict, identity: dict, session: Path):
        self.args, self.plan, self.identity, self.session = args, plan, identity, session
        self.journal = common.Journal(session / "events.jsonl")
        self.adb = common.Adb(args.adb, args.device, self.journal)
        self.counts = {"doneParents": 0, "naturalParents": 0, "truncatedParents": 0, "errorParents": 0}
        self.active = None
        self.child_pid = None
        self.stop_requested = False

    def state(self, stage: str, error: str | None = None) -> None:
        common.write_status(self.args.run_dir / "STATE.json", {"updatedUtc": common.utc(), "phase": "phone_collection",
            "stage": stage, "targetParents": 1000, **self.counts, "activeParent": self.active,
            "childPID": self.child_pid, "controllerPID": os.getpid(), "independentReplayDeferred": True, "error": error})

    def guard(self) -> None:
        if protocol(self.args, self.plan) != self.identity:
            raise RuntimeError("本轮来源或输入改变，停止原始采集队列")

    def resources(self) -> None:
        announced = False
        while True:
            self.guard()
            if self.adb.call("get-state").strip() != "device" or self.adb.call("get-serialno").strip() != self.args.device:
                raise RuntimeError("明确绑定的设备不可用")
            if self.adb.pids():
                raise RuntimeError("存在未知应用进程，不停止或附加它")
            resources = common.parse_resources(self.adb.call("shell", "dumpsys", "battery"),
                self.adb.call("shell", "df", "-k", "/data"), __import__("shutil").disk_usage(self.args.run_dir).free)
            try:
                common.require_resources(resources, {"minBatteryPercent": 25, "maxTemperatureC": 42,
                    "minHostFreeBytes": 12 * 1024**3, "minDeviceFreeBytes": 2 * 1024**3})
                return
            except RuntimeError:
                self.state("waiting_resources")
                if not announced:
                    print("资源不足，等待恢复后继续队列；尚未启动本父局。", flush=True)
                    announced = True
                time.sleep(30)

    def collect(self, job: dict, directory: Path) -> None:
        from archive_transferred import archive_transferred_device_copies
        self.active = job["parentId"]
        self.resources()
        directory.mkdir(parents=True, exist_ok=False)
        invocation = command(self.args, self.plan, job, directory)
        common.write_new(directory / "request.json", {"job": job, "command": invocation, "planSha256": self.identity["planSha256"]})
        self.state("collecting")
        with (directory / "launcher.stdout.log").open("xb") as stdout, (directory / "launcher.stderr.log").open("xb") as stderr:
            process = subprocess.Popen(invocation, cwd=ROOT, stdout=stdout, stderr=stderr)
            self.child_pid = process.pid
            while True:
                self.state("collecting")
                try:
                    code = process.wait(timeout=15)
                    break
                except subprocess.TimeoutExpired:
                    continue
                except KeyboardInterrupt:
                    self.stop_requested = True
                    print("已请求停止续局，等待当前手机采集安全收尾。", flush=True)
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
        common.write_new(directory / "launcher-exit.json", {"returncode": code, "hostPid": process.pid, "utc": common.utc()})
        self.child_pid = None
        if code not in (0, 3):
            raise RuntimeError("手机采集异常退出，保留失败尝试并停止")
        attempt = directory / "launcher" / job["attemptId"]
        request = common.read_json(attempt / "request.json")
        if request.get("device") != self.args.device or request.get("fridaRemotePort") != self.args.frida_port:
            raise RuntimeError("采集尝试设备或端口不符")
        for key in ("parentId", "attemptId", "map", "seed", "maxActions"):
            if request["job"].get(key) != job[key]:
                raise RuntimeError("采集尝试与队列不符：" + key)
        result = common.read_json(attempt / "native/result.json")
        summary = common.read_json(attempt / "summary.json")
        checks = summary.get("checks", {})
        required = ("oneParentOneAttempt", "allDecisionChainsClosed", "allCommittedActionsFromJsPrimary", "workerStopped",
                    "safeLifecycleCleanup", "noFatal", "jsRngUnmodifiedAndUnseeded")
        if any(checks.get(key) is not True for key in required) or summary.get("forbiddenEventCount") != 0:
            raise RuntimeError("原始JS主路径链或安全收尾证据不完整")
        natural = result.get("naturalEnd") is True
        if not natural and (result.get("truncationReason") != "max_actions" or result.get("actions") != job["maxActions"]):
            raise RuntimeError("非自然终局也不是完整动作上限截断，保留并停止")
        transferred = launcher.verify_success_artifacts(attempt, result)
        common.safe_status(attempt)
        self.guard()
        self.state("archiving_transferred_raw_data")
        exited = common.stop_owned_process(self.adb, attempt, job, self.args.device, "su")
        common.write_new(directory / "process-exit.json", exited)
        archive_transferred_device_copies(self.adb, attempt, job, self.args.device, exited,
                                         attempt / "device-archive-receipt.json")
        common.write_new(directory / "collection-receipt.json", {"collectionComplete": True,
            "parentId": job["parentId"], "attemptId": job["attemptId"], "naturalEnd": natural,
            "truncated": not natural, "independentReplayDeferred": True, "transportChecks": transferred,
            "evidenceHashes": common.tree_hashes(directory), "utc": common.utc()})

    def run(self) -> int:
        for index, job in enumerate(self.plan["jobs"], 1):
            directory = self.args.run_dir / "jobs" / f"{index:04d}"
            receipt_path = directory / "collection-receipt.json"
            if receipt_path.exists():
                receipt = common.read_json(receipt_path)
                if (receipt.get("collectionComplete") is not True or receipt.get("parentId") != job["parentId"]
                        or receipt.get("attemptId") != job["attemptId"]
                        or receipt.get("evidenceHashes") != common.tree_hashes(directory, {"collection-receipt.json"})):
                    raise RuntimeError("既有原始采集回执或证据发生变化")
            else:
                if directory.exists():
                    raise RuntimeError("已有未完成尝试，拒绝覆盖或自动重跑")
                self.collect(job, directory)
                receipt = common.read_json(receipt_path)
            self.counts["doneParents"] += 1
            self.counts["naturalParents" if receipt["naturalEnd"] else "truncatedParents"] += 1
            self.active = None
            self.state("running")
            print(f"手机原始采集 {self.counts['doneParents']}/1000，自然{self.counts['naturalParents']}，截断{self.counts['truncatedParents']}。", flush=True)
            if self.stop_requested:
                self.state("stopped")
                return 4
        self.state("complete")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument("-h", "--help", action="help", help="显示说明，不连接设备")
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--plan", type=Path, default=HERE / "PLAN.json")
    parser.add_argument("--adb", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--frida-port", type=common.parse_frida_port, default=27043)
    parser.add_argument("--python", default=sys.executable)
    args = parser.parse_args()
    args.run_dir, args.plan = args.run_dir.resolve(), args.plan.resolve()
    if not args.run_dir.is_relative_to(HERE / "runs") or args.run_dir == HERE / "runs" or args.plan != HERE / "PLAN.json":
        raise ValueError("只使用本轮PLAN及runs内独立目录")
    plan = load_plan(args.plan)
    identity = protocol(args, plan)
    args.run_dir.mkdir(parents=True, exist_ok=True)
    device_lock = ROOT / "ai_training/hard_native_3000_20261022/device-locks" / common.object_sha(args.device)
    device_lock.mkdir(parents=True, exist_ok=True)
    with common.run_lock(device_lock), common.run_lock(args.run_dir):
        protocol_path = args.run_dir / "PROTOCOL.json"
        if protocol_path.exists():
            if common.read_json(protocol_path) != identity:
                raise RuntimeError("恢复来源或参数改变，拒绝覆盖本轮协议")
        else:
            if any(path.name != "controller.lock" for path in args.run_dir.iterdir()):
                raise RuntimeError("新轮次目录含历史内容，拒绝接管")
            common.write_new(protocol_path, identity)
        session = args.run_dir / "sessions" / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8])
        session.mkdir(parents=True)
        queue = Queue(args, plan, identity, session)
        try:
            return queue.run()
        except (Exception, KeyboardInterrupt) as error:
            if queue.active:
                queue.counts["errorParents"] += 1
            common.write_new(session / "failure.json", {"utc": common.utc(), "error": str(error), "automaticRetry": False})
            queue.state("stopped_on_failure", str(error))
            print("原始采集停止，失败证据保留：" + str(error), file=sys.stderr, flush=True)
            return 2
        finally:
            queue.journal.close()


if __name__ == "__main__":
    raise SystemExit(main())
