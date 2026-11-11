"""仅退出本轮失败且原生线程未运行的调试进程，不用于生产采集。"""
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import time

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--attempt", required=True, type=Path)
p.add_argument("--adb", required=True)
p.add_argument("--finished-worker", action="store_true", help="只允许有明确线程退出且无在途回调的失败调试局")
a = p.parse_args()
root = Path(__file__).resolve().parent
directory = a.attempt.resolve()
if not directory.is_relative_to(root) or not directory.relative_to(root).parts[0].startswith("debug-entry-"):
    raise RuntimeError("只允许本轮独立调试尝试")
owned = json.loads((directory / "owned-process.json").read_text(encoding="utf-8"))
events = [json.loads(x) for x in (directory / "host-events.jsonl").read_text(encoding="utf-8").splitlines()]
previous_status = None
if a.finished_worker:
    previous_status = json.loads((directory / "resident-after-export.json").read_text(encoding="utf-8"))
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    if (summary.get("runtimeSmokeValid") is not False or previous_status.get("workerAlive") is not False
            or previous_status.get("workerFinished") is not True or previous_status.get("inCall") is not False
            or previous_status.get("pendingCallbacks") != 0 or previous_status.get("pageLoadPending") is not False):
        raise RuntimeError("未证明失败调试的原生线程退出且无在途调用")
elif not (directory / "failure.json").is_file() or any(
        x.get("kind") in {"lease_acquired", "worker_launched", "worker_started"} for x in events):
    raise RuntimeError("只有未启动采集且已有失败回执时可按未启动路径退出")
if owned.get("launcherOwned") is not True or owned.get("device") != "c2357770":
    raise RuntimeError("缺少明确启动所有权")
pid = str(owned["pid"])
if not pid.isdigit() or owned.get("package") != "net.toyknight.aeii.android":
    raise RuntimeError("进程身份不合法")

def shell(command):
    result = subprocess.run([a.adb, "-s", owned["device"], "shell", "su", "-c", "'" + command + "'"],
                            capture_output=True, text=True, timeout=30)
    if result.returncode and not (result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip()):
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout.strip()

current = shell("pidof " + owned["package"])
signal = None
if current:
    if current != pid:
        raise RuntimeError("存在未知进程，禁止退出")
    stat = shell("cat /proc/" + pid + "/stat")
    cmd = shell("cat /proc/" + pid + "/cmdline").split("\0")[0]
    if stat.rsplit(")", 1)[1].split()[19] != owned["procStarttime"] or cmd != owned["package"]:
        raise RuntimeError("PID已复用或命令行不符")
    shell("kill -TERM " + pid)
    signal = "TERM"
    for _ in range(30):
        if not shell("pidof " + owned["package"]):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("进程未退出，不升级为强杀")
receipt = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "pid": int(pid),
           "procStarttime": owned["procStarttime"], "collectionNeverStarted": not a.finished_worker,
           "failedWorkerStopped": a.finished_worker, "previousStatus": previous_status,
           "ownershipVerified": True, "signal": signal, "processExited": True}
with (directory / "DEBUG_PROCESS_EXIT.json").open("x", encoding="utf-8") as output:
    json.dump(receipt, output, ensure_ascii=False, indent=2)
print(json.dumps(receipt, ensure_ascii=False))
