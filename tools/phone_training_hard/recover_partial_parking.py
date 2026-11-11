"""核对暂存复制件后补回原目录；不覆盖已有原件，不删除任何暂存证据。"""

from pathlib import Path
import argparse
import json
import shlex
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
PACKAGE = "net.toyknight.aeii.android"
ROOT = Path(__file__).resolve().parents[2] / "ai_training/hard_native_3000_20261022"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output-name", default="parking-recovery-02")
    args = parser.parse_args()
    if not args.output_name.replace("-", "").isalnum():
        raise ValueError("恢复回执目录名非法")
    directory = ROOT / args.output_name
    directory.mkdir(exist_ok=False)
    backup = ROOT / "original-backup-02"
    parking = "/data/local/tmp/aeii-original-install-20261022-installation-01/ce"
    target = "/data/user/0/" + PACKAGE
    prefix = [args.adb, "-s", args.device]
    log = (directory / "events.jsonl").open("x", encoding="utf-8")

    def shell(command, timeout=120):
        result = subprocess.run([*prefix, "shell", "su", "-c", shlex.quote(command)], capture_output=True, timeout=timeout)
        value = result.stdout.decode("utf-8", errors="replace")
        log.write(json.dumps({"command": command, "returncode": result.returncode, "stdout": value,
                              "stderr": result.stderr.decode("utf-8", errors="replace")}, ensure_ascii=False) + "\n")
        log.flush()
        if result.returncode:
            raise RuntimeError("恢复操作失败，原件及暂存不删除")
        return value

    expected = {line.split(None, 1)[1].strip(): line.split()[0]
                for line in (backup / "device-files.sha256").read_text(encoding="utf-8").splitlines() if line.strip()}
    original_path = shell("pm path " + PACKAGE).strip().removeprefix("package:")
    if shell("sha256sum " + shlex.quote(original_path)).split()[0] != "51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b":
        raise RuntimeError("原版已改变，拒绝套用此恢复")
    raw = shell("cd " + shlex.quote(parking) + " && find . -type f -exec sha256sum {} +", timeout=600)
    lines = ["set -e"]
    verified = 0
    partial = []
    for line in raw.splitlines():
        value, relative = line.split(None, 1)
        relative = relative.strip().removeprefix("./")
        key = "user/0/" + PACKAGE + "/" + relative
        if key not in expected or ".." in Path(relative).parts:
            raise RuntimeError("暂存包含未知文件")
        source, destination = parking + "/" + relative, target + "/" + relative
        if value != expected[key]:
            if shell("sha256sum " + shlex.quote(destination)).split()[0] != expected[key]:
                raise RuntimeError("暂存和原目录均无完整文件，须用完整PC归档恢复：" + relative)
            partial.append(relative)
            continue
        # -n明确禁止覆盖已有原件；最终还要验证完整文件集合与全部摘要。
        lines.append("mkdir -p " + shlex.quote(destination.rsplit("/", 1)[0]))
        lines.append("cp -pn " + shlex.quote(source) + " " + shlex.quote(destination))
        verified += 1
    script = directory / "restore-verified-files.sh"
    script.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    remote = "/data/local/tmp/aeii-restore-verified-files-20261022.sh"
    subprocess.run([*prefix, "push", str(script), remote], check=True, capture_output=True)
    shell("sh " + remote, timeout=600)
    shell("chown -R 10435:10435 " + target + "; restorecon -RF " + target, timeout=300)
    raw = shell("cd /data && find user/0/" + PACKAGE + " user_de/0/" + PACKAGE + " -type f -exec sha256sum {} +", timeout=1800)
    actual = {line.split(None, 1)[1].strip(): line.split()[0] for line in raw.splitlines()}
    if actual != expected:
        raise RuntimeError("补回后完整文件集合或摘要仍不一致")
    result = {"originalInstalled": True, "restoredFiles": len(actual), "allOriginalFileHashesEqual": True,
              "verifiedParkingFiles": verified, "ignoredPartialCopiesWithGoodOriginal": partial,
              "parkingRetained": True, "pcArchiveRetained": True}
    (directory / "RECOVERY_VERIFIED.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False), flush=True)
    log.close()


if __name__ == "__main__":
    main()
