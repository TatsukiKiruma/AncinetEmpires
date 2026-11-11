"""一局困难原生冒烟的身份和证据契约，不连接设备。"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


EXPECTED = {
    "sha256": "a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48",
    "package": "net.toyknight.aeii.android",
    "version_code": "1051",
    "version_name": "4.2.5.1",
    "certificate_sha256": ["fb5f6135f0160b3a699053ba9ddea2be1b1044b39905700e596ab6e7ca5ba7c4"],
    "main_activity": "net.toyknight.aeii.android.AndroidLauncher",
    "hard_runtime_sha256": "6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb",
}
MAX_ACTIONS = 200
SUCCESS_FILES = {"config.bin", "initial.bin", "final.bin", "actions.jsonl.gz", "states.bin.gz", "result.json", "decision-evidence.jsonl"}


def file_sha256(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def inspect_apk(path: Path) -> dict:
    # 仅在设备端文件摘要已相符后加载静态分析依赖。
    from loguru import logger
    logger.remove()
    from androguard.core.apk import APK
    apk = APK(str(path))
    return {
        "sha256": file_sha256(path),
        "package": apk.get_package(),
        "version_code": str(apk.get_androidversion_code()),
        "version_name": apk.get_androidversion_name(),
        "certificate_sha256": sorted({hashlib.sha256(c.dump()).hexdigest() for c in apk.get_certificates()}),
        "main_activity": apk.get_main_activity(),
        "hard_runtime_sha256": hashlib.sha256(apk.get_file("assets/hard-ai/runtime.html")).hexdigest()
        if "assets/hard-ai/runtime.html" in apk.get_files() else None,
    }


def require_identity(actual: dict) -> None:
    mismatches = {key: {"expected": value, "actual": actual.get(key)}
                  for key, value in EXPECTED.items() if actual.get(key) != value}
    if mismatches:
        raise ValueError("设备 APK 静态身份不符：" + repr(mismatches))


def parse_package_path(text: str) -> str:
    paths = [line[len("package:"):].strip() for line in text.splitlines() if line.startswith("package:")]
    if len(paths) != 1 or not re.fullmatch(r"/data/app/[A-Za-z0-9_./=+@~-]+\.apk", paths[0]):
        raise ValueError("仅支持单一 /data/app 下的 APK；空路径、分包或未知路径均拒绝")
    return paths[0]


def parse_device_sha(text: str, expected_path: str) -> str:
    parts = text.strip().split()
    if len(parts) != 2 or not re.fullmatch(r"[0-9a-fA-F]{64}", parts[0]) or parts[1] != expected_path:
        raise ValueError("无法唯一解析设备端 APK SHA-256")
    return parts[0].lower()


def validate_job(job: dict) -> None:
    expected_keys = {"parentId", "attemptId", "map", "seed", "maxActions", "requestedPlayerType", "jsRngMode"}
    if set(job) != expected_keys:
        raise ValueError("只支持明确的一局冒烟字段，不接受 batch、派生状态或隐式默认任务")
    for key in ("parentId", "attemptId"):
        if not isinstance(job[key], str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", job[key]):
            raise ValueError(key + " 只能含字母、数字、下划线和连字符，长度不超过80")
    if not isinstance(job["map"], str) or not re.fullmatch(r"\([2-6]\) [A-Za-z0-9 ._-]+\.aem", job["map"]):
        raise ValueError("地图必须是明确的官方 .aem 文件名，不支持路径")
    if type(job["seed"]) is not int or not 0 <= job["seed"] <= 2**31 - 1:
        raise ValueError("原生配置 seed 必须是非负 int32")
    if type(job["maxActions"]) is not int or not 1 <= job["maxActions"] <= MAX_ACTIONS:
        raise ValueError("一局冒烟 maxActions 必须在1至200之间")
    if job["requestedPlayerType"] != 3 or job["jsRngMode"] != "original_webview_rng":
        raise ValueError("仅支持请求困难type3及原始WebView随机源；不支持播种注入或普通策略")


def summarize_evidence(events: list[dict], worker_result: dict | None, status: dict) -> dict:
    # 每个决策必须形成开始、主路径返回、准入、实际提交的闭合链。
    started = [event for event in events if event.get("kind") == "decision_begin"]
    accepted = [event for event in events if event.get("kind") == "decision_accepted"]
    committed = [event for event in events if event.get("kind") == "action_committed"]
    primary = [event for event in events if event.get("kind") == "decision_return"
               and event.get("path") == "hard_js_primary"]
    attempts = worker_result.get("actions", -1) if worker_result else -1
    expected_indices = list(range(attempts)) if attempts >= 0 else []
    chains = [sorted(event.get("actionIndex", -1) for event in group)
              for group in (started, accepted, committed, primary)]
    stages = ("decision_begin", "decision_return", "decision_accepted", "action_committed")
    ordered = True
    for index in expected_indices:
        observed = [event.get("kind") for event in events if event.get("actionIndex") == index
                    and event.get("kind") in stages]
        ordered = ordered and observed == list(stages)
    ids = {(event.get("parentId"), event.get("attemptId")) for event in started + accepted + committed + primary}
    result_id = {(worker_result.get("parentId"), worker_result.get("attemptId"))} if worker_result else set()
    forbidden = [event for event in events if event.get("kind") in {
        "fatal", "ordinary_ai", "hard_fallback_required", "hard_java_fallback_started",
        "create_action_rejected", "unexpected_lifecycle", "unexpected_selection", "decision_error",
        "apk_bridge_error", "browser_error", "frida_error", "bootstrap_error", "frida_unexpected_message"}]
    counter_kinds = {
        "hardJsPrimary": "decision_return", "ordinaryAi": "ordinary_ai",
        "hardFallbackRequired": "hard_fallback_required", "hardJavaFallbackStarted": "hard_java_fallback_started",
        "createActionRejected": "create_action_rejected", "apkBridgeErrors": "apk_bridge_error",
        "browserErrors": "browser_error", "fridaScriptErrors": "frida_error",
        "bootstrapErrors": "bootstrap_error", "unexpectedScriptMessages": "frida_unexpected_message",
        "decisionErrors": "decision_error", "unexpectedLifecycle": "unexpected_lifecycle",
        "unexpectedSelection": "unexpected_selection",
    }
    counts = {name: sum(event.get("kind") == kind for event in events) for name, kind in counter_kinds.items()}
    counts["hardJsPrimary"] = len(primary)
    checks = {
        "oneParentOneAttempt": bool(worker_result) and ids == result_id,
        "allDecisionChainsClosed": attempts > 0 and ordered and all(chain == expected_indices for chain in chains),
        "allCommittedActionsFromJsPrimary": len(primary) == attempts and not forbidden,
        "workerStopped": status.get("workerAlive") is False,
        "safeLifecycleCleanup": status.get("cleanup") == "safe",
        "noFatal": status.get("fatal") is None,
        "naturalEnd": bool(worker_result and worker_result.get("naturalEnd")),
        "jsRngUnmodifiedAndUnseeded": bool(worker_result and worker_result.get("jsRngMode") == "original_webview_rng"
                                                 and worker_result.get("jsSeedControlled") is False),
    }
    return {"checks": checks, "runtimeSmokeValid": all(checks.values()),
            "collectorAcceptancePassed": False, "nativeStrictReplayVerified": False,
            "qualification": "候选实现；一局运行证据不能替代完整采集器和原生重放验收",
            "decisionCount": len(started), "committedActions": len(committed),
            "forbiddenEventCount": len(forbidden), "eventCounts": counts}
