"""只读采样手机并发采集性能；CPU按整机全部在线核心归一为100%。"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import shlex
import subprocess
import sys
import time

DEFAULT_ADB = r"C:\Users\SHIINA\OneDrive\Documents\闲聊\手机投屏\scrcpy-win64-v5.0.1\adb.exe"
PACKAGE = "net.toyknight.aeii.android"
DATA_ROOT = f"/data/user/0/{PACKAGE}/files/.aeii-hard-production"


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def number(text: str | None) -> int | None:
    return int(text) if text is not None and re.fullmatch(r"\d+", text.strip()) else None


def process_stat(text: str) -> dict | None:
    try:
        fields = text.rsplit(")", 1)[1].split()
        return {"state": fields[0], "ticks": int(fields[11]) + int(fields[12]),
                "startTicks": int(fields[19])}
    except (IndexError, ValueError):
        return None


def cpu_rows(text: str) -> dict[str, list[int]]:
    return {p[0]: [int(v) for v in p[1:9]] for line in text.splitlines()
            if (p := line.split()) and re.fullmatch(r"cpu\d*", p[0]) and len(p) >= 9}


def renderer_pids(services: str, main_pids: set[str], package: str = PACKAGE) -> set[str]:
    found = set()
    for block in re.split(r"(?m)^\s*\* ServiceRecord\{", services)[1:]:
        if f" {package}/org.chromium.content.app.SandboxedProcessService" not in block:
            continue
        if f"callerPackage={package}" not in block:
            continue
        clients = set(re.findall(r"Client AppBindRecord[^\n]* (\d+):" + re.escape(package) + r"/", block))
        match = re.search(r"isolatedProc=ProcessRecord\{\S+ (\d+):[^\n]*/u0a\d+i-?\d+}", block)
        if clients & main_pids and match:
            found.add(match[1])
    return found


def walk_records(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_records(child)


class Sampler:
    def __init__(self, args):
        self.args = args
        self.initial_completed: set[str] | None = None
        self.attempts: dict[str, dict] = {}
        self.attempt_bases: dict[str, set[str]] = {}

    def shell(self, command: str) -> str:
        result = subprocess.run([self.args.adb, "-s", self.args.device, "shell", "su", "-c",
                                 shlex.quote(command)], capture_output=True, timeout=20)
        if result.returncode:
            raise RuntimeError(result.stderr.decode("utf8", errors="replace").strip() or command)
        return result.stdout.decode("utf8", errors="replace")

    def optional(self, command: str) -> str:
        try:
            return self.shell(command)
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            return "读取失败：" + str(error)

    def read_json(self, path: str) -> dict | None:
        try:
            value = json.loads(self.optional("cat " + shlex.quote(path)))
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None

    def sample(self) -> dict:
        started = time.monotonic()
        raw: dict = {}
        roots = {root: self.read_json(root + "/STATE.json") for root in self.args.task_root}
        roles: dict[str, set[str]] = {}
        active_attempts = set()
        completed = set()
        for root, state in roots.items():
            package = state.get("package") if state else None
            if package not in self.args.package:
                package = self.args.package[self.args.task_root.index(root)] if len(self.args.package) == len(self.args.task_root) else self.args.package[0]
            bases = {base for base in self.args.data_root if "/" + package + "/" in base} or set(self.args.data_root)
            for row in walk_records(state):
                for key, role in (("appPid", "app"), ("injectPid", "inject"), ("controllerPid", "controller")):
                    pid = str(row.get(key, ""))
                    if number(pid) and int(pid) > 0:
                        roles.setdefault(pid, set()).add(role)
                for key in ("attempt", "attemptId", "activeAttempt"):
                    attempt = row.get(key)
                    if isinstance(attempt, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,79}", attempt):
                        active_attempts.add(attempt)
                        self.attempt_bases.setdefault(attempt, set()).update(bases)
            text = self.optional("cat " + shlex.quote(root + "/completed.tsv"))
            raw["completed:" + root] = text
            for line in text.splitlines():
                fields = line.split()
                if len(fields) >= 3 and re.fullmatch(r"[A-Za-z0-9_-]{1,79}", fields[2]):
                    completed.add(fields[2])
                    self.attempt_bases.setdefault(fields[2], set()).update(bases)
        if self.initial_completed is None:
            self.initial_completed = completed - active_attempts
        requested = active_attempts | (completed - self.initial_completed)
        for attempt in requested:
            for base in self.attempt_bases.get(attempt, set(self.args.data_root)):
                self.attempts.setdefault(base + "/" + attempt + "/STATE.json", {})
        for path in self.args.state_path:
            self.attempts.setdefault(path, {})
        for path, previous in list(self.attempts.items()):
            if previous.get("standalonePhase") not in {"complete", "failed", "truncated", "stopped"}:
                current = self.read_json(path)
                if current:
                    self.attempts[path] = current
        main_pids = {pid for pid, names in roles.items() if "app" in names}
        for package in self.args.package:
            services = self.optional("dumpsys activity services " + shlex.quote(package))
            raw["services:" + package] = services
            for pid in renderer_pids(services, main_pids, package):
                roles.setdefault(pid, set()).add("renderer")
        for pid in self.args.pid:
            roles.setdefault(str(pid), set()).add("explicit")
        raw["cpu"] = self.shell("sed -n '1,9p' /proc/stat")
        raw["uptime"] = self.shell("cat /proc/uptime")
        cpu_at = time.monotonic()
        processes = {}
        for pid, names in roles.items():
            stat = self.optional("cat /proc/" + pid + "/stat")
            status = self.optional("cat /proc/" + pid + "/status")
            memory = self.optional("dumpsys meminfo " + pid)
            rss = re.search(r"(?m)^VmRSS:\s*(\d+)", status)
            pss = re.search(r"(?m)^\s*TOTAL\s+(\d+)\s", memory)
            processes[pid] = {"roles": sorted(names), "cpu": process_stat(stat),
                              "rssKiB": int(rss[1]) if rss else None, "pssKiB": int(pss[1]) if pss else None,
                              "raw": {"stat": stat, "status": status, "meminfo": memory}}
        raw["battery"] = self.optional("dumpsys battery")
        raw["memory"] = self.optional("cat /proc/meminfo")
        raw["online"] = self.optional("cat /sys/devices/system/cpu/online")
        raw["frequency"] = self.optional('for c in /sys/devices/system/cpu/cpu[0-9]*; do printf "%s" "${c##*/}"; '
            'for f in online cpufreq/scaling_cur_freq cpufreq/scaling_max_freq cpufreq/cpuinfo_max_freq; '
            'do v=NA; test ! -r "$c/$f" || read v < "$c/$f"; printf "\\t%s" "$v"; done; printf "\\n"; done')
        raw["cooling"] = self.optional('for c in /sys/class/thermal/cooling_device*; do '
            'read t < "$c/type"; read s < "$c/cur_state"; printf "%s\\t%s\\t%s\\n" "${c##*/}" "$t" "$s"; done')
        raw["thermal"] = self.optional("dumpsys thermalservice")
        frequency = []
        for line in raw["frequency"].splitlines():
            fields = line.split()
            if len(fields) == 5 and re.fullmatch(r"cpu\d+", fields[0]):
                frequency.append(dict(zip(("core", "online", "currentKHz", "maxKHz", "hardwareMaxKHz"),
                                          [fields[0], *[number(v) for v in fields[1:]]])))
        cooling = []
        for line in raw["cooling"].splitlines():
            fields = line.split()
            if len(fields) >= 3 and fields[0].startswith("cooling_device"):
                cooling.append({"name": fields[0], "type": fields[1], "state": number(fields[2])})
        battery = {key: (float(match[1]) / divisor if (match := re.search(pattern, raw["battery"])) else None)
                   for key, pattern, divisor in (("percent", r"level:\s*(\d+)", 1),
                                                 ("temperatureC", r"temperature:\s*(\d+)", 10))}
        battery["charging"] = any(x + " powered: true" in raw["battery"] for x in ("AC", "USB", "Wireless"))
        available = re.search(r"MemAvailable:\s*(\d+)", raw["memory"])
        actions = sum(int(row.get("committedActions", row.get("actions", 0)) or 0) for row in self.attempts.values())
        return {"utc": utc(), "hostMonotonic": cpu_at, "sampleWallSeconds": time.monotonic() - started,
                "deviceUptimeSeconds": float(raw["uptime"].split()[0]), "roots": roots,
                "attemptStates": json.loads(json.dumps(self.attempts)), "observedCumulativeActions": actions,
                "cpu": cpu_rows(raw["cpu"]), "processes": processes, "battery": battery,
                "availableMemoryKiB": int(available[1]) if available else None,
                "frequency": frequency, "cooling": cooling, "raw": raw}


def interval(left: dict, right: dict) -> dict:
    seconds = right["deviceUptimeSeconds"] - left["deviceUptimeSeconds"]
    delta = [b - a for a, b in zip(left["cpu"]["cpu"], right["cpu"]["cpu"])]
    total = sum(delta)
    if total <= 0 or seconds <= 0:
        raise ValueError("CPU累计时钟无有效增量")
    process_cpu = {}
    for pid in left["processes"].keys() & right["processes"].keys():
        a, b = left["processes"][pid]["cpu"], right["processes"][pid]["cpu"]
        if a and b and a["startTicks"] == b["startTicks"]:
            ticks = b["ticks"] - a["ticks"]
            if ticks >= 0:
                process_cpu[pid] = {"roles": right["processes"][pid]["roles"], "cpuTicksDelta": ticks,
                                    "wholeMachinePercent": 100 * ticks / total}
    count = right["observedCumulativeActions"] - left["observedCumulativeActions"]
    completed = sum(b.get("doneParents", 0) - a.get("doneParents", 0)
                    for root, a in left["roots"].items() if a and (b := right["roots"].get(root)))
    return {"seconds": seconds, "cpuTotalTicksDelta": total,
            "machineCpuPercent": 100 * (total - delta[3] - delta[4]) / total,
            "machineIncludingIowaitPercent": 100 * (total - delta[3]) / total,
            "iowaitPercent": 100 * delta[4] / total, "processCpu": process_cpu,
            "trackedProcessCpuLowerBoundPercent": sum(p["wholeMachinePercent"] for p in process_cpu.values()),
            "actionsDelta": count, "actionsPerSecond": count / seconds, "naturalParentsDelta": completed,
            "cpuPerCorePercent": {name: 100 * (sum(d := [y-x for x,y in zip(left["cpu"][name], right["cpu"][name])]) - d[3] - d[4]) / sum(d)
                                  for name in left["cpu"].keys() & right["cpu"].keys() if name != "cpu"
                                  and sum(y-x for x,y in zip(left["cpu"][name], right["cpu"][name])) > 0}}


def summarize(samples: list[dict], intervals: list[dict], workers: int) -> dict:
    temperatures = [s["battery"]["temperatureC"] for s in samples if s["battery"]["temperatureC"] is not None]
    pss = [sum(p["pssKiB"] or 0 for p in s["processes"].values()) for s in samples]
    rss = [sum(p["rssKiB"] or 0 for p in s["processes"].values()) for s in samples]
    available = [s["availableMemoryKiB"] for s in samples if s["availableMemoryKiB"] is not None]
    cap = any(f["maxKHz"] and f["hardwareMaxKHz"] and f["maxKHz"] < f["hardwareMaxKHz"] for s in samples for f in s["frequency"])
    cooling = any("cpufreq" in c["type"] and (c["state"] or 0) > 0 for s in samples for c in s["cooling"])
    ticks = sum(i["cpuTotalTicksDelta"] for i in intervals)
    cpu = sum(i["machineCpuPercent"] * i["cpuTotalTicksDelta"] for i in intervals) / ticks if ticks else None
    seconds = sum(i["seconds"] for i in intervals)
    actions = sum(i["actionsDelta"] for i in intervals)
    peak = max((i["machineCpuPercent"] for i in intervals), default=0)
    return {"schema": "hard-phone-concurrency-metrics-v1", "declaredWorkers": workers,
            "seconds": seconds, "machineCpuPercent": cpu, "peakIntervalCpuPercent": peak,
            "stopIncreasingAt90Percent": peak >= 90, "actionsDelta": actions,
            "actionsPerSecond": actions / seconds if seconds else None,
            "actionsPerDeclaredWorkerSecond": actions / seconds / workers if seconds else None,
            "naturalParentsDelta": sum(i["naturalParentsDelta"] for i in intervals),
            "observedCoreCount": len(samples[-1]["cpu"]) - 1 if samples else None,
            "trackedProcessCpuLowerBoundMeanPercent": sum(i["trackedProcessCpuLowerBoundPercent"] * i["cpuTotalTicksDelta"] for i in intervals) / ticks if ticks else None,
            "batteryTemperatureMinC": min(temperatures) if temperatures else None,
            "batteryTemperatureMaxC": max(temperatures) if temperatures else None,
            "trackedPssPeakMiB": max(pss, default=0) / 1024,
            "trackedRssPeakMiB": max(rss, default=0) / 1024,
            "availableMemoryMinMiB": min(available) / 1024 if available else None,
            "maxSamplingWallSeconds": max((s["sampleWallSeconds"] for s in samples), default=0),
            "cpuCoolingActiveObserved": cooling, "frequencyCapObserved": cap,
            "thermalAttribution": "冷却状态及频率上限是独立证据；动态频率低不能单独证明热降频。",
            "limits": ["本工具只读，不启动worker；declaredWorkers由调用者提供，需与运行源码/线程证据核对。",
                       "整机CPU包含其他应用和采样开销，全部核心总能力归一100%，忙碌时间不含iowait。",
                       "进程CPU仅累计相邻采样仍存在且startTicks相同的进程，是下界；进程退出会漏计。",
                       "动作率使用累计提交动作及设备uptime，STATE刷新带来采样端点误差；失败尝试的已提交动作也计入工作量。",
                       "短时60至120秒测试不能证明长时间温度稳定。"], "intervals": intervals}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default=DEFAULT_ADB)
    parser.add_argument("--device", default="c2357770")
    parser.add_argument("--task-root", action="append", required=True)
    parser.add_argument("--state-path", action="append", default=[], help="额外worker STATE绝对路径，可重复")
    parser.add_argument("--pid", action="append", type=int, default=[], help="额外明确归属本任务的PID，可重复")
    parser.add_argument("--package", action="append", default=[], help="本次采集包名，可重复；默认原包")
    parser.add_argument("--data-root", action="append", default=[], help="产物根目录，可重复；默认每个包的production目录")
    parser.add_argument("--workers", type=int, required=True)
    parser.add_argument("--duration", type=int, default=60)
    parser.add_argument("--interval", type=int, default=10)
    parser.add_argument("--output-root", type=pathlib.Path,
                        default=pathlib.Path("ai_training/hard_native_1000_20261022/concurrency-20261022"))
    args = parser.parse_args()
    args.package = args.package or [PACKAGE]
    if any(not re.fullmatch(r"[A-Za-z0-9_.]+", package) for package in args.package):
        parser.error("包名格式错误")
    args.data_root = args.data_root or [f"/data/user/0/{package}/files/.aeii-hard-production" for package in args.package]
    if not (1 <= args.workers <= 64 and 10 <= args.duration <= 120 and 1 <= args.interval <= 30):
        parser.error("worker须1至64，时长10至120秒，间隔1至30秒")
    session = args.output_root / (dt.datetime.now().strftime("%Y%m%d-%H%M%S") + f"-w{args.workers}")
    session.mkdir(parents=True, exist_ok=False)
    (session / "PROTOCOL.json").write_text(json.dumps(vars(args) | {"output_root": str(args.output_root), "startedUtc": utc(),
                                                              "python": sys.executable,
                                                              "samplerSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()},
                                                              ensure_ascii=False, indent=2), encoding="utf8")
    sampler = Sampler(args)
    samples, intervals = [], []
    started = time.monotonic()
    while True:
        sample = sampler.sample()
        (session / f"sample-{len(samples):03d}.json").write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf8")
        if samples:
            intervals.append(interval(samples[-1], sample))
        samples.append(sample)
        summary = summarize(samples, intervals, args.workers)
        (session / "SUMMARY.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf8")
        print(json.dumps({"session": str(session), "samples": len(samples), "seconds": round(summary["seconds"], 2),
                          "cpuPercent": round(summary["machineCpuPercent"], 2) if summary["machineCpuPercent"] is not None else None,
                          "actionsPerSecond": round(summary["actionsPerSecond"], 3) if summary["actionsPerSecond"] is not None else None,
                          "temperatureC": sample["battery"]["temperatureC"], "stopIncreasing": summary["stopIncreasingAt90Percent"]}, ensure_ascii=False), flush=True)
        if time.monotonic() - started >= args.duration:
            break
        time.sleep(min(args.interval, max(0, args.duration - (time.monotonic() - started))))


if __name__ == "__main__":
    main()
