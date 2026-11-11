"""轻量离线自检；使用伪ADB和合成事件，不连接手机、不导入Frida。"""

from __future__ import annotations

import argparse
import ast
import copy
import datetime as dt
import gzip
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import zipfile

from contract import EXPECTED, SUCCESS_FILES, file_sha256, parse_device_sha, parse_package_path, require_identity, summarize_evidence, validate_job
from launch_smoke import HERE, identity_gate, run_resident, verify_streams, verify_success_artifacts, write_json

sys.stdout.reconfigure(encoding="utf-8")


def expect_rejection(callback):
    try:
        callback()
    except (ValueError, RuntimeError, EOFError, OSError):
        return
    raise AssertionError("门禁没有拒绝不支持的输入")


def main() -> None:
    parser = argparse.ArgumentParser(description="离线自检，不连接设备")
    parser.add_argument("--output", type=Path, help="可选结果文件；已存在则拒绝覆盖")
    args = parser.parse_args()
    passed = []
    for path in sorted(HERE.glob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    passed.append("python_ast_all_sources")
    for path in sorted(HERE.glob("*.js")):
        subprocess.run(["node", "--check", str(path)], check=True, capture_output=True)
    passed.append("javascript_node_check_all_sources")
    actual = copy.deepcopy(EXPECTED)
    require_identity(actual)
    for key in EXPECTED:
        altered = copy.deepcopy(actual)
        altered[key] = [] if isinstance(EXPECTED[key], list) else "不相符"
        expect_rejection(lambda: require_identity(altered))
    passed.append("all_static_identity_fields_fail_closed")
    expect_rejection(lambda: require_identity({}))
    passed.append("missing_static_identity_rejected")
    apk_path = "/data/app/~~example/net.toyknight.aeii.android-xyz/base.apk"
    assert parse_package_path("package:" + apk_path + "\n") == apk_path
    expect_rejection(lambda: parse_package_path("package:" + apk_path + "\npackage:/data/app/other/split.apk"))
    expect_rejection(lambda: parse_package_path("package:/data/app/injected;command/base.apk"))
    expect_rejection(lambda: parse_device_sha(EXPECTED["sha256"] + " /different.apk", apk_path))
    passed.append("apk_paths_splits_and_hash_output_rejected")
    job = {"parentId": "test-parent", "attemptId": "test-attempt", "map": "(2) Duel.aem", "seed": 1,
           "maxActions": 1, "requestedPlayerType": 3, "jsRngMode": "original_webview_rng"}
    validate_job(job)
    for field, value in (("requestedPlayerType", 2), ("jsRngMode", "seeded"), ("maxActions", 201),
                         ("seed", True), ("map", "../Duel.aem"), ("parentId", "../parent")):
        altered = {**job, field: value}
        expect_rejection(lambda: validate_job(altered))
    expect_rejection(lambda: validate_job({**job, "batch": [job]}))
    passed.append("single_parent_type3_original_rng_bounds")
    with tempfile.TemporaryDirectory(prefix="hard-offline-selftest-", dir=HERE) as temporary:
        directory = Path(temporary)
        assert directory.resolve().is_relative_to(HERE.resolve())

        class FakeAdb:
            def __init__(self):
                self.commands = []

            def call(self, *parts, **_kwargs):
                self.commands.append(parts)
                if parts == ("get-state",):
                    return "device\n"
                if parts == ("shell", "pm", "path", EXPECTED["package"]):
                    return "package:" + apk_path + "\n"
                if parts == ("shell", "sha256sum", apk_path):
                    return "51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b  " + apk_path + "\n"
                raise AssertionError("原版拒绝前不应发生其他命令：" + repr(parts))

        fake = FakeAdb()
        expect_rejection(lambda: identity_gate(fake, directory))
        assert len(fake.commands) == 3
        assert not any(command[0] in {"push", "pull", "forward", "install"} for command in fake.commands)
        passed.append("known_original_device_hash_rejected_before_mutation_synthetic")
        result = {"parentId": job["parentId"], "attemptId": job["attemptId"], "actions": 1,
                  "naturalEnd": True, "jsRngMode": "original_webview_rng", "jsSeedControlled": False}
        events = [{"kind": kind, "parentId": job["parentId"], "attemptId": job["attemptId"], "actionIndex": 0,
                   "path": "hard_js_primary"} for kind in
                  ("decision_begin", "decision_return", "decision_accepted", "action_committed")]
        status = {"workerAlive": False, "cleanup": "safe", "fatal": None}
        summary = summarize_evidence(events, result, status)
        assert summary["runtimeSmokeValid"] is True and summary["collectorAcceptancePassed"] is False
        for incomplete in (events[:-1], list(reversed(events)), [*events, events[-1]], [*events, {"kind": "ordinary_ai"}],
                           [*events, {"kind": "hard_fallback_required"}]):
            assert not summarize_evidence(incomplete, result, status)["runtimeSmokeValid"]
        assert not summarize_evidence(events, result, {**status, "cleanup": "restart_required"})["runtimeSmokeValid"]
        passed.append("closed_decision_chain_and_no_false_acceptance")
        for kind, counter in (("apk_bridge_error", "apkBridgeErrors"), ("browser_error", "browserErrors"),
                              ("frida_error", "fridaScriptErrors"), ("ordinary_ai", "ordinaryAi"),
                              ("hard_java_fallback_started", "hardJavaFallbackStarted"),
                              ("create_action_rejected", "createActionRejected")):
            failed = summarize_evidence([*events, {"kind": kind}], result, status)
            assert failed["eventCounts"][counter] == 1 and failed["runtimeSmokeValid"] is False
        passed.append("independent_bridge_script_ordinary_fallback_rejection_counts")
        with gzip.open(directory / "actions.jsonl.gz", "wt", encoding="utf-8") as output:
            output.write(json.dumps({"index": 0, "parentId": job["parentId"], "attemptId": job["attemptId"], "path": "hard_js_primary"}) + "\n")
        with gzip.open(directory / "states.bin.gz", "wb") as output:
            output.write(struct.pack(">i", 4) + b"test")
        assert verify_streams(directory, result)["states"] == 1
        complete = directory / "complete"
        native = complete / "native"
        native.mkdir(parents=True)
        for name in SUCCESS_FILES - {"result.json", "actions.jsonl.gz", "states.bin.gz"}:
            (native / name).write_bytes(b"offline-fixture")
        for name in ("actions.jsonl.gz", "states.bin.gz"):
            (native / name).write_bytes((directory / name).read_bytes())
        (native / "result.json").write_text(json.dumps(result), encoding="utf-8")

        def transfer_manifest():
            files = [{"name": name, "bytes": (native / name).stat().st_size, "sha256": file_sha256(native / name)}
                     for name in sorted(SUCCESS_FILES)]
            (complete / "artifact-transfer.json").write_text(json.dumps({"transferHashesVerified": True,
                "completeSuccessSet": True, "files": files, "nativeStrictReplayVerified": False}), encoding="utf-8")

        transfer_manifest()
        assert verify_success_artifacts(complete, result)["hostNativeResultEqual"] is True
        (native / "final.bin").rename(native / "final.hidden")
        expect_rejection(lambda: verify_success_artifacts(complete, result))
        (native / "final.hidden").rename(native / "final.bin")
        (native / "result.json").write_text(json.dumps({**result, "actions": 2}), encoding="utf-8")
        transfer_manifest()
        expect_rejection(lambda: verify_success_artifacts(complete, result))
        (native / "result.json").write_text(json.dumps(result), encoding="utf-8")
        transfer_manifest()
        manifest = json.loads((complete / "artifact-transfer.json").read_text(encoding="utf-8"))
        manifest["completeSuccessSet"] = False
        (complete / "artifact-transfer.json").write_text(json.dumps(manifest), encoding="utf-8")
        expect_rejection(lambda: verify_success_artifacts(complete, result))
        passed.append("seven_required_artifacts_host_native_result_and_transfer_manifest")
        broken = (directory / "states.bin.gz").read_bytes()[:-5]
        (directory / "states.bin.gz").write_bytes(broken)
        expect_rejection(lambda: verify_streams(directory, result))
        passed.append("gzip_and_native_length_stream_completeness")

        fixture_zip = directory / "base-fixture.zip"
        with zipfile.ZipFile(fixture_zip, "w") as archive:
            archive.writestr("base.bin", b"offline-config")
        bridge = directory / "bridge-fixture.js"
        bridge.write_text("const bridge={};", encoding="utf-8")
        options = SimpleNamespace(base_config_zip=fixture_zip, base_config_entry="base.bin", java_bridge=bridge)

        class FakeTransferAdb:
            def __init__(self):
                self.commands = []

            def call(self, *parts, **_kwargs):
                self.commands.append(parts)
                if parts[:2] == ("shell", "pidof"):
                    return ""
                if parts[:2] == ("shell", "mkdir") or parts[0] == "push":
                    return ""
                if parts[:2] == ("shell", "sha256sum"):
                    return file_sha256(fixture_zip) + "  " + parts[2] + "\n"
                if parts == ("forward", "tcp:0", "tcp:27042"):
                    return "29999\n"
                if parts == ("forward", "--remove", "tcp:29999"):
                    return ""
                raise AssertionError("伪ADB收到未知命令：" + repr(parts))

        class FakeJournal:
            def append(self, _value):
                pass

        def denied_connection(_endpoint):
            raise RuntimeError("合成Frida连接失败")

        for index, module in enumerate((None, SimpleNamespace(get_device_manager=lambda: SimpleNamespace(add_remote_device=denied_connection)))):
            attempt = directory / ("forward-failure-" + str(index))
            (attempt / "source").mkdir(parents=True)
            fake_adb = FakeTransferAdb()
            with patch.dict(sys.modules, {"frida": module}):
                try:
                    run_resident(fake_adb, options, attempt, job, FakeJournal())
                except (ImportError, RuntimeError):
                    pass
                else:
                    raise AssertionError("Frida导入或连接失败未被拒绝")
            assert fake_adb.commands[-1] == ("forward", "--remove", "tcp:29999")
            assert fake_adb.commands.count(("forward", "--remove", "tcp:29999")) == 1
        passed.append("owned_adb_forward_removed_on_frida_import_or_connection_failure_synthetic")
    js_probe = r'''
const fs=require('fs'),vm=require('vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context);
const A=context.HardAudit;
const good={callCount:1,chooseCalls:1,browserCalls:1,createCalls:1,browserKind:'unit',createdId:'a',chooseId:'a',returnedId:'a'};
if(A.classify(good)!=='hard_js_primary')throw Error('主路径未识别');
for(const change of [{returnedId:'b'},{browserCalls:0},{createCalls:2},{browserKind:'error'}]){
 if(A.classify({...good,...change})==='hard_js_primary')throw Error('缺失证据被错误识别为主路径');
}
for(const [change,want] of [[{ordinary:true},'ordinary_ai'],[{fallback:true},'hard_java_fallback'],[{error:'e'},'decision_error'],[{chooseNull:true},'hard_fallback_required'],[{createdId:null},'create_action_rejected']]){
 if(A.classify({...good,...change})!==want)throw Error('路径分类错误');
}
const safe={workerAlive:false,inCall:false,pendingCallbacks:0,pageLoadPending:false,restartRequired:false};
if(!A.canCleanup(safe))throw Error('安全排空未识别');
for(const change of [{workerAlive:true},{inCall:true},{pendingCallbacks:1},{pageLoadPending:true},{restartRequired:true}]){
 if(A.canCleanup({...safe,...change}))throw Error('在途任务被错误视为排空');
}
console.log(JSON.stringify({pathClassification:true,lifecycleFailClosed:true}));
'''
    probe = subprocess.run(["node", "-e", js_probe, str(HERE / "audit_contract.js")], capture_output=True,
                           text=True, encoding="utf-8", check=True)
    assert json.loads(probe.stdout)["lifecycleFailClosed"]
    passed.append("javascript_path_classification_and_late_callback_cleanup_guard")
    result = {"offlineOnly": True, "deviceCommandsExecuted": 0, "fridaSessionsStarted": 0,
              "apkRuntimeTested": False, "collectorAcceptancePassed": False, "checksPassed": passed,
              "checkCount": len(passed), "completedUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "sourceSha256": {path.name: file_sha256(path) for path in sorted([*HERE.glob('*.py'), *HERE.glob('*.js')])},
              "note": "伪ADB、合成事件和本地语法/流检查；不代表原生采集器实机验收"}
    if args.output:
        write_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
