"""上传一次性手机本地任务，启动后退出；不在电脑上维持调度。"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess

from prepare_standalone import OUT, REMOTE

ADB = "C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe"
SERIAL = "c2357770"
PACKAGE = "net.toyknight.aeii.android"


def adb(*args: str, timeout: int = 90, missing: bool = False) -> str:
    result = subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, timeout=timeout)
    output = result.stdout.decode("utf-8", "replace")
    error = result.stderr.decode("utf-8", "replace")
    if result.returncode and not (missing and result.returncode == 1 and not output.strip() and not error.strip()):
        raise RuntimeError(error + output)
    return output.strip()


def root(command: str, **kwargs) -> str:
    if "'" in command:
        raise ValueError("手机命令不允许嵌套单引号")
    return adb("shell", "su", "-c", "'" + command + "'", **kwargs)


def main() -> None:
    if (OUT / "DEPLOYED.json").exists():
        raise ValueError("本次部署记录已存在，不重复启动")
    if root("pidof " + PACKAGE, missing=True):
        raise ValueError("已有应用进程，不覆盖或停止")
    binary = OUT / "aeii-hard-inject-17.2.5"
    digest = hashlib.file_digest(binary.open("rb"), "sha256").hexdigest()
    observed = root("sha256sum /data/local/tmp/aeii-hard-inject-17.2.5").split()[0]
    assert digest == observed
    # 仅允许恢复尚未启动过的上传；已有运行锁或进度时拒绝覆盖。
    root("test ! -e " + REMOTE + "/controller.lock && test ! -e " + REMOTE + "/STATE.json")
    root("mkdir -p " + REMOTE + "/logs")
    # ADB以shell身份上传；上传后再将专用目录收紧为只读输入。
    root("chmod 777 " + REMOTE)
    files = ["collector.bundle.js", "controller.sh", "index.txt", "base-config.zip", "STANDALONE_PLAN.json", "SOURCE_SHA256.json"]
    for name in files:
        adb("push", str(OUT / name), REMOTE + "/" + name)
        expected = hashlib.file_digest((OUT / name).open("rb"), "sha256").hexdigest()
        assert root("sha256sum " + REMOTE + "/" + name).split()[0] == expected
    adb("push", str(OUT / "configs"), REMOTE + "/configs", timeout=180)
    assert root("find " + REMOTE + "/configs -type f | wc -l") == "998"
    expected_configs = {REMOTE + "/configs/" + p.name: hashlib.file_digest(p.open("rb"), "sha256").hexdigest() for p in (OUT / "configs").iterdir()}
    actual_configs = {}
    for line in root("sha256sum " + REMOTE + "/configs/*.json").splitlines():
        file_hash, filename = line.split(None, 1)
        actual_configs[filename.strip()] = file_hash
    assert actual_configs == expected_configs
    root("chmod 755 " + REMOTE + " " + REMOTE + "/configs")
    root("chmod 644 " + REMOTE + "/base-config.zip " + REMOTE + "/configs/*.json")
    root("sh -n " + REMOTE + "/controller.sh")
    # 独立会话、全部标准流重定向；后续进度和任务循环均在手机上。
    command = "setsid sh " + REMOTE + "/controller.sh " + REMOTE + " </dev/null >" + REMOTE + "/controller.log 2>&1 &"
    root(command)
    receipt = {"schema": "hard-phone-standalone-deployed-v1", "utc": dt.datetime.now(dt.timezone.utc).isoformat(),
               "device": SERIAL, "remoteRoot": REMOTE, "computerRequired": False, "remaining": 998, "alreadyCompleted": 2,
               "injectBinarySha256": digest, "startCommand": command,
               "stateCommand": "adb -s " + SERIAL + " shell su -c \"'cat " + REMOTE + "/STATE.json'\""}
    with (OUT / "DEPLOYED.json").open("x", encoding="utf-8") as output:
        json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
