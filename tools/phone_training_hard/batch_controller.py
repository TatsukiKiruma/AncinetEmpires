"""困难原生父局的串行调度；只接纳独立验收通过的完整父局。"""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import uuid

from contract import EXPECTED, SUCCESS_FILES, parse_device_sha, parse_package_path
from verified_device_archive import archive_verified_device_copies


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_PLAN = ROOT / "ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json"
PHASE_COUNTS = {"smoke": 1, "acceptance": 20, "formal": 3000}


def parse_frida_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Frida端口必须是1至65535的整数") from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Frida端口必须在1至65535之间")
    return port


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def object_sha(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON顶层必须是对象：" + str(path))
    return value


def write_new(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def write_status(path: Path, value: object) -> None:
    # 仅覆盖本轮的当前状态；历史请求、回执和事件永不覆盖。
    partial = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    write_new(partial, value)
    os.replace(partial, path)


class Journal:
    def __init__(self, path: Path):
        self.stream = path.open("x", encoding="utf-8")

    def append(self, kind: str, **fields) -> None:
        self.stream.write(json.dumps({"utc": utc(), "kind": kind, **fields}, ensure_ascii=False) + "\n")
        self.stream.flush()
        os.fsync(self.stream.fileno())

    def close(self) -> None:
        self.stream.close()


@contextmanager
def run_lock(directory: Path):
    # 锁由操作系统持有，宿主退出后释放，不按可复用的PID删除所谓陈旧锁。
    with (directory / "controller.lock").open("a+b") as stream:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def load_plan(path: Path) -> dict:
    plan = read_json(path)
    jobs = plan.get("jobs")
    if (plan.get("schema") != "native-hard-preregistered-plan-v1"
            or plan.get("apkSha256") != EXPECTED["sha256"]
            or plan.get("policyHtmlSha256") != EXPECTED["hard_runtime_sha256"]
            or plan.get("preflightGamesCountToward3000") is not False
            or plan.get("total") != 3000 or not isinstance(jobs, list) or len(jobs) != 3000
            or object_sha(jobs) != plan.get("jobsSha256")):
        raise ValueError("冻结计划的身份、3000局总额或jobs摘要不相符")
    quota = {row["map"]: row["games"] for row in plan["quota"]}
    if len(quota) != 8 or any(count != 375 for count in quota.values()):
        raise ValueError("冻结计划必须保持8张图各375父局")
    if Counter(job.get("map") for job in jobs) != Counter(quota):
        raise ValueError("冻结计划实际地图配额与声明不符")
    if len({job.get("parentId") for job in jobs}) != 3000:
        raise ValueError("正式父局身份重复")
    for job in jobs:
        if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", job.get("parentId", ""))
                or type(job.get("seed")) is not int or not 0 <= job["seed"] < 2**31
                or job.get("playerType") != 3 or job.get("mode") != "SD"
                or job.get("maxActions") != 20000 or job.get("setup") != "official-default"
                or job.get("derivedFrom") is not None
                or job.get("players") != [{"id": 0, "type": 3}, {"id": 1, "type": 3}]):
            raise ValueError("只支持预登记的官方默认初态、双方困难JS、完整父局")
    return plan


def make_jobs(plan: dict, phase: str, run_id: str, max_actions: int) -> list[dict]:
    jobs = []
    for index, source in enumerate(plan["jobs"][:PHASE_COUNTS[phase]], 1):
        parent = source["parentId"] if phase == "formal" else f"hard-{phase}-{run_id}-{index:04d}"
        seed = source["seed"] if phase == "formal" else int(object_sha([run_id, phase, index])[:8], 16) % 2**31
        jobs.append({"index": index, "parentId": parent,
                     "attemptId": f"hc-{run_id}-{phase}-{index:04d}", "map": source["map"],
                     "seed": seed, "maxActions": min(max_actions, source["maxActions"]),
                     "requestedPlayerType": 3, "jsRngMode": "original_webview_rng",
                     "countsToward3000": phase == "formal", "planParentId": source["parentId"]})
    if phase == "acceptance" and len({job["map"] for job in jobs}) != 8:
        raise ValueError("20局试采没有覆盖冻结计划的八张图")
    return jobs


def source_paths() -> list[Path]:
    paths = [path for path in HERE.rglob("*") if path.is_file() and path.suffix in {".py", ".js", ".ts", ".mjs"}
             and "__pycache__" not in path.parts]
    # 原生重放及项目strict的已有公共依赖也绑定，禁止只冻结入口文件。
    paths.extend(path for path in (ROOT / "tools/phone_training").glob("*.js"))
    paths.append(ROOT / "tools/apk_game_get_validate.ts")
    for subdirectory in ("ai_training/data_acceptance_20261016/native_reader",
                         "ai_training/data_acceptance_20261016/phone", "src/game"):
        paths.extend(path for path in (ROOT / subdirectory).rglob("*")
                     if path.is_file() and path.suffix in {".ts", ".js"})
    return sorted(set(paths))


def source_identity() -> dict[str, str]:
    return {str(path.relative_to(ROOT)).replace("\\", "/"): digest(path) for path in source_paths()}


def assert_sources(manifest: dict) -> None:
    if source_identity() != manifest["sources"]:
        raise RuntimeError("采集或验收源码已改变；冻结轮次停止，不能继续或绕过身份门禁")


def parse_resources(battery_text: str, disk_text: str, host_free_bytes: int) -> dict:
    def battery_field(name: str) -> int:
        matches = re.findall(r"^\s*" + re.escape(name) + r":\s*(-?\d+)\s*$", battery_text, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError("无法唯一读取电池字段：" + name)
        return int(matches[0])

    level, scale, temperature = (battery_field(name) for name in ("level", "scale", "temperature"))
    if not 0 <= level <= scale or scale <= 0 or not 0 < temperature < 1000:
        raise ValueError("电池电量或温度读数不合理")
    lines = [line.split() for line in disk_text.splitlines() if line.strip()]
    if len(lines) != 2 or len(lines[1]) < 6 or not lines[1][3].isdigit() or lines[1][-1] != "/data":
        raise ValueError("无法唯一读取/data剩余空间")
    return {"batteryPercent": 100 * level / scale, "temperatureC": temperature / 10,
            "deviceFreeBytes": int(lines[1][3]) * 1024, "hostFreeBytes": host_free_bytes}


def require_resources(resources: dict, limits: dict) -> None:
    if (resources["batteryPercent"] < limits["minBatteryPercent"]
            or resources["temperatureC"] > limits["maxTemperatureC"]
            or resources["deviceFreeBytes"] < limits["minDeviceFreeBytes"]
            or resources["hostFreeBytes"] < limits["minHostFreeBytes"]):
        raise RuntimeError("资源门禁未通过，停止调度并保留本轮进度：" + json.dumps(resources, ensure_ascii=False))


class Adb:
    def __init__(self, executable: str, serial: str, journal: Journal):
        self.prefix = [executable, "-s", serial]
        self.journal = journal

    def call(self, *parts: str, allow_missing: bool = False) -> str:
        result = subprocess.run([*self.prefix, *parts], capture_output=True, timeout=40, check=False)
        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")
        self.journal.append("adb", arguments=list(parts), returncode=result.returncode, stdout=stdout, stderr=stderr)
        if result.returncode and not (allow_missing and result.returncode == 1 and not stdout.strip() and not stderr.strip()):
            raise RuntimeError("ADB失败：" + stderr + stdout)
        return stdout

    def pids(self) -> list[int]:
        # 应用进程在hidepid环境下可能对shell不可见；通过已验证的su只读查询。
        value = self.call("shell", "su", "-c", "'pidof " + EXPECTED["package"] + "'", allow_missing=True).strip()
        if not re.fullmatch(r"(?:[1-9]\d*(?:\s+[1-9]\d*)*)?", value):
            raise RuntimeError("无法解析应用PID；拒绝终止任何进程")
        return [int(item) for item in value.split()]


def process_start_time(stat_text: str, pid: int) -> str:
    # comm字段可以含空格或括号，最后一个右括号之后才是第3个字段。
    match = re.fullmatch(r"(\d+) \(.*\) (.+)", stat_text.strip())
    if not match or int(match[1]) != pid:
        raise RuntimeError("/proc进程身份不可解析")
    fields = match[2].split()
    if len(fields) < 20 or not fields[19].isdigit():
        raise RuntimeError("/proc进程起始时间缺失")
    return fields[19]


def safe_status(attempt: Path) -> dict:
    final = read_json(attempt / "resident-after-export.json")
    if (final.get("workerAlive") is not False or final.get("cleanup") != "safe"
            or final.get("fatal") is not None or final.get("pendingCallbacks")
            or final.get("pageLoadPending")):
        raise RuntimeError("未证明原生线程停止且cleanup=safe；不杀进程、不调度下一局")
    return final


def owned_process(attempt: Path, job: dict, device: str) -> dict:
    owned = read_json(attempt / "owned-process.json")
    start_time = owned.get("startTimeTicks", owned.get("procStarttime"))
    if (owned.get("launcherOwned") is not True or type(owned.get("pid")) is not int or owned["pid"] <= 0
            or not isinstance(start_time, str) or not start_time.isdigit()
            or ("startTimeTicks" in owned and "procStarttime" in owned and owned["startTimeTicks"] != owned["procStarttime"])
            or owned.get("device") != device or owned.get("package") != EXPECTED["package"]
            or owned.get("parentId") != job["parentId"] or owned.get("attemptId") != job["attemptId"]):
        raise RuntimeError("本次spawn所有权或/proc身份缺失；绝不停止未知进程")
    return {**owned, "startTimeTicks": start_time}


def stop_owned_process(adb: Adb, attempt: Path, job: dict, device: str, kill_via: str) -> dict:
    owned = owned_process(attempt, job, device)
    pid = owned["pid"]
    pids = adb.pids()
    if pid not in pids:
        if pids:
            raise RuntimeError("本次进程已退出但存在未知应用进程，停止调度")
        return {"processExited": True, "alreadyExited": True, "pid": pid, "signalSent": False, "utc": utc()}
    if pids != [pid]:
        raise RuntimeError("应用包含未知进程；拒绝终止及续局")
    safe_status(attempt)
    if process_start_time(adb.call("shell", "su", "-c", f"'cat /proc/{pid}/stat'"), pid) != owned["startTimeTicks"]:
        raise RuntimeError("PID已复用或起始身份改变；绝不终止")
    cmdline = adb.call("shell", "su", "-c", f"'cat /proc/{pid}/cmdline'").split("\x00")[0].strip()
    if cmdline != EXPECTED["package"]:
        raise RuntimeError("PID当前命令行不属于目标应用，绝不终止")
    # 此处只发给已经验收且线程停止的本轮PID，不使用应用范围的force-stop。
    if kill_via == "su":
        adb.call("shell", "su", "-c", f"'kill -TERM {pid}'")
    else:
        adb.call("shell", "kill", "-TERM", str(pid))
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        remaining = adb.pids()
        if not remaining:
            return {"processExited": True, "alreadyExited": False, "pid": pid, "signalSent": True,
                    "startTimeTicks": owned["startTimeTicks"], "killVia": kill_via, "utc": utc()}
        if remaining != [pid]:
            raise RuntimeError("停止后出现未知进程，拒绝进一步操作")
        time.sleep(0.5)
    raise RuntimeError("本次已安全收尾PID在TERM后仍未退出；不升级为强制终止")


def verify_attempt(attempt: Path, job: dict, device: str, plan_sha256: str) -> dict:
    request = read_json(attempt / "request.json")
    actual_job = request.get("job", {})
    for field in ("parentId", "attemptId", "map", "seed", "maxActions", "requestedPlayerType", "jsRngMode"):
        if actual_job.get(field) != job[field]:
            raise RuntimeError("launcher请求与冻结父局不相符：" + field)
    if request.get("device") != device:
        raise RuntimeError("launcher设备身份不相符")
    identity = read_json(attempt / "device-static-identity.json")
    if any(identity.get(key) != value for key, value in EXPECTED.items()):
        raise RuntimeError("APK静态身份不相符")
    result = read_json(attempt / "native/result.json")
    if (result.get("parentId") != job["parentId"] or result.get("attemptId") != job["attemptId"]
            or result.get("naturalEnd") is not True or result.get("jsSeedControlled") is not False
            or result.get("jsRngMode") != "original_webview_rng"):
        raise RuntimeError("没有身份相符的完整自然终局；不能计入3000")
    summary = read_json(attempt / "summary.json")
    if summary.get("runtimeSmokeValid") is not True:
        raise RuntimeError("逐决策主路径或宿主证据验收失败")
    safe_status(attempt)
    owned_process(attempt, job, device)
    verification = read_json(attempt / "verification.json")
    for field in ("passed", "nativeReplayVerified", "projectStrictVerified", "initialPlanMatched", "reliableValue", "valueEligible"):
        if verification.get(field) is not True:
            raise RuntimeError("独立验收未通过：" + field)
    for field, expected in (("parentId", job["parentId"]), ("attemptId", job["attemptId"]),
                            ("apkSha256", EXPECTED["sha256"]), ("planSha256", plan_sha256),
                            ("resultSha256", digest(attempt / "native/result.json"))):
        if verification.get(field) != expected:
            raise RuntimeError("独立验收身份未绑定：" + field)
    hashes = verification.get("artifactHashes", {})
    for name in SUCCESS_FILES:
        if hashes.get(name) != digest(attempt / "native" / name):
            raise RuntimeError("独立验收产物SHA未绑定：" + name)
    return verification


def expected_verifier_command(attempt: Path, manifest: dict, plan: Path) -> list[str]:
    return [manifest["python"], manifest["verifier"], "--attempt-dir", str(attempt.resolve()),
            "--adb", manifest["adb"], "--device", manifest["device"], "--frida-port", str(manifest["fridaPort"]),
            "--plan", str(plan.resolve())]


def verify_resident_verification(attempt: Path, manifest: dict, plan: Path) -> dict:
    command = read_json(attempt / "independent-verifier-command.json")
    exited = read_json(attempt / "independent-verifier-exit.json")
    verifier = Path(manifest["verifier"]).resolve()
    source_key = str(verifier.relative_to(ROOT)).replace("\\", "/")
    frozen_sha = manifest["sources"].get(source_key)
    if (command.get("collectorResident") is not True
            or command.get("command") != expected_verifier_command(attempt, manifest, plan)
            or not frozen_sha or digest(verifier) != frozen_sha or command.get("verifierSha256") != frozen_sha
            or digest(plan) != manifest["planSha256"] or command.get("planSha256") != manifest["planSha256"]):
        raise RuntimeError("驻留期间独立验证器的命令、设备、端口、源码或计划身份不符")
    seconds = exited.get("wallSeconds")
    if (exited.get("collectorResident") is not True or type(exited.get("returncode")) is not int
            or exited["returncode"] != 0 or type(exited.get("hostPid")) is not int or exited["hostPid"] <= 0
            or type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0):
        raise RuntimeError("驻留期间的独立验证子进程未成功退出或回执不完整")
    after = read_json(attempt / "resident-after-verification.json")
    if (after.get("workerAlive") is not False or after.get("cleanup") != "safe" or after.get("fatal") is not None
            or after.get("pendingCallbacks") != 0 or after.get("pageLoadPending") is not False
            or after.get("inCall") is not False or after.get("restartRequired") is not False
            or after.get("workerResult") != read_json(attempt / "native/result.json")):
        raise RuntimeError("独立验证后没有新的安全驻留状态证明")
    if read_json(attempt / "verification.json").get("fridaRemotePort") != manifest["fridaPort"]:
        raise RuntimeError("独立验收报告使用的Frida端口与冻结轮次不符")
    return exited


def tree_hashes(directory: Path, exclude: set[str] | None = None) -> dict[str, str]:
    excluded = exclude or set()
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise RuntimeError("证据目录含符号链接，拒绝计算可恢复验收")
        if path.is_file():
            name = str(path.relative_to(directory)).replace("\\", "/")
            if name not in excluded:
                result[name] = digest(path)
    return result


def validate_qualification(directory: Path, manifest: dict, job: dict) -> dict:
    qualification = read_json(directory / "qualification.json")
    if (qualification.get("passed") is not True or qualification.get("runBindingSha256") != object_sha(manifest)
            or qualification.get("jobSha256") != object_sha(job)
            or qualification.get("parentId") != job["parentId"] or qualification.get("attemptId") != job["attemptId"]
            or qualification.get("countsToward3000") != job["countsToward3000"]
            or qualification.get("evidenceHashes") != tree_hashes(directory, {"qualification.json"})):
        raise RuntimeError("已验收父局证据或身份发生变化，停止恢复：" + str(directory))
    if read_json(directory / "process-exit.json").get("processExited") is not True:
        raise RuntimeError("验收父局未证明进程退出")
    if manifest.get("archiveDeviceCopies") is True:
        archived = read_json(directory / "device-archive-receipt.json")
        if (archived.get("enabled") is not True or archived.get("removed") is not True
                or archived.get("pcOriginalsRetained") is not True or archived.get("leafRemoved") is not True
                or archived.get("parentId") != job["parentId"] or archived.get("attemptId") != job["attemptId"]):
            raise RuntimeError("开启设备归档的轮次缺失成功归档回执")
    attempt = directory / "launcher" / job["attemptId"]
    verify_resident_verification(attempt, manifest, directory.parents[1] / "shared/sampling-plan.json")
    verify_attempt(attempt, job, manifest["device"], manifest["planSha256"])
    return qualification


def bridge_seconds(native: Path, actions: int) -> dict:
    started: dict[int, int] = {}
    durations = []
    with (native / "decision-evidence.jsonl").open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            event = json.loads(line)
            if event.get("kind") not in {"choose_enter", "choose_return"}:
                continue
            index, nanos = event.get("actionIndex"), event.get("deviceNanos")
            if type(index) is not int or not isinstance(nanos, str) or not re.fullmatch(r"-?\d+", nanos):
                continue
            if event["kind"] == "choose_enter":
                started[index] = int(nanos)
            elif index in started:
                elapsed = (int(nanos) - started.pop(index)) / 1e9
                if elapsed >= 0:
                    durations.append(elapsed)
    complete = len(durations) == actions and not started
    return {"measuredDecisions": len(durations), "expectedDecisions": actions, "measurementComplete": complete,
            "wallSeconds": sum(durations) if complete else None, "pureJavaScriptCpuSeconds": None}


def semantic_trajectory(native: Path) -> dict:
    result = read_json(native / "result.json")
    if result.get("naturalEnd") is not True or type(result.get("winnerMask")) is not int or result["winnerMask"] < 0:
        raise RuntimeError("不同棋谱统计只支持已验收的可靠自然胜负")
    fingerprint = hashlib.sha256(b"native-hard-fields-natural-outcome-v1\x00")
    count = 0
    with gzip.open(native / "actions.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            fields = json.loads(line).get("fields")
            if not isinstance(fields, dict) or set(fields) != set("abcdefghij"):
                raise RuntimeError("不同棋谱统计遇到缺失的原生动作字段")
            # 仅动作fields参与轨迹摘要；种子、父局ID、索引和时间均不能制造独特性。
            fingerprint.update(b"action\x00" + json.dumps(fields, ensure_ascii=False, sort_keys=True,
                separators=(",", ":"), allow_nan=False).encode("utf-8") + b"\n")
            count += 1
    if count != result.get("actions"):
        raise RuntimeError("不同棋谱统计的动作数与已验收结果不一致")
    outcome = {"naturalEnd": True, "winnerAlliance": result["winnerMask"]}
    fingerprint.update(b"outcome\x00" + json.dumps(outcome, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n")
    return {"semanticTrajectorySha256": fingerprint.hexdigest(), "actionCount": count, "naturalOutcome": outcome}


def experience_diversity(directory: Path, jobs: list[dict]) -> dict:
    rows = []
    for job in jobs:
        attempt = directory / "jobs" / f"{job['index']:04d}" / "launcher" / job["attemptId"]
        projected_path = attempt / "project-strict-verification.json"
        projection = read_json(projected_path) if projected_path.is_file() else {}
        initial_projection = projection.get("initialProjectionSha256")
        if (projection.get("projectStrictVerified") is not True or projection.get("initialPlanMatched") is not True
                or not isinstance(initial_projection, str) or not re.fullmatch(r"[0-9a-f]{64}", initial_projection)):
            initial_projection = None
        trajectory = semantic_trajectory(attempt / "native")
        rows.append({"parentId": job["parentId"], "map": job["map"],
            "nativeInitialSha256": digest(attempt / "native/initial.bin"), "ruleInitialProjectionSha256": initial_projection,
            **trajectory, "ruleInitialAndTrajectorySha256": object_sha([initial_projection, trajectory["semanticTrajectorySha256"]])
            if initial_projection else None})

    def uniqueness(records: list[dict], field: str) -> dict:
        hashes = [row[field] for row in records if row[field] is not None]
        distinct = len(set(hashes))
        return {"measuredParents": len(hashes), "distinctCount": distinct, "duplicateParents": len(hashes) - distinct,
                "duplicateRate": (len(hashes) - distinct) / len(hashes) if hashes else None,
                "coverageComplete": len(hashes) == len(records)}

    def summarize(records: list[dict]) -> dict:
        return {"observedParents": len(records), "distinctParentIds": len({row["parentId"] for row in records}),
                "nativeInitialSnapshots": uniqueness(records, "nativeInitialSha256"),
                "ruleInitialProjections": uniqueness(records, "ruleInitialProjectionSha256"),
                "semanticActionTrajectories": uniqueness(records, "semanticTrajectorySha256"),
                "ruleInitialAndTrajectoryPairs": uniqueness(records, "ruleInitialAndTrajectorySha256")}

    return {"schema": "native-hard-experience-diversity-v1", **summarize(rows),
            "maps": {name: summarize([row for row in rows if row["map"] == name]) for name in sorted({row["map"] for row in rows})},
            "parentHashes": rows,
            "trajectoryDefinition": "按实际顺序规范化每步原生fields(a至j)及自然结果(naturalEnd、winnerAlliance)，"
                                    "不含ai_seed、配置seed、父局/尝试ID、时间、地图名或压缩文件头。",
            "limitations": "原生initial.bin的字节摘要可能含seed、时间或其他非规则字段，不能等同于真实不同开局。"
                           "实际规则初态优先采用独立strict回执initialProjectionSha256；缺失时只报告覆盖不足，不以原生摘要代替。"
                           "不同地图可能出现相同动作fields序列，因此另报规则初态与轨迹的组合数量。"
                           "fields保留原生实体编号；相同抽象策略但编号不同的序列仍可能分开。父局数、不同棋谱数与策略强度分别解释。"}


def storage_summary(directory: Path, jobs: list[dict]) -> dict:
    by_map: dict[str, list[dict]] = {}
    archive_receipts = []
    for job in jobs:
        parent = directory / "jobs" / f"{job['index']:04d}"
        native = parent / "launcher" / job["attemptId"] / "native"
        qualification = read_json(parent / "qualification.json")
        native_result = read_json(native / "result.json")
        timing = bridge_seconds(native, native_result["actions"])
        archive_file = parent / "device-archive-receipt.json"
        if archive_file.is_file():
            archive_receipts.append(read_json(archive_file))

        launcher_exit = parent / "launcher-exit.json"
        launcher_seconds = read_json(launcher_exit).get("wallSeconds") if launcher_exit.is_file() else None
        verification_seconds = read_json(native.parent / "independent-verifier-exit.json")["wallSeconds"]
        collector_seconds = None
        if type(launcher_seconds) in (int, float) and math.isfinite(launcher_seconds):
            if launcher_seconds < verification_seconds:
                raise RuntimeError("launcher总墙钟小于其内部独立验证墙钟，拒绝生成误导统计")
            collector_seconds = launcher_seconds - verification_seconds

        by_map.setdefault(job["map"], []).append({
            "hostBytes": sum(path.stat().st_size for path in parent.rglob("*") if path.is_file()),
            "nativeBytes": sum(path.stat().st_size for path in native.rglob("*") if path.is_file()),
            "hostWallSeconds": qualification.get("hostElapsedSeconds"), "launcherTotalWallSeconds": launcher_seconds,
            "collectorAndLifecycleWallSeconds": collector_seconds, "verificationWallSeconds": verification_seconds,
            "nativeWorkerSeconds": native_result.get("elapsedSeconds"),
            "hardJsBridgeWallSeconds": timing["wallSeconds"], "bridgeMeasurementComplete": timing["measurementComplete"]})

    def mean(rows: list[dict], field: str):
        values = [row.get(field) for row in rows]
        return (sum(values) / len(values) if all(type(value) in (int, float) and math.isfinite(value) and value >= 0
                                               for value in values) else None)

    observations = {name: {"parents": len(rows),
        "meanHostBytes": sum(row["hostBytes"] for row in rows) / len(rows),
        "maxHostBytes": max(row["hostBytes"] for row in rows),
        "meanNativeBytes": sum(row["nativeBytes"] for row in rows) / len(rows),
        "maxNativeBytes": max(row["nativeBytes"] for row in rows),
        "meanHostWallSeconds": mean(rows, "hostWallSeconds"), "meanLauncherTotalWallSeconds": mean(rows, "launcherTotalWallSeconds"),
        "meanCollectorAndLifecycleWallSeconds": mean(rows, "collectorAndLifecycleWallSeconds"),
        "meanVerificationWallSeconds": mean(rows, "verificationWallSeconds"),
        "meanNativeWorkerSeconds": mean(rows, "nativeWorkerSeconds"), "meanHardJsBridgeWallSeconds": mean(rows, "hardJsBridgeWallSeconds"),
        "allBridgeMeasurementsComplete": all(row["bridgeMeasurementComplete"] for row in rows)} for name, rows in by_map.items()}
    # 按正式配额375局/图估计，不把20局地图数量不均直接放大150倍。
    projection = None
    if len(observations) == 8:
        projection = {"hostBytesAtObservedMapMeans": int(sum(row["meanHostBytes"] * 375 for row in observations.values())),
                      "nativeBytesAtObservedMapMeans": int(sum(row["meanNativeBytes"] * 375 for row in observations.values()))}
        projection["hostBytesWith25PercentMargin"] = int(projection["hostBytesAtObservedMapMeans"] * 1.25)
        projection["nativeBytesWith25PercentMargin"] = int(projection["nativeBytesAtObservedMapMeans"] * 1.25)
        for field in ("HostWallSeconds", "LauncherTotalWallSeconds", "CollectorAndLifecycleWallSeconds", "VerificationWallSeconds", "NativeWorkerSeconds", "HardJsBridgeWallSeconds"):
            values = [row["mean" + field] for row in observations.values()]
            projection[field[0].lower() + field[1:] + "AtObservedMapMeans"] = (
                sum(value * 375 for value in values) if all(value is not None for value in values) else None)
    return {"observedParents": len(jobs), "maps": observations, "formal3000Projection": projection,
            "experienceDiversity": experience_diversity(directory, jobs),
            "deviceArchives": {"removedParents": sum(receipt.get("removed") is True for receipt in archive_receipts),
                               "removedNativeBytes": sum(item["bytes"] for receipt in archive_receipts
                                   if receipt.get("removed") is True for item in receipt["files"]),
                               "retainedCopyParents": len(jobs) - sum(receipt.get("removed") is True for receipt in archive_receipts)},
            "hostFreeBytesAtCompletion": shutil.disk_usage(directory).free,
            "capacityGuaranteed": False,
            "limitations": "原生字节为PC成功导出的原件实测；显式归档开启后只删除已验收且退出进程的当前设备七件冗余副本，"
                           "PC全量保留。设备仍保留配置ZIP及其他未授权清理的运行缓存。"
                           "投影是按试采均值的串行估计，未实跑3000局；不保证长尾容量或时间。"
                           "launcher总墙钟已包含内嵌验证；collectorAndLifecycle是减去验证后的启动/采集/导出/收尾墙钟，二者不重复相加。"
                           "JS桥墙钟含WebView回调、桥接和观测开销，没有纯JS CPU计时；native worker另含规则/快照/日志。"
                           "正式前应结合设备实测余量判断；逐局空间门禁持续生效，不删除证据。"}


def require_prerequisite(path: Path | None, phase: str, manifest: dict) -> dict | None:
    if phase == "smoke":
        if path is not None:
            raise ValueError("smoke不接受前序轮次")
        return None
    if path is None:
        raise ValueError("必须明确 --prerequisite-run，不能跳过单局和20局验收")
    prior = read_json(path / "run.json")
    required_phase = "smoke" if phase == "acceptance" else "acceptance"
    if (prior.get("phase") != required_phase or prior.get("device") != manifest["device"]
            or prior.get("planSha256") != manifest["planSha256"]
            or prior.get("sourceSha256") != manifest["sourceSha256"]
            or prior.get("apkSha256") != manifest["apkSha256"]
            or any(prior.get(field) != manifest.get(field)
                   for field in ("baseConfigSha256", "baseConfigEntry", "javaBridgeSha256", "fridaPort"))):
        raise ValueError("前序轮次的阶段、设备、计划、源码或APK身份不符")
    complete = read_json(path / "complete.json")
    if (complete.get("passed") is not True or complete.get("qualifiedParents") != PHASE_COUNTS[required_phase]
            or complete.get("runBindingSha256") != object_sha(prior)
            or len(prior.get("jobs", [])) != PHASE_COUNTS[required_phase]):
        raise ValueError("前序轮次尚未全部独立验收通过")
    for job in prior["jobs"]:
        validate_qualification(path / "jobs" / f"{job['index']:04d}", prior, job)
    expected_receipts = {f"{job['index']:04d}": digest(path / "jobs" / f"{job['index']:04d}" / "qualification.json")
                         for job in prior["jobs"]}
    if complete.get("qualifiedReceiptHashes") != expected_receipts:
        raise ValueError("前序完成回执未绑定全部父局验收摘要")
    if phase == "formal":
        gate = read_json(path / "concurrency-gate.json")
        if (gate.get("passed") is not True or gate.get("selectedConcurrency") != 1
                or gate.get("testedConcurrency") != [1] or gate.get("serialFreshProcessVerified") is not True
                or gate.get("sourceSha256") != manifest["sourceSha256"]
                or gate.get("acceptanceRunSha256") != digest(path / "run.json")
                or gate.get("device") != manifest["device"] or gate.get("apkSha256") != manifest["apkSha256"]
                or any(not isinstance(gate.get("notApplicable", {}).get(str(n)), str)
                       or not gate["notApplicable"][str(n)].strip() for n in (2, 4))):
            raise ValueError("并发适用性门禁未通过；本设备仅支持已验收的串行fresh process")
    return {"path": str(path.resolve()), "runSha256": digest(path / "run.json"),
            "completeSha256": digest(path / "complete.json")}


class Controller:
    def __init__(self, args, directory: Path, manifest: dict, journal: Journal):
        self.args, self.directory, self.manifest, self.journal = args, directory, manifest, journal
        self.adb = Adb(args.adb, args.device, journal)
        self.stop_requested = False
        self.qualified: list[dict] = []
        self.active_job: dict | None = None
        self.pending_job: dict | None = None

    def guard(self) -> None:
        assert_sources(self.manifest)
        for path, expected in ((self.directory / "shared/base-config.zip", self.manifest["baseConfigSha256"]),
                               (self.directory / "shared/sampling-plan.json", self.manifest["planSha256"]),
                               (self.directory / "shared/frida-java-bridge.js", self.manifest["javaBridgeSha256"])):
            if digest(path) != expected:
                raise RuntimeError("冻结输入被修改：" + str(path))
        apk = self.directory / "shared/device-installed.apk"
        if apk.exists() and digest(apk) != EXPECTED["sha256"]:
            raise RuntimeError("共享APK副本被修改")

    def resource_gate(self) -> dict:
        announced = False
        while True:
            self.guard()
            if self.adb.call("get-state").strip() != "device" or self.adb.call("get-serialno").strip() != self.args.device:
                raise RuntimeError("明确绑定的ADB设备不可用")
            installed = parse_package_path(self.adb.call("shell", "pm", "path", EXPECTED["package"]))
            if parse_device_sha(self.adb.call("shell", "sha256sum", installed), installed) != EXPECTED["sha256"]:
                raise RuntimeError("等待资源前的设备APK身份不符")
            if self.adb.pids():
                raise RuntimeError("存在未由本轮当前父局证明拥有的应用进程，拒绝自动停止或附加")
            resources = parse_resources(self.adb.call("shell", "dumpsys", "battery"),
                                        self.adb.call("shell", "df", "-k", "/data"),
                                        shutil.disk_usage(self.directory).free)
            self.journal.append("resource_gate", **resources)
            try:
                require_resources(resources, self.manifest["limits"])
            except RuntimeError as error:
                if not getattr(self.args, "wait_resources", False):
                    raise
                self.update_status(self.qualified, "waiting_resources", str(error))
                if not announced:
                    print("资源不足，父局尚未开始；每30秒复查，来源或设备异常仍停止。", flush=True)
                    announced = True
                try:
                    time.sleep(30)
                except KeyboardInterrupt as interrupted:
                    self.stop_requested = True
                    raise RuntimeError("等待资源期间收到停止请求；未启动当前父局") from interrupted
                continue
            if announced:
                print("资源门禁恢复，准备启动下一父局。", flush=True)
            return resources

    def child(self, command: list[str], directory: Path, label: str) -> int:
        self.guard()
        started = time.monotonic()
        write_new(directory / (label + "-command.json"), {"command": command, "utc": utc()})
        with (directory / (label + ".stdout.log")).open("xb") as stdout, (directory / (label + ".stderr.log")).open("xb") as stderr:
            process = subprocess.Popen(command, cwd=ROOT, stdout=stdout, stderr=stderr)
            self.journal.append("child_started", label=label, hostPid=process.pid, directory=str(directory))
            while True:
                try:
                    code = process.wait(timeout=1)
                    break
                except subprocess.TimeoutExpired:
                    continue
                except KeyboardInterrupt:
                    self.stop_requested = True
                    print("已记录停止请求；保持驻留等待本次子进程安全收尾，之后不再续局。", flush=True)
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
        write_new(directory / (label + "-exit.json"), {"returncode": code, "utc": utc(), "hostPid": process.pid,
                                                      "wallSeconds": time.monotonic() - started})
        self.journal.append("child_exited", label=label, returncode=code)
        return code

    def execute(self, job: dict) -> None:
        started = time.monotonic()
        directory = self.directory / "jobs" / f"{job['index']:04d}"
        if directory.exists():
            raise RuntimeError("存在未验收尝试，拒绝自动重跑；失败和中断证据原样保留：" + str(directory))
        self.pending_job = job
        self.guard()
        resources = self.resource_gate()
        directory.mkdir(parents=True, exist_ok=False)
        write_new(directory / "job.json", {"job": job, "runBindingSha256": object_sha(self.manifest), "resources": resources})
        self.active_job = job
        self.pending_job = None
        self.update_status(self.qualified, "collecting")
        command = [self.args.python, str(self.args.launcher.resolve()), "--execute-smoke", "--adb", self.args.adb,
                   "--device", self.args.device, "--frida-port", str(getattr(self.args, "frida_port", 27042)),
                   "--parent-id", job["parentId"], "--attempt-id", job["attemptId"],
                   "--map", job["map"], "--seed", str(job["seed"]), "--max-actions", str(job["maxActions"]),
                   "--max-seconds", str(self.args.max_seconds), "--base-config-zip", str(self.directory / "shared/base-config.zip"),
                   "--base-config-entry", self.args.base_config_entry, "--output-root", str(directory / "launcher"),
                   "--shared-apk", str(self.directory / "shared/device-installed.apk"),
                   "--verify-before-detach", "--verifier", str(self.args.verifier.resolve()),
                   "--verification-plan", str(self.directory / "shared/sampling-plan.json")]
        command.extend(["--java-bridge", str(self.directory / "shared/frida-java-bridge.js")])
        if self.child(command, directory, "launcher") != 0:
            raise RuntimeError("父局采集失败或截断，保留原尝试并停止；不自动重跑")
        attempt = directory / "launcher" / job["attemptId"]
        safe_status(attempt)
        owned_process(attempt, job, self.args.device)
        self.update_status(self.qualified, "checking_resident_verification")
        verify_resident_verification(attempt, self.manifest, self.directory / "shared/sampling-plan.json")
        verify_attempt(attempt, job, self.args.device, self.manifest["planSha256"])
        self.guard()
        self.update_status(self.qualified, "stopping_owned_process")
        exited = stop_owned_process(self.adb, attempt, job, self.args.device, self.args.kill_via)
        write_new(directory / "process-exit.json", exited)
        if getattr(self.args, "archive_device_copies", False):
            self.guard()
            self.update_status(self.qualified, "archiving_verified_device_copies")
            archive_verified_device_copies(self.adb, attempt, job, self.args.device, exited,
                                          directory / "device-archive-receipt.json")
        write_new(directory / "qualification.json", {
            "passed": True, "utc": utc(), "parentId": job["parentId"], "attemptId": job["attemptId"],
            "countsToward3000": job["countsToward3000"], "runBindingSha256": object_sha(self.manifest),
            "jobSha256": object_sha(job), "evidenceHashes": tree_hashes(directory),
            "hostElapsedSeconds": time.monotonic() - started})

    def run(self) -> int:
        qualified = self.qualified
        for job in self.manifest["jobs"]:
            directory = self.directory / "jobs" / f"{job['index']:04d}"
            if (directory / "qualification.json").is_file():
                validate_qualification(directory, self.manifest, job)
                qualified.append(job)
            elif directory.exists():
                raise RuntimeError("发现未独立验收的既有尝试，恢复不会自动重跑：" + str(directory))
        self.update_status(qualified, "running")
        for job in self.manifest["jobs"]:
            if job in qualified:
                continue
            if self.stop_requested:
                self.update_status(qualified, "stopped")
                return 4
            self.execute(job)
            qualified.append(job)
            self.active_job = None
            self.update_status(qualified, "running")
            print(f"{self.args.phase}：已独立验收 {len(qualified)}/{len(self.manifest['jobs'])} 父局；"
                  f"本轮正式计数 {len(qualified) if self.args.phase == 'formal' else 0}/3000。", flush=True)
        if self.args.phase == "acceptance" and not (self.directory / "concurrency-gate.json").exists():
            write_new(self.directory / "concurrency-gate.json", {
                "passed": True, "selectedConcurrency": 1, "testedConcurrency": [1],
                "serialFreshProcessVerified": True, "qualifiedSerialParents": len(qualified), "utc": utc(),
                "device": self.args.device, "apkSha256": EXPECTED["sha256"],
                "sourceSha256": self.manifest["sourceSha256"], "acceptanceRunSha256": digest(self.directory / "run.json"),
                "notApplicable": {str(n): "只有本次明确绑定的一台设备；同APK的困难WebView及选择状态共享，"
                                  "20局仅实测独占fresh process串行，不运行或宣称已通过此并发测试" for n in (2, 4)}})
        if not (self.directory / "complete.json").exists():
            measured = storage_summary(self.directory, qualified)
            write_new(self.directory / "complete.json", {"passed": True, "phase": self.args.phase,
                "qualifiedParents": len(qualified), "formalQualifiedParents": len(qualified) if self.args.phase == "formal" else 0,
                "mapCounts": dict(Counter(job["map"] for job in qualified)), "runBindingSha256": object_sha(self.manifest),
                "storageSummary": measured,
                "experienceDiversity": {key: value for key, value in measured["experienceDiversity"].items() if key != "parentHashes"},
                "qualifiedReceiptHashes": {f"{job['index']:04d}": digest(self.directory / "jobs" / f"{job['index']:04d}" / "qualification.json")
                                           for job in qualified}, "utc": utc()})
        complete = read_json(self.directory / "complete.json")
        expected_receipts = {f"{job['index']:04d}": digest(self.directory / "jobs" / f"{job['index']:04d}" / "qualification.json")
                             for job in qualified}
        if (complete.get("runBindingSha256") != object_sha(self.manifest)
                or complete.get("qualifiedReceiptHashes") != expected_receipts
                or complete.get("qualifiedParents") != len(qualified)):
            raise RuntimeError("当前轮次完成回执被修改，停止恢复")
        self.update_status(qualified, "complete")
        return 0

    def update_status(self, qualified: list[dict], stage: str, error: str | None = None) -> None:
        write_status(self.directory / "STATE.json", {"updatedUtc": utc(), "stage": stage, "phase": self.args.phase,
            "qualifiedParents": len(qualified), "targetParents": len(self.manifest["jobs"]),
            "formalQualifiedParents": len(qualified) if self.args.phase == "formal" else 0,
            "preflightGamesCountToward3000": False, "sourceSha256": self.manifest["sourceSha256"],
            "activeParent": self.active_job["parentId"] if self.active_job else None,
            "activeAttempt": self.active_job["attemptId"] if self.active_job else None,
            "pendingParent": self.pending_job["parentId"] if self.pending_job else None,
            "lastQualifiedParent": qualified[-1]["parentId"] if qualified else None, "error": error})


def create_or_load_run(args, directory: Path) -> dict:
    plan = load_plan(args.plan)
    sources = source_identity()
    if not args.launcher.is_file() or not args.verifier.is_file():
        raise ValueError("正式launcher和独立验证器必须已经存在，不支持跳过验证")
    if not args.launcher.resolve().is_relative_to(HERE) or not args.verifier.resolve().is_relative_to(HERE):
        raise ValueError("入口必须位于本困难采集工具目录，以保证源码冻结完整")
    if args.java_bridge is None:
        spec = importlib.util.find_spec("frida_tools")
        if spec is None or spec.origin is None:
            raise ValueError("缺少Java bridge，需明确 --java-bridge；不自动安装依赖")
        args.java_bridge = Path(spec.origin).parent / "bridges/java.js"
    if not args.java_bridge.is_file():
        raise ValueError("Java bridge文件不存在")
    settings = {"phase": args.phase, "device": args.device, "fridaPort": getattr(args, "frida_port", 27042),
                "apkSha256": EXPECTED["sha256"],
                "planSha256": digest(args.plan), "sources": sources, "sourceSha256": object_sha(sources),
                "baseConfigSha256": digest(args.base_config_zip), "baseConfigEntry": args.base_config_entry,
                "javaBridgeSha256": digest(args.java_bridge),
                "maxActions": args.max_actions, "maxSeconds": args.max_seconds, "killVia": args.kill_via,
                "archiveDeviceCopies": getattr(args, "archive_device_copies", False),
                "waitResources": getattr(args, "wait_resources", False),
                "verificationMode": "collector-resident-independent-subprocess-v1",
                "launcher": str(args.launcher.resolve()), "verifier": str(args.verifier.resolve()),
                "python": str(Path(args.python).resolve()), "adb": args.adb,
                "limits": {"minBatteryPercent": args.min_battery, "maxTemperatureC": args.max_temperature,
                           "minHostFreeBytes": int(args.min_host_gib * 1024**3),
                           "minDeviceFreeBytes": int(args.min_device_gib * 1024**3)}}
    run_file = directory / "run.json"
    if run_file.exists():
        manifest = read_json(run_file)
        if any(manifest.get(key) != value for key, value in settings.items()):
            raise RuntimeError("恢复参数、源码、计划、设备或配置改变；拒绝修改冻结轮次")
        current_prerequisite = require_prerequisite(args.prerequisite_run, args.phase, manifest)
        if manifest.get("prerequisite") != current_prerequisite:
            raise RuntimeError("前序门禁发生改变，停止恢复")
        if digest(directory / "shared/base-config.zip") != manifest["baseConfigSha256"]:
            raise RuntimeError("冻结原生配置被修改")
        shared_apk = directory / "shared/device-installed.apk"
        if shared_apk.exists() and digest(shared_apk) != EXPECTED["sha256"]:
            raise RuntimeError("共享APK副本被修改")
        return manifest
    if any(path.name not in {"controller.lock", "sessions"} for path in directory.iterdir()):
        raise RuntimeError("输出目录含既有未登记文件；不覆盖或接管历史目录")
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
    manifest = {"schema": "native-hard-serial-controller-v1", "createdUtc": utc(), "runId": run_id,
                **settings, "jobs": make_jobs(plan, args.phase, run_id, args.max_actions)}
    manifest["prerequisite"] = require_prerequisite(args.prerequisite_run, args.phase, manifest)
    (directory / "shared").mkdir()
    shutil.copy2(args.base_config_zip, directory / "shared/base-config.zip")
    if digest(directory / "shared/base-config.zip") != settings["baseConfigSha256"]:
        raise RuntimeError("复制配置时内容改变")
    shutil.copy2(args.plan, directory / "shared/sampling-plan.json")
    shutil.copy2(args.java_bridge, directory / "shared/frida-java-bridge.js")
    for name in sources:
        destination = directory / "source" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
        if digest(destination) != sources[name]:
            raise RuntimeError("冻结源码过程中原文件改变：" + name)
    write_new(run_file, manifest)
    return manifest


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="困难原生单设备串行采集；每局fresh spawn、独立验收后续局", add_help=False)
    result.add_argument("-h", "--help", action="help", help="显示中文说明并退出，不连接设备")
    result.add_argument("--phase", choices=PHASE_COUNTS, required=True, help="单局/20局/3000局分别建轮次，不合并计数")
    result.add_argument("--run-dir", type=Path, required=True, help="新轮次目录；相同参数重启可跳过已验收父局")
    result.add_argument("--prerequisite-run", type=Path, help="acceptance指向smoke轮次，formal指向完整acceptance轮次")
    result.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    result.add_argument("--device", required=True)
    result.add_argument("--frida-port", type=parse_frida_port, default=27042, help="设备端Frida监听端口，默认27042，范围1至65535")
    result.add_argument("--adb", default="adb")
    result.add_argument("--python", default=sys.executable)
    result.add_argument("--launcher", type=Path, default=HERE / "launch_collect.py")
    result.add_argument("--verifier", type=Path, default=HERE / "verification/run.py")
    result.add_argument("--base-config-zip", type=Path, required=True)
    result.add_argument("--base-config-entry", required=True)
    result.add_argument("--java-bridge", type=Path)
    result.add_argument("--max-actions", type=int, default=20000)
    result.add_argument("--max-seconds", type=int, default=21600)
    result.add_argument("--kill-via", choices=("adb", "su"), default="su", help="仅终止当前safe且已验收的owned PID")
    result.add_argument("--archive-device-copies", action="store_true", help="显式归档已验收且进程退出的当前设备七件副本；PC原件全保留，默认不开启")
    result.add_argument("--wait-resources", action="store_true", help="显式开启父局开始前每30秒等待资源恢复；读数异常或在途失败仍停止")
    result.add_argument("--min-battery", type=float, default=30)
    result.add_argument("--max-temperature", type=float, default=42)
    result.add_argument("--min-host-gib", type=float, default=12)
    result.add_argument("--min-device-gib", type=float, default=2)
    return result


def main() -> int:
    args = parser().parse_args()
    if not 1 <= args.max_actions <= 20000 or not 1 <= args.max_seconds <= 21600:
        raise ValueError("动作上限须1至20000、墙钟上限须1至21600秒")
    if args.phase == "formal" and args.max_actions != 20000:
        raise ValueError("正式3000局必须保留冻结计划的20000动作上限")
    if (not 30 <= args.min_battery <= 100 or not 20 <= args.max_temperature <= 45
            or args.min_host_gib < 12 or args.min_device_gib < 2):
        raise ValueError("资源门禁不得低于电量30%、宿主12GiB、设备2GiB或高于45℃")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", args.device):
        raise ValueError("需要明确安全格式的ADB序列号")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.bin", args.base_config_entry):
        raise ValueError("配置条目必须是明确bin文件名")
    directory = args.run_dir.resolve()
    if directory == HERE or not directory.is_relative_to(ROOT):
        raise ValueError("轮次须放在仓库内独立目录")
    directory.mkdir(parents=True, exist_ok=True)
    # 同一设备的不同轮次也互斥，避免两个宿主控制器同时通过空进程检查。
    device_lock_directory = ROOT / "ai_training/hard_native_3000_20261022/device-locks" / object_sha(args.device)
    device_lock_directory.mkdir(parents=True, exist_ok=True)
    with run_lock(device_lock_directory), run_lock(directory):
        sessions = directory / "sessions"
        sessions.mkdir(exist_ok=True)
        session = sessions / (dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8])
        session.mkdir()
        journal = Journal(session / "events.jsonl")
        controller = None
        try:
            journal.append("controller_started", host=socket.gethostname(), pid=os.getpid(), phase=args.phase)
            manifest = create_or_load_run(args, directory)
            controller = Controller(args, directory, manifest, journal)
            return controller.run()
        except Exception as error:
            write_new(session / "failure.json", {"error": str(error), "utc": utc(), "automaticRetry": False})
            journal.append("controller_stopped", error=str(error))
            if controller:
                controller.update_status(controller.qualified, "stopped_on_failure", str(error))
            print("调度停止，证据与已验收父局保留：" + str(directory) + "\n" + str(error), file=sys.stderr, flush=True)
            return 2
        finally:
            journal.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
