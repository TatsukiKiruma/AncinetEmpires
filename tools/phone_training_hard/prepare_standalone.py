"""把已冻结的一父局采集器和剩余队列打包为手机本地运行材料。"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TASK = ROOT / "ai_training/hard_native_1000_20261022"
ROUND = os.environ.get("AEII_STANDALONE_ROUND", "01")
if ROUND not in ("01", "02", "03"):
    raise ValueError("独立部署轮次必须明确为01至03")
OUT = TASK / ("standalone-" + ROUND)
REMOTE = "/data/local/tmp/aeii-hard-standalone-20261022-" + ROUND
PRIVATE = "/data/user/0/net.toyknight.aeii.android/files/.aeii-hard-standalone/hard1000-20261022-" + ROUND


def sha(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")


def replace_once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError("源代码锚点不唯一：" + before[:90])
    return source.replace(before, after)


def main() -> None:
    plan = json.loads((TASK / "PLAN.json").read_text(encoding="utf-8"))
    old = TASK / "runs/production-02"
    state = json.loads((old / "STATE.json").read_text(encoding="utf-8"))
    assert state["doneParents"] == 2 and len(plan["jobs"]) == 1000
    completed = []
    for index in (1, 2):
        receipt = old / f"jobs/{index:04d}/collection-receipt.json"
        assert receipt.is_file()
        completed.append({"sequenceIndex": index, "receipt": str(receipt), "sha256": sha(receipt)})
    inputs = plan["inputs"]
    for name in ("baseConfigZip", "javaBridge", "sharedApk"):
        assert sha(Path(inputs[name]["path"])) == inputs[name]["sha256"]
    source_dir = OUT / "source"
    source_dir.mkdir(exist_ok=False)
    for name in ("resident_collect.frida.js", "audit_contract.js", "native_engine_collect.rhino.js", "worker_collect.rhino.js", "standalone_queue.js", "standalone_controller.sh", "prepare_standalone.py", "deploy_standalone.py"):
        (source_dir / name).write_bytes((HERE / name).read_bytes())
    resident = (HERE / "resident_collect.frida.js").read_text(encoding="utf-8")
    resident = replace_once(resident, " 'use strict';", " 'use strict';\n // 手机本地日志已经直接落盘，避免向启动器输出逐动作副本。\n function send(_) {}\n let wakeLock=null;")
    resident = resident.replace("HardCollectGuardV2", "HardStandaloneGuardV1").replace("HardCollectDrainV2", "HardStandaloneDrainV1")
    resident = replace_once(resident, "activityId=identity(value);", "activityId=identity(value);\n    const pm=activity.getSystemService('power');\n    wakeLock=Java.retain(Java.cast(pm,U('android.os.PowerManager')).newWakeLock(1,'aeii:hard-standalone'));\n    wakeLock.setReferenceCounted(false);wakeLock.acquire();\n    activity.getWindow().addFlags(128);")
    resident = replace_once(resident, "   shouldStop:{", "   pauseMillis:{returnType:'int',argumentTypes:[],implementation:function(){owner();return shouldPause(resourceStatus())?1000:0;}},\n   shouldStop:{")
    resident = replace_once(resident, "owner();return state.fatal!==null;", "owner();return state.fatal!==null||standaloneStopRequested();")
    resident = replace_once(resident, "'decision-evidence.jsonl');", "'decision-evidence.jsonl.gz');")
    resident = replace_once(resident, "U('java.io.OutputStreamWriter').$new(state.auditFile,'UTF-8')", "U('java.io.OutputStreamWriter').$new(U('java.util.zip.GZIPOutputStream').$new(state.auditFile),'UTF-8')")
    resident = replace_once(resident, " // 在悬挂的新进程安装框架入口；", (HERE / "standalone_queue.js").read_text(encoding="utf-8") + "\n // 在悬挂的新进程安装框架入口；")
    worker = (HERE / "worker_collect.rhino.js").read_text(encoding="utf-8")
    worker = replace_once(worker, "    guard.begin(count);", "    // 暂停发生在Rhino线程，不能在Frida回调中sleep并占住JS执行锁。\n    while(guard.pauseMillis()>0){if(guard.shouldStop())throw new Error('手机任务收到停止信号');java.lang.Thread.sleep(1000);}\n    guard.begin(count);")
    bridge = Path(inputs["javaBridge"]["path"]).read_text(encoding="utf-8")
    expected = {"package": plan["package"], "sha256": plan["apkSha256"]}
    native = (HERE / "native_engine_collect.rhino.js").read_text(encoding="utf-8")
    bundle = bridge + "\nglobalThis.Java=bridge;\nconst HARD_EXPECTED=" + json.dumps(expected) + ";\n"
    bundle += "const HARD_NATIVE_SOURCE=" + json.dumps(native) + ";\nconst HARD_WORKER_SOURCE=" + json.dumps(worker) + ";\n"
    bundle += (HERE / "audit_contract.js").read_text(encoding="utf-8") + "\n" + resident
    (OUT / "collector.bundle.js").write_text(bundle, encoding="utf-8", newline="\n")
    (OUT / "resident_standalone.frida.js").write_text(resident, encoding="utf-8", newline="\n")
    (OUT / "worker_standalone.rhino.js").write_text(worker, encoding="utf-8", newline="\n")
    (OUT / "controller.sh").write_text((HERE / "standalone_controller.sh").read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    (OUT / "base-config.zip").write_bytes(Path(inputs["baseConfigZip"]["path"]).read_bytes())
    configs = OUT / "configs"
    configs.mkdir()
    index_lines = []
    jobs = []
    for sequence, original in enumerate(plan["jobs"][2:], 3):
        job = dict(original)
        attempt_number = ROUND if sequence == 3 else "01"
        job["attemptId"] = f"hts1000-20261022-{sequence:04d}-a{attempt_number}"
        assert job["requestedPlayerType"] == 3 and job["jsRngMode"] == "original_webview_rng"
        private = PRIVATE + "/" + job["attemptId"]
        config = {"package": plan["package"], "job": job, "baseConfigZip": REMOTE + "/base-config.zip", "baseConfigName": inputs["baseConfigEntry"],
                  "stateRoot": private, "taskRoot": REMOTE, "sequenceIndex": sequence, "completedBefore": sequence - 1,
                  "total": 1000, "planSha256": sha(TASK / "PLAN.json"), "maxSeconds": 21600}
        filename = job["attemptId"] + ".json"
        write_json(configs / filename, config)
        index_lines.append(f"{job['attemptId']} {sequence-1} {REMOTE}/configs/{filename} {private}/STATE.json\n")
        jobs.append(job)
    (OUT / "index.txt").write_text("".join(index_lines), encoding="utf-8", newline="\n")
    write_json(OUT / "STANDALONE_PLAN.json", {"schema": "hard-phone-standalone-plan-v1", "computerRequired": False, "total": 1000,
               "alreadyCompleted": completed, "remaining": len(jobs), "jobs": jobs, "remoteRoot": REMOTE, "privateStateRoot": PRIVATE,
               "sourcePlanSha256": sha(TASK / "PLAN.json"), "independentReplayDeferred": True,
               "lifecycle": "手机本地root调度器逐局启动官方frida-inject，每局独立APK进程；安全收尾后自动下一局"})
    write_json(OUT / "SOURCE_SHA256.json", {str(p.relative_to(OUT)): sha(p) for p in OUT.rglob("*") if p.is_file() and p.name != "SOURCE_SHA256.json"})
    print(json.dumps({"remaining": len(jobs), "bundleBytes": (OUT / "collector.bundle.js").stat().st_size, "remoteRoot": REMOTE}, ensure_ascii=False))


if __name__ == "__main__":
    main()
