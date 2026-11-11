"""调度器的离线回归；所有设备操作均为伪对象，不连接手机。"""

from __future__ import annotations

import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import patch

import batch_controller as batch
import verified_device_archive as archive


def proc_stat(pid: int, start: str = "901") -> str:
    fields = ["S", *["0"] * 18, start, "0", "0"]
    return f"{pid} (名字 (含空格)) " + " ".join(fields) + "\n"


class FakeAdb:
    def __init__(self, pid: int = 123, start: str = "901", cmdline: str | None = None, pids: list[int] | None = None):
        self.pid, self.start = pid, start
        self.cmdline = cmdline if cmdline is not None else batch.EXPECTED["package"] + "\x00"
        self.current = [pid] if pids is None else pids
        self.commands: list[tuple] = []

    def pids(self) -> list[int]:
        return self.current.copy()

    def call(self, *parts: str) -> str:
        self.commands.append(parts)
        if parts == ("shell", "su", "-c", f"'cat /proc/{self.pid}/stat'"):
            return proc_stat(self.pid, self.start)
        if parts == ("shell", "su", "-c", f"'cat /proc/{self.pid}/cmdline'"):
            return self.cmdline
        if parts == ("shell", "su", "-c", f"'kill -TERM {self.pid}'"):
            self.current = []
            return ""
        raise AssertionError("不应发生的伪ADB命令：" + repr(parts))


class FakeArchiveAdb:
    def __init__(self, attempt: Path, attempt_id: str):
        self.base = "/data/data/" + batch.EXPECTED["package"] + "/files/.aeii-hard-collect"
        self.target = self.base + "/" + attempt_id
        self.files = {name: (attempt / "native" / name).read_bytes() for name in batch.SUCCESS_FILES}
        self.types: dict[str, str] = {}
        self.commands: list[str] = []
        self.current: list[int] = []
        self.leaf_type = "directory"
        self.leaf_exists = True
        self.fail_rm_number = None
        self.rm_count = 0

    def pids(self) -> list[int]:
        return self.current.copy()

    def call(self, *parts: str) -> str:
        if parts[:3] != ("shell", "su", "-c") or len(parts) != 4 or not parts[3].startswith("'") or not parts[3].endswith("'"):
            raise AssertionError("su命令必须整体单引号引用")
        command = parts[3][1:-1]
        self.commands.append(command)
        virtual_base = "/data/user/0/" + batch.EXPECTED["package"] + "/files/.aeii-hard-collect"
        if command == "readlink -f " + virtual_base:
            return self.base + "\n"
        if command.startswith("readlink -f "):
            return self.target + "\n"
        if command == 'stat -c "%F" ' + self.target:
            return self.leaf_type + "\n"
        if command == "find " + self.target + " -mindepth 1 -maxdepth 1 -print0":
            return "".join(self.target + "/" + name + "\x00" for name in sorted(self.files))
        if command.startswith('stat -c "%F %s" '):
            name = command.rsplit("/", 1)[-1]
            return self.types.get(name, "regular file") + " " + str(len(self.files[name])) + "\n"
        if command.startswith("sha256sum "):
            remote = command[len("sha256sum "):]
            name = remote.rsplit("/", 1)[-1]
            return hashlib.sha256(self.files[name]).hexdigest() + "  " + remote + "\n"
        if command.startswith("rm -- "):
            self.rm_count += 1
            if self.fail_rm_number == self.rm_count:
                raise RuntimeError("模拟删除中断")
            name = command.rsplit("/", 1)[-1]
            del self.files[name]
            return ""
        if command == "rmdir -- " + self.target:
            if self.files:
                raise RuntimeError("叶目录非空")
            self.leaf_exists = False
            return ""
        if command.startswith("if [ -e "):
            return "PRESENT\n" if self.leaf_exists else "ABSENT\n"
        raise AssertionError("不应发生的设备归档命令：" + command)


class FakeResourceAdb:
    def __init__(self, device: str, levels: list[int]):
        self.device, self.levels = device, levels
        self.current: list[int] = []
        self.bad_battery = False
        self.apk_sha = batch.EXPECTED["sha256"]

    def pids(self):
        return self.current.copy()

    def call(self, *parts):
        installed = "/data/app/offline-test/base.apk"
        if parts == ("get-state",):
            return "device\n"
        if parts == ("get-serialno",):
            return self.device + "\n"
        if parts == ("shell", "pm", "path", batch.EXPECTED["package"]):
            return "package:" + installed + "\n"
        if parts == ("shell", "sha256sum", installed):
            return self.apk_sha + "  " + installed + "\n"
        if parts == ("shell", "dumpsys", "battery"):
            if self.bad_battery:
                return "无法读取电池"
            level = self.levels.pop(0) if len(self.levels) > 1 else self.levels[0]
            return f"level: {level}\nscale: 100\ntemperature: 350\n"
        if parts == ("shell", "df", "-k", "/data"):
            return "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/test 9000000 1000000 8000000 10% /data\n"
        raise AssertionError("不应发生的资源检查命令：" + repr(parts))


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="hard-batch-offline-")
        self.directory = Path(self.temporary.name)
        self.plan = batch.load_plan(batch.DEFAULT_PLAN)
        self.job = batch.make_jobs(self.plan, "smoke", "offline-test", 20000)[0]
        self.device = "offline-serial"
        self.plan_sha = batch.digest(batch.DEFAULT_PLAN)

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        batch.write_new(path, value)

    def replace(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def make_attempt(self, attempt: Path, job: dict | None = None) -> None:
        job = job or self.job
        self.write(attempt / "request.json", {"job": job, "device": self.device})
        self.write(attempt / "device-static-identity.json", batch.EXPECTED)
        self.write(attempt / "resident-after-export.json", {"workerAlive": False, "cleanup": "safe", "fatal": None,
                                                             "pendingCallbacks": 0, "pageLoadPending": False})
        self.write(attempt / "owned-process.json", {"pid": 123, "launcherOwned": True, "startTimeTicks": "901",
            "device": self.device, "package": batch.EXPECTED["package"], "parentId": job["parentId"], "attemptId": job["attemptId"]})
        self.write(attempt / "summary.json", {"runtimeSmokeValid": True})
        self.write(attempt / "launch-config.json", {"nativeRoot": "/data/user/0/" + batch.EXPECTED["package"]
                   + "/files/.aeii-hard-collect/" + job["attemptId"]})
        for name in batch.SUCCESS_FILES:
            if name != "result.json":
                path = attempt / "native" / name
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(("离线假产物：" + name).encode("utf-8"))
        (attempt / "native/initial.bin").write_bytes(("初态：" + job["map"] + ";seed=" + str(job["seed"])).encode("utf-8"))
        with gzip.open(attempt / "native/actions.jsonl.gz", "wt", encoding="utf-8") as stream:
            for index in range(12):
                stream.write(json.dumps({"parentId": job["parentId"], "attemptId": job["attemptId"],
                    "index": index, "ai_seed": job["seed"] + index * 104729, "time": "测试时间",
                    "fields": {key: index if key == "a" else "动作" if key == "j" else 0 for key in "abcdefghij"}},
                    ensure_ascii=False) + "\n")
        self.write(attempt / "project-strict-verification.json", {"projectStrictVerified": True, "initialPlanMatched": True,
            "initialProjectionSha256": batch.object_sha({"map": job["map"], "rules": "离线规则初态"})})
        (attempt / "native/decision-evidence.jsonl").write_text("".join(json.dumps({
            "kind": kind, "actionIndex": index, "deviceNanos": str(index * 3000000000 + offset)}) + "\n"
            for index in range(12) for kind, offset in (("choose_enter", 0), ("choose_return", 1000000000))), encoding="utf-8")
        self.write(attempt / "native/result.json", {"parentId": job["parentId"], "attemptId": job["attemptId"],
            "naturalEnd": True, "jsSeedControlled": False, "jsRngMode": "original_webview_rng", "actions": 12,
            "elapsedSeconds": 15, "winnerMask": 0})
        self.write(attempt / "verification.json", {"passed": True, "nativeReplayVerified": True,
            "projectStrictVerified": True, "initialPlanMatched": True, "reliableValue": True, "valueEligible": True,
            "parentId": job["parentId"], "attemptId": job["attemptId"], "apkSha256": batch.EXPECTED["sha256"],
            "planSha256": self.plan_sha, "resultSha256": batch.digest(attempt / "native/result.json"),
            "fridaRemotePort": 27042,
            "artifactHashes": {name: batch.digest(attempt / "native" / name) for name in batch.SUCCESS_FILES}})

    def make_manifest(self, phase: str = "smoke") -> dict:
        verifier = (batch.HERE / "verification/run.py").resolve()
        sources = {str(verifier.relative_to(batch.ROOT)).replace("\\", "/"): batch.digest(verifier)}
        return {"phase": phase, "device": self.device, "sourceSha256": batch.object_sha(sources), "sources": sources,
                "python": sys.executable, "adb": "unused", "verifier": str(verifier),
                "fridaPort": 27042,
                "apkSha256": batch.EXPECTED["sha256"], "planSha256": self.plan_sha,
                "baseConfigSha256": "b" * 64, "baseConfigEntry": "base.bin", "javaBridgeSha256": "j" * 64,
                "jobs": batch.make_jobs(self.plan, phase, "offline-test", 20000), "limits": {}}

    def resident_receipts(self, attempt: Path, manifest: dict, plan: Path) -> None:
        plan.parent.mkdir(parents=True, exist_ok=True)
        if not plan.exists():
            plan.write_bytes(batch.DEFAULT_PLAN.read_bytes())
        self.write(attempt / "independent-verifier-command.json", {
            "command": batch.expected_verifier_command(attempt, manifest, plan),
            "verifierSha256": batch.digest(Path(manifest["verifier"])), "planSha256": self.plan_sha, "collectorResident": True})
        self.write(attempt / "independent-verifier-exit.json", {
            "returncode": 0, "hostPid": 456, "wallSeconds": 10, "collectorResident": True})
        self.write(attempt / "resident-after-verification.json", {
            "workerAlive": False, "cleanup": "safe", "fatal": None, "pendingCallbacks": 0,
            "pageLoadPending": False, "inCall": False, "restartRequired": False,
            "workerResult": batch.read_json(attempt / "native/result.json")})
        verification = batch.read_json(attempt / "verification.json")
        self.replace(attempt / "verification.json", {**verification, "fridaRemotePort": manifest["fridaPort"]})

    def qualify(self, directory: Path, manifest: dict, job: dict) -> None:
        self.make_attempt(directory / "launcher" / job["attemptId"], job)
        self.resident_receipts(directory / "launcher" / job["attemptId"], manifest,
                               directory.parents[1] / "shared/sampling-plan.json")
        self.write(directory / "launcher-exit.json", {"wallSeconds": 30})
        self.write(directory / "process-exit.json", {"processExited": True, "pid": 123})
        self.write(directory / "qualification.json", {"passed": True, "runBindingSha256": batch.object_sha(manifest),
            "jobSha256": batch.object_sha(job), "parentId": job["parentId"], "attemptId": job["attemptId"],
            "countsToward3000": job["countsToward3000"], "evidenceHashes": batch.tree_hashes(directory)})

    def test_plan_and_phase_counts_preserve_formal_quota(self):
        smoke = batch.make_jobs(self.plan, "smoke", "offline", 20000)
        acceptance = batch.make_jobs(self.plan, "acceptance", "offline", 20000)
        formal = batch.make_jobs(self.plan, "formal", "offline", 20000)
        self.assertEqual((len(smoke), len(acceptance), len(formal)), (1, 20, 3000))
        self.assertEqual(len({job["map"] for job in acceptance}), 8)
        self.assertEqual({job["parentId"] for job in formal}, {job["parentId"] for job in self.plan["jobs"]})
        self.assertTrue(all(job["countsToward3000"] for job in formal))
        self.assertTrue(all(not job["countsToward3000"] for job in smoke + acceptance))
        self.assertFalse({job["parentId"] for job in acceptance} & {job["parentId"] for job in formal})
        self.assertFalse({job["attemptId"] for job in acceptance} & {job["attemptId"] for job in formal})

    def test_frida_port_cli_default_and_boundaries(self):
        arguments = ["--phase", "smoke", "--run-dir", str(self.directory), "--device", self.device,
                     "--base-config-zip", "not-used.zip", "--base-config-entry", "base.bin"]
        self.assertEqual(batch.parser().parse_args(arguments).frida_port, 27042)
        for value in (1, 27043, 65535):
            self.assertEqual(batch.parser().parse_args([*arguments, "--frida-port", str(value)]).frida_port, value)
        for value in ("0", "65536", "-1", "invalid", "3.14"):
            with self.subTest(value=value), patch("sys.stderr"), self.assertRaises(SystemExit):
                batch.parser().parse_args([*arguments, "--frida-port", value])

    def test_frida_port_is_frozen_in_run_manifest(self):
        config = self.directory / "base.zip"
        config.write_bytes(b"offline-config")
        bridge = self.directory / "java.js"
        bridge.write_bytes(b"offline-bridge")
        directory = self.directory / "manifest-run"
        directory.mkdir()
        args = batch.parser().parse_args(["--phase", "smoke", "--run-dir", str(directory), "--device", self.device,
            "--base-config-zip", str(config), "--base-config-entry", "base.bin", "--java-bridge", str(bridge),
            "--frida-port", "27043"])
        with patch.object(batch, "source_identity", return_value={}):
            manifest = batch.create_or_load_run(args, directory)
            self.assertEqual(manifest["fridaPort"], 27043)
            before = batch.digest(directory / "run.json")
            args.frida_port = 27042
            with self.assertRaises(RuntimeError):
                batch.create_or_load_run(args, directory)
            self.assertEqual(batch.digest(directory / "run.json"), before)

    def test_stage_driver_port_default_forwarding_and_protocol_binding(self):
        path = batch.ROOT / "ai_training/hard_native_3000_20261022/run_stages.py"
        spec = importlib.util.spec_from_file_location("offline_frida_port_driver", path)
        driver = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(driver)
        config = self.directory / "base.zip"
        config.write_bytes(b"offline-config")
        bridge = self.directory / "java.js"
        bridge.write_bytes(b"offline-bridge")
        directory = self.directory / "driver-run"
        directory.mkdir()
        arguments = ["--run-root", str(directory), "--adb", sys.executable, "--device", self.device,
            "--base-config-zip", str(config), "--base-config-entry", "base.bin", "--java-bridge", str(bridge)]
        self.assertEqual(driver.parser().parse_args(arguments).frida_port, 27042)
        for value in ("0", "65536", "-1", "invalid"):
            with self.subTest(value=value), patch("sys.stderr"), self.assertRaises(SystemExit):
                driver.parser().parse_args([*arguments, "--frida-port", value])
        args = driver.parser().parse_args([*arguments, "--frida-port", "27043"])
        package = self.directory / "offline-frida"
        package.mkdir()
        module = package / "__init__.py"
        module.write_bytes(b"offline-fixture")
        environment = self.directory / "driver-environment"
        self.write(environment / "assets/RUNTIME_ENVIRONMENT.json", {"fridaVersion": "offline", "fridaPackage": str(package),
            "fridaFilesSha256": {"__init__.py": batch.digest(module)}, "pythonPath": "offline"})
        with patch.object(batch, "source_identity", return_value={}), patch.object(driver, "HERE", environment), \
                patch.dict(sys.modules, {"frida": SimpleNamespace(__file__=str(module), __version__="offline")}), \
                patch.dict(driver.os.environ, {"PYTHONPATH": "offline"}):
            protocol = driver.bind_protocol(args)
            self.assertEqual(protocol["fridaPort"], 27043)
            for command in protocol["commands"].values():
                self.assertEqual(command[command.index("--frida-port") + 1], "27043")
            args.frida_port = 27042
            with self.assertRaises(RuntimeError):
                driver.bind_protocol(args)

    def test_resident_verifier_receipts_bind_full_command_source_plan_and_exit(self):
        attempt = self.directory / "attempt"
        manifest = self.make_manifest()
        plan = self.directory / "shared/sampling-plan.json"
        self.make_attempt(attempt)
        self.resident_receipts(attempt, manifest, plan)
        batch.verify_resident_verification(attempt, manifest, plan)
        command_path = attempt / "independent-verifier-command.json"
        original = batch.read_json(command_path)
        for index in (0, 1, 3, 5, 7, 9, 11):
            changed = copy.deepcopy(original)
            changed["command"][index] = "changed"
            self.replace(command_path, changed)
            with self.subTest(command_index=index), self.assertRaises(RuntimeError):
                batch.verify_resident_verification(attempt, manifest, plan)
        for field, value in (("verifierSha256", "changed"), ("planSha256", "changed"), ("collectorResident", False)):
            self.replace(command_path, {**original, field: value})
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                batch.verify_resident_verification(attempt, manifest, plan)
        self.replace(command_path, original)
        exit_path = attempt / "independent-verifier-exit.json"
        original_exit = batch.read_json(exit_path)
        for field, value in (("returncode", 2), ("returncode", False), ("hostPid", 0),
                             ("wallSeconds", -1), ("wallSeconds", float("nan")), ("collectorResident", False)):
            self.replace(exit_path, {**original_exit, field: value})
            with self.subTest(field=field, value=value), self.assertRaises(RuntimeError):
                batch.verify_resident_verification(attempt, manifest, plan)
        self.replace(exit_path, original_exit)
        after_path = attempt / "resident-after-verification.json"
        original_after = batch.read_json(after_path)
        for field, value in (("workerAlive", True), ("cleanup", "restart_required"), ("pendingCallbacks", 1),
                             ("inCall", True), ("restartRequired", True), ("workerResult", {})):
            self.replace(after_path, {**original_after, field: value})
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                batch.verify_resident_verification(attempt, manifest, plan)

    def test_statistics_rejects_nested_verification_longer_than_launcher(self):
        manifest = self.make_manifest()
        self.qualify(self.directory / "jobs/0001", manifest, manifest["jobs"][0])
        self.replace(self.directory / "jobs/0001/launcher-exit.json", {"wallSeconds": 5})
        with self.assertRaises(RuntimeError):
            batch.storage_summary(self.directory, manifest["jobs"])

    def test_plan_rejects_duplicate_or_changed_quota_even_with_new_jobs_hash(self):
        for change in ("duplicate", "derived", "quota", "ordinary"):
            with self.subTest(change=change):
                plan = copy.deepcopy(self.plan)
                if change == "duplicate":
                    plan["jobs"][1]["parentId"] = plan["jobs"][0]["parentId"]
                elif change == "derived":
                    plan["jobs"][0]["derivedFrom"] = "historical"
                elif change == "quota":
                    plan["jobs"][0]["map"] = plan["jobs"][1]["map"]
                else:
                    plan["jobs"][0]["playerType"] = 2
                plan["jobsSha256"] = batch.object_sha(plan["jobs"])
                path = self.directory / (change + ".json")
                self.write(path, plan)
                with self.assertRaises(ValueError):
                    batch.load_plan(path)

    def test_resource_gate_boundaries_and_unreadable_fields(self):
        battery = "  level: 30\n  scale: 100\n  temperature: 420\n"
        disk = "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/test 8000000 2000000 4194304 50% /data\n"
        resources = batch.parse_resources(battery, disk, 12 * 1024**3)
        limits = {"minBatteryPercent": 30, "maxTemperatureC": 42, "minDeviceFreeBytes": 2 * 1024**3,
                  "minHostFreeBytes": 12 * 1024**3}
        batch.require_resources(resources, limits)
        for field, value in (("batteryPercent", 29.9), ("temperatureC", 42.1),
                             ("deviceFreeBytes", 1024), ("hostFreeBytes", 0)):
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                batch.require_resources({**resources, field: value}, limits)
        with self.assertRaises(ValueError):
            batch.parse_resources(battery + "  level: 30\n", disk, 12 * 1024**3)
        with self.assertRaises(ValueError):
            batch.parse_resources(battery, disk.replace("/data", "/other"), 12 * 1024**3)

    def test_proc_start_time_with_spaces_and_parentheses(self):
        self.assertEqual(batch.process_start_time(proc_stat(123), 123), "901")
        with self.assertRaises(RuntimeError):
            batch.process_start_time(proc_stat(124), 123)
        with self.assertRaises(RuntimeError):
            batch.process_start_time("123 (truncated) S 1", 123)

    def test_run_lock_refuses_second_controller_and_releases_after_exit(self):
        with batch.run_lock(self.directory):
            with self.assertRaises(OSError):
                with batch.run_lock(self.directory):
                    self.fail("不应同时取得同一轮次调度锁")
        with batch.run_lock(self.directory):
            self.assertTrue((self.directory / "controller.lock").is_file())

    def test_only_safe_owned_pid_can_be_stopped(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        adb = FakeAdb()
        receipt = batch.stop_owned_process(adb, attempt, self.job, self.device, "su")
        self.assertTrue(receipt["processExited"])
        self.assertIn(("shell", "su", "-c", "'kill -TERM 123'"), adb.commands)
        self.assertFalse(any("force-stop" in part for command in adb.commands for part in command))

    def test_reused_pid_unknown_process_and_unsafe_cleanup_never_kill(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        cases = [FakeAdb(start="902"), FakeAdb(cmdline="other.app\x00"), FakeAdb(pids=[123, 124]), FakeAdb(pids=[124])]
        for adb in cases:
            with self.subTest(adb=adb), self.assertRaises(RuntimeError):
                batch.stop_owned_process(adb, attempt, self.job, self.device, "su")
            self.assertFalse(any("kill" in part for command in adb.commands for part in command))
        self.replace(attempt / "resident-after-export.json", {"workerAlive": True, "cleanup": "restart_required"})
        adb = FakeAdb()
        with self.assertRaises(RuntimeError):
            batch.stop_owned_process(adb, attempt, self.job, self.device, "su")
        self.assertEqual(adb.commands, [])

    def test_already_exited_owned_process_does_not_signal(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        adb = FakeAdb(pids=[])
        receipt = batch.stop_owned_process(adb, attempt, self.job, self.device, "su")
        self.assertTrue(receipt["alreadyExited"])
        self.assertFalse(receipt["signalSent"])
        self.assertEqual(adb.commands, [])

    def test_independent_verification_binds_all_artifact_and_result_hashes(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        batch.verify_attempt(attempt, self.job, self.device, self.plan_sha)
        for field in ("passed", "nativeReplayVerified", "projectStrictVerified", "initialPlanMatched", "reliableValue", "valueEligible"):
            original = batch.read_json(attempt / "verification.json")
            self.replace(attempt / "verification.json", {**original, field: False})
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                batch.verify_attempt(attempt, self.job, self.device, self.plan_sha)
            self.replace(attempt / "verification.json", original)
        (attempt / "native/initial.bin").write_bytes(b"changed")
        with self.assertRaises(RuntimeError):
            batch.verify_attempt(attempt, self.job, self.device, self.plan_sha)

    def test_truncation_or_changed_request_never_qualifies(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        request = batch.read_json(attempt / "request.json")
        self.replace(attempt / "request.json", {**request, "job": {**request["job"], "seed": 0}})
        with self.assertRaises(RuntimeError):
            batch.verify_attempt(attempt, self.job, self.device, self.plan_sha)
        self.replace(attempt / "request.json", request)
        result = batch.read_json(attempt / "native/result.json")
        self.replace(attempt / "native/result.json", {**result, "naturalEnd": False})
        with self.assertRaises(RuntimeError):
            batch.verify_attempt(attempt, self.job, self.device, self.plan_sha)

    def test_resume_skips_qualified_parent_without_device_access(self):
        manifest = self.make_manifest()
        job = manifest["jobs"][0]
        self.write(self.directory / "run.json", manifest)
        self.qualify(self.directory / "jobs/0001", manifest, job)
        journal = batch.Journal(self.directory / "events.jsonl")
        controller = batch.Controller(SimpleNamespace(phase="smoke", device=self.device, adb="unused"), self.directory, manifest, journal)
        try:
            with patch.object(controller, "execute", side_effect=AssertionError("恢复不应重跑")):
                self.assertEqual(controller.run(), 0)
            self.assertEqual(batch.read_json(self.directory / "STATE.json")["qualifiedParents"], 1)
            self.assertEqual(batch.read_json(self.directory / "complete.json")["formalQualifiedParents"], 0)
        finally:
            journal.close()

    def test_resume_retains_failed_attempt_and_rejects_tampered_receipt(self):
        manifest = self.make_manifest()
        directory = self.directory / "jobs/0001"
        directory.mkdir(parents=True)
        (directory / "failure.txt").write_text("保留失败", encoding="utf-8")
        journal = batch.Journal(self.directory / "events.jsonl")
        controller = batch.Controller(SimpleNamespace(phase="smoke", device=self.device, adb="unused"), self.directory, manifest, journal)
        try:
            with patch.object(controller, "execute", side_effect=AssertionError("失败不应自动重跑")):
                with self.assertRaises(RuntimeError):
                    controller.run()
            self.assertEqual((directory / "failure.txt").read_text(encoding="utf-8"), "保留失败")
            self.qualify(directory, manifest, manifest["jobs"][0])
            (directory / "failure.txt").write_text("被修改", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                batch.validate_qualification(directory, manifest, manifest["jobs"][0])
        finally:
            journal.close()

    def test_source_drift_fails_closed(self):
        with patch.object(batch, "source_identity", return_value={"changed.py": "different"}):
            with self.assertRaises(RuntimeError):
                batch.assert_sources({"sources": {"old.py": "original"}})

    def test_semantic_trajectory_ignores_seed_identity_time_and_field_key_order(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        native = attempt / "native"
        original = batch.semantic_trajectory(native)["semanticTrajectorySha256"]
        with gzip.open(native / "actions.jsonl.gz", "rt", encoding="utf-8") as stream:
            actions = [json.loads(line) for line in stream]

        def save_actions(rows):
            with gzip.open(native / "actions.jsonl.gz", "wt", encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row, ensure_ascii=False) + "\n")

        for row in actions:
            row.update({"parentId": "other-parent", "attemptId": "other-attempt", "ai_seed": 999, "time": "其他时间"})
            row["fields"] = dict(reversed(list(row["fields"].items())))
        save_actions(actions)
        result = batch.read_json(native / "result.json")
        self.replace(native / "result.json", {**result, "parentId": "other-parent", "seed": 999, "elapsedSeconds": 999})
        self.assertEqual(batch.semantic_trajectory(native)["semanticTrajectorySha256"], original)
        actions[0]["fields"]["a"] = 99
        save_actions(actions)
        self.assertNotEqual(batch.semantic_trajectory(native)["semanticTrajectorySha256"], original)
        actions[0]["fields"]["a"] = 0
        save_actions(list(reversed(actions)))
        self.assertNotEqual(batch.semantic_trajectory(native)["semanticTrajectorySha256"], original)
        save_actions(actions)
        self.replace(native / "result.json", {**result, "winnerMask": 1})
        self.assertNotEqual(batch.semantic_trajectory(native)["semanticTrajectorySha256"], original)

    def test_missing_rule_projection_reports_unknown_without_raw_snapshot_substitution(self):
        manifest = self.make_manifest()
        self.qualify(self.directory / "jobs/0001", manifest, manifest["jobs"][0])
        projected = self.directory / "jobs/0001/launcher" / self.job["attemptId"] / "project-strict-verification.json"
        projected.unlink()
        summary = batch.experience_diversity(self.directory, manifest["jobs"])
        self.assertEqual(summary["nativeInitialSnapshots"]["distinctCount"], 1)
        self.assertEqual(summary["ruleInitialProjections"]["measuredParents"], 0)
        self.assertFalse(summary["ruleInitialProjections"]["coverageComplete"])
        self.assertIsNone(summary["ruleInitialProjections"]["duplicateRate"])

    def test_archive_is_explicitly_disabled_by_default(self):
        args = batch.parser().parse_args(["--phase", "smoke", "--run-dir", str(self.directory),
            "--device", self.device, "--base-config-zip", "not-used.zip", "--base-config-entry", "base.bin"])
        self.assertFalse(args.archive_device_copies)
        self.assertFalse(args.wait_resources)

    def resource_controller(self):
        manifest = self.make_manifest()
        manifest["limits"] = {"minBatteryPercent": 30, "maxTemperatureC": 42,
                              "minDeviceFreeBytes": 2 * 1024**3, "minHostFreeBytes": 12 * 1024**3}
        journal = batch.Journal(self.directory / "resource-events.jsonl")
        controller = batch.Controller(SimpleNamespace(phase="smoke", device=self.device, adb="unused", wait_resources=True),
                                      self.directory, manifest, journal)
        controller.pending_job = self.job
        return controller, journal

    def test_resource_wait_recovers_before_any_parent_is_started(self):
        controller, journal = self.resource_controller()
        controller.adb = FakeResourceAdb(self.device, [29, 31])
        try:
            with patch.object(controller, "guard"), patch.object(batch.time, "sleep") as sleep, patch("builtins.print"), \
                    patch.object(batch.shutil, "disk_usage", return_value=SimpleNamespace(free=32 * 1024**3)):
                self.assertEqual(controller.resource_gate()["batteryPercent"], 31)
                sleep.assert_called_once_with(30)
            self.assertFalse((self.directory / "jobs").exists())
            status = batch.read_json(self.directory / "STATE.json")
            self.assertEqual(status["stage"], "waiting_resources")
            self.assertEqual(status["pendingParent"], self.job["parentId"])
            self.assertEqual(status["qualifiedParents"], 0)
        finally:
            journal.close()

    def test_resource_wait_does_not_hide_bad_device_reads_or_unknown_process(self):
        controller, journal = self.resource_controller()
        try:
            with patch.object(controller, "guard"), patch.object(batch.time, "sleep") as sleep, \
                    patch.object(batch.shutil, "disk_usage", return_value=SimpleNamespace(free=32 * 1024**3)):
                for kind in ("unknown-pid", "bad-battery", "wrong-apk"):
                    controller.adb = FakeResourceAdb(self.device, [29])
                    if kind == "unknown-pid":
                        controller.adb.current = [999]
                    elif kind == "bad-battery":
                        controller.adb.bad_battery = True
                    else:
                        controller.adb.apk_sha = "0" * 64
                    with self.subTest(kind=kind), self.assertRaises((RuntimeError, ValueError)):
                        controller.resource_gate()
                sleep.assert_not_called()
            self.assertFalse((self.directory / "jobs").exists())
        finally:
            journal.close()

    def test_source_drift_during_resource_wait_stops_without_starting_parent(self):
        controller, journal = self.resource_controller()
        controller.adb = FakeResourceAdb(self.device, [29])
        try:
            with patch.object(controller, "guard", side_effect=[None, RuntimeError("源码变化")]), patch("builtins.print"), \
                    patch.object(batch.time, "sleep") as sleep, \
                    patch.object(batch.shutil, "disk_usage", return_value=SimpleNamespace(free=32 * 1024**3)):
                with self.assertRaises(RuntimeError):
                    controller.resource_gate()
                sleep.assert_called_once_with(30)
            self.assertFalse((self.directory / "jobs").exists())
        finally:
            journal.close()

    def test_archive_removes_only_seven_current_files_after_verification_and_exit(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        adb = FakeArchiveAdb(attempt, self.job["attemptId"])
        before = {name: batch.digest(attempt / "native" / name) for name in batch.SUCCESS_FILES}
        receipt = archive.archive_verified_device_copies(adb, attempt, self.job, self.device,
            {"processExited": True, "pid": 123}, self.directory / "device-archive-receipt.json")
        self.assertTrue(receipt["removed"])
        self.assertTrue(receipt["leafRemoved"])
        self.assertTrue(all(item["removed"] for item in receipt["files"]))
        self.assertEqual(adb.files, {})
        self.assertEqual({name: batch.digest(attempt / "native" / name) for name in batch.SUCCESS_FILES}, before)
        mutations = [command for command in adb.commands if command.startswith(("rm ", "rmdir "))]
        self.assertEqual(set(mutations), {"rm -- " + adb.target + "/" + name for name in batch.SUCCESS_FILES}
                         | {"rmdir -- " + adb.target})
        self.assertFalse(any("*" in command or "rm -r" in command for command in mutations))
        with self.assertRaises(FileExistsError):
            archive.archive_verified_device_copies(adb, attempt, self.job, self.device,
                {"processExited": True, "pid": 123}, self.directory / "device-archive-receipt.json")

    def test_archive_rejects_unknown_entries_symlinks_and_changed_device_hashes_before_rm(self):
        for kind in ("unknown", "symlink-file", "symlink-leaf", "wrong-sha", "wrong-canonical", "still-running"):
            with self.subTest(kind=kind):
                attempt = self.directory / kind
                self.make_attempt(attempt)
                adb = FakeArchiveAdb(attempt, self.job["attemptId"])
                if kind == "unknown":
                    adb.files["unknown.txt"] = b"keep"
                elif kind == "symlink-file":
                    adb.types["initial.bin"] = "symbolic link"
                elif kind == "symlink-leaf":
                    adb.leaf_type = "symbolic link"
                elif kind == "wrong-sha":
                    adb.files["initial.bin"] = adb.files["initial.bin"][:-1] + b"x"
                elif kind == "wrong-canonical":
                    adb.target = adb.base + "-foreign/" + self.job["attemptId"]
                else:
                    adb.current = [999]
                with self.assertRaises(RuntimeError):
                    archive.archive_verified_device_copies(adb, attempt, self.job, self.device,
                        {"processExited": True, "pid": 123}, self.directory / (kind + "-receipt.json"))
                self.assertFalse(any(command.startswith(("rm ", "rmdir ")) for command in adb.commands))
                self.assertFalse(batch.read_json(self.directory / (kind + "-receipt.json"))["removed"])

    def test_archive_rejects_traversal_or_changed_pc_original_before_device_reads(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        adb = FakeArchiveAdb(attempt, self.job["attemptId"])
        with self.assertRaises(RuntimeError):
            archive.archive_verified_device_copies(adb, attempt, {**self.job, "attemptId": "../other"}, self.device,
                {"processExited": True, "pid": 123}, self.directory / "unsafe-id.json")
        self.assertEqual(adb.commands, [])
        (attempt / "native/initial.bin").write_bytes(b"changed-pc-original")
        with self.assertRaises(RuntimeError):
            archive.archive_verified_device_copies(adb, attempt, self.job, self.device,
                {"processExited": True, "pid": 123}, self.directory / "changed-host.json")
        self.assertEqual(adb.commands, [])

    def test_partial_archive_stops_without_recursive_cleanup_and_retains_pc(self):
        attempt = self.directory / "attempt"
        self.make_attempt(attempt)
        adb = FakeArchiveAdb(attempt, self.job["attemptId"])
        adb.fail_rm_number = 2
        before = {name: batch.digest(attempt / "native" / name) for name in batch.SUCCESS_FILES}
        destination = self.directory / "partial-receipt.json"
        with self.assertRaises(RuntimeError):
            archive.archive_verified_device_copies(adb, attempt, self.job, self.device,
                {"processExited": True, "pid": 123}, destination)
        receipt = batch.read_json(destination)
        self.assertFalse(receipt["removed"])
        self.assertTrue(receipt["partialRemoval"])
        self.assertEqual(sum(item["removed"] for item in receipt["files"]), 1)
        self.assertEqual(len(adb.files), 6)
        self.assertFalse(any(command.startswith("rmdir ") for command in adb.commands))
        self.assertEqual({name: batch.digest(attempt / "native" / name) for name in batch.SUCCESS_FILES}, before)

    def test_storage_projection_uses_eight_map_quota_and_keeps_evidence(self):
        manifest = self.make_manifest("acceptance")
        for job in manifest["jobs"]:
            self.qualify(self.directory / "jobs" / f"{job['index']:04d}", manifest, job)
        summary = batch.storage_summary(self.directory, manifest["jobs"])
        self.assertEqual(summary["observedParents"], 20)
        self.assertEqual(len(summary["maps"]), 8)
        projected = summary["formal3000Projection"]
        self.assertEqual(projected["hostBytesAtObservedMapMeans"],
                         int(sum(row["meanHostBytes"] * 375 for row in summary["maps"].values())))
        self.assertFalse(summary["capacityGuaranteed"])
        self.assertEqual(projected["nativeWorkerSecondsAtObservedMapMeans"], 15 * 3000)
        self.assertEqual(projected["hardJsBridgeWallSecondsAtObservedMapMeans"], 12 * 3000)
        self.assertEqual(projected["launcherTotalWallSecondsAtObservedMapMeans"], 30 * 3000)
        self.assertEqual(projected["collectorAndLifecycleWallSecondsAtObservedMapMeans"], 20 * 3000)
        self.assertEqual(projected["verificationWallSecondsAtObservedMapMeans"], 10 * 3000)
        diversity = summary["experienceDiversity"]
        self.assertEqual(diversity["observedParents"], 20)
        self.assertEqual(diversity["distinctParentIds"], 20)
        self.assertEqual(diversity["nativeInitialSnapshots"]["distinctCount"], 20)
        self.assertEqual(diversity["ruleInitialProjections"]["distinctCount"], 8)
        self.assertEqual(diversity["semanticActionTrajectories"]["distinctCount"], 1)
        self.assertEqual(diversity["semanticActionTrajectories"]["duplicateRate"], 19 / 20)
        self.assertEqual(diversity["ruleInitialAndTrajectoryPairs"]["distinctCount"], 8)
        for job in manifest["jobs"]:
            batch.validate_qualification(self.directory / "jobs" / f"{job['index']:04d}", manifest, job)

    def test_execute_verifies_then_stops_then_writes_qualification(self):
        manifest = self.make_manifest()
        manifest["fridaPort"] = 27043
        args = SimpleNamespace(phase="smoke", device=self.device, adb="unused", python=sys.executable,
            launcher=batch.HERE / "launch_collect.py", verifier=batch.HERE / "verification/run.py",
            max_seconds=21600, base_config_entry="base.bin", kill_via="su", frida_port=27043)
        journal = batch.Journal(self.directory / "events.jsonl")
        controller = batch.Controller(args, self.directory, manifest, journal)
        ordered = []

        def child(_command, directory, label):
            ordered.append(label)
            self.assertEqual(label, "launcher")
            self.assertEqual(_command[_command.index("--frida-port") + 1], "27043")
            self.assertIn("--verify-before-detach", _command)
            self.assertEqual(_command[_command.index("--verifier") + 1], manifest["verifier"])
            self.assertEqual(_command[_command.index("--verification-plan") + 1], str(self.directory / "shared/sampling-plan.json"))
            if label == "launcher":
                self.make_attempt(directory / "launcher" / self.job["attemptId"])
                self.resident_receipts(directory / "launcher" / self.job["attemptId"], manifest,
                                       self.directory / "shared/sampling-plan.json")
            return 0

        def stop(*_arguments):
            self.assertEqual(ordered, ["launcher"])
            ordered.append("stop_owned")
            return {"processExited": True, "pid": 123}

        try:
            with patch.object(controller, "guard"), patch.object(controller, "resource_gate", return_value={}), \
                    patch.object(controller, "child", side_effect=child), patch.object(batch, "stop_owned_process", side_effect=stop):
                controller.execute(self.job)
            self.assertEqual(ordered, ["launcher", "stop_owned"])
            batch.validate_qualification(self.directory / "jobs/0001", manifest, self.job)
        finally:
            journal.close()

    def test_failed_verification_never_stops_process_or_qualifies(self):
        manifest = self.make_manifest()
        args = SimpleNamespace(phase="smoke", device=self.device, adb="unused", python=sys.executable,
            launcher=batch.HERE / "launch_collect.py", verifier=batch.HERE / "verification/run.py",
            max_seconds=21600, base_config_entry="base.bin", kill_via="su")
        journal = batch.Journal(self.directory / "events.jsonl")
        controller = batch.Controller(args, self.directory, manifest, journal)

        def child(_command, directory, label):
            if label == "launcher":
                attempt = directory / "launcher" / self.job["attemptId"]
                self.make_attempt(attempt)
                self.resident_receipts(attempt, manifest, self.directory / "shared/sampling-plan.json")
                self.replace(attempt / "independent-verifier-exit.json", {
                    "returncode": 2, "hostPid": 456, "wallSeconds": 10, "collectorResident": True})
                return 0
            return 2

        try:
            with patch.object(controller, "guard"), patch.object(controller, "resource_gate", return_value={}), \
                    patch.object(controller, "child", side_effect=child), patch.object(batch, "stop_owned_process") as stopped:
                with self.assertRaises(RuntimeError):
                    controller.execute(self.job)
                stopped.assert_not_called()
            self.assertTrue((self.directory / "jobs/0001/launcher" / self.job["attemptId"] / "verification.json").is_file())
            self.assertFalse((self.directory / "jobs/0001/qualification.json").exists())
        finally:
            journal.close()

    def test_enabled_archive_runs_after_exit_and_before_qualification(self):
        manifest = self.make_manifest()
        manifest["archiveDeviceCopies"] = True
        args = SimpleNamespace(phase="smoke", device=self.device, adb="unused", python=sys.executable,
            launcher=batch.HERE / "launch_collect.py", verifier=batch.HERE / "verification/run.py",
            max_seconds=21600, base_config_entry="base.bin", kill_via="su", archive_device_copies=True)
        journal = batch.Journal(self.directory / "events.jsonl")
        controller = batch.Controller(args, self.directory, manifest, journal)
        ordered = []

        def child(_command, directory, label):
            ordered.append(label)
            if label == "launcher":
                self.make_attempt(directory / "launcher" / self.job["attemptId"])
                self.resident_receipts(directory / "launcher" / self.job["attemptId"], manifest,
                                       self.directory / "shared/sampling-plan.json")
            return 0

        def stop(*_arguments):
            ordered.append("process_exit")
            return {"processExited": True, "pid": 123}

        def archived(_adb, attempt, job, device, process_exit, destination):
            self.assertEqual(ordered, ["launcher", "process_exit"])
            self.assertTrue(process_exit["processExited"])
            self.assertTrue((destination.parent / "process-exit.json").is_file())
            self.assertFalse((destination.parent / "qualification.json").exists())
            self.assertEqual(batch.digest(attempt / "native/result.json"),
                             batch.read_json(attempt / "verification.json")["resultSha256"])
            ordered.append("archive")
            receipt = {"enabled": True, "removed": True, "pcOriginalsRetained": True, "leafRemoved": True,
                       "parentId": job["parentId"], "attemptId": job["attemptId"]}
            self.write(destination, receipt)
            return receipt

        try:
            with patch.object(controller, "guard"), patch.object(controller, "resource_gate", return_value={}), \
                    patch.object(controller, "child", side_effect=child), patch.object(batch, "stop_owned_process", side_effect=stop), \
                    patch.object(batch, "archive_verified_device_copies", side_effect=archived):
                controller.execute(self.job)
            self.assertEqual(ordered, ["launcher", "process_exit", "archive"])
            qualification = batch.validate_qualification(self.directory / "jobs/0001", manifest, self.job)
            self.assertIn("device-archive-receipt.json", qualification["evidenceHashes"])
        finally:
            journal.close()

    def test_prerequisite_requires_real_complete_bound_receipts(self):
        prior = self.make_manifest()
        self.write(self.directory / "run.json", prior)
        self.qualify(self.directory / "jobs/0001", prior, prior["jobs"][0])
        self.write(self.directory / "complete.json", {"passed": True, "qualifiedParents": 1,
            "runBindingSha256": batch.object_sha(prior), "qualifiedReceiptHashes": {
                "0001": batch.digest(self.directory / "jobs/0001/qualification.json")}})
        current = self.make_manifest("acceptance")
        self.assertEqual(batch.require_prerequisite(self.directory, "acceptance", current)["runSha256"],
                         batch.digest(self.directory / "run.json"))
        for key, value in (("device", "other-device"), ("sourceSha256", "changed"), ("planSha256", "changed"),
                           ("baseConfigSha256", "changed"), ("javaBridgeSha256", "changed"), ("fridaPort", 27043)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                batch.require_prerequisite(self.directory, "acceptance", {**current, key: value})
        with self.assertRaises(ValueError):
            batch.require_prerequisite(None, "formal", current)


if __name__ == "__main__":
    unittest.main(verbosity=2)
