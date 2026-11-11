"""核对指定APK、DEX与全部二十张地图字节，不装载或执行游戏。"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import zipfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
APK = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\SHIINA\Downloads\aer-4.2.5.1-patch.apk.1")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    target = OUT / "evidence" / (sys.argv[2] if len(sys.argv) > 2 else "APK_PROBE.json")
    if target.exists():
        raise FileExistsError("拒绝覆盖既有APK检查证据")
    maps = json.loads((OUT / "source/ai_training/hard_curriculum3000_plan_20261027/MAP_INVENTORY.json").read_text("utf-8"))["maps"]
    record = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "pid": os.getpid(),
              "parentPid": os.getppid(), "executable": sys.executable, "argv": sys.argv,
              "apk": str(APK), "exists": APK.exists(), "gamesStarted": 0,
              "freeBytes": shutil.disk_usage(ROOT).free, "replay": "disabled_by_user"}
    try:
        raw = APK.read_bytes()
        record["apkSha256"] = sha(raw)
        if record["apkSha256"] != "a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48":
            raise ValueError("APK身份不符")
        with zipfile.ZipFile(APK) as archive:
            names = archive.namelist()
            record["dex"] = [{"name": name, "bytes": archive.getinfo(name).file_size,
                              "sha256": sha(archive.read(name))} for name in names if name.endswith(".dex")]
            record["jvmClassFiles"] = [name for name in names if name.endswith(".class")]
            record["nativeLibraries"] = [name for name in names if name.startswith("lib/") and name.endswith(".so")]
            html = archive.read("assets/hard-ai/runtime.html")
            record["originalHtmlSha256"] = sha(html)
            fixed = (OUT / "source/ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html").read_bytes()
            expected_fixed = html.decode("utf-8").replace("const TEAM_POPULATION_LIMIT = 100;", "const TEAM_POPULATION_LIMIT = 30;")
            before, marker, after = expected_fixed.rpartition("</body>")
            expected_fixed = before + "<script>window.__AEII_NATIVE_POP_LIMIT__=30;</script>\n" + marker + after
            record["existingFixedHtmlOnlyApprovedPopulationPatch"] = expected_fixed.encode("utf-8") == fixed
            checks = []
            for item in maps:
                apk_bytes = archive.read("assets/maps/" + item["name"])
                local_path = ROOT / item["path"]
                checks.append({"map": item["name"], "expected": item["sha256"],
                               "apkSha256": sha(apk_bytes), "localExists": local_path.exists(),
                               "localSha256": sha(local_path.read_bytes()) if local_path.exists() else None,
                               "approximateTileCount": item["confidence"]["approximateTileCount"]})
            record["maps"] = checks
            record["allMapBytesMatch"] = all(item["expected"] == item["apkSha256"] == item["localSha256"] for item in checks)
        record["passed"] = record["allMapBytesMatch"] and record["existingFixedHtmlOnlyApprovedPopulationPatch"]
    except Exception as error:
        record.update(passed=False, error=repr(error))
    with target.open("x", encoding="utf-8") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
    print(json.dumps({key: value for key, value in record.items() if key != "maps"}, ensure_ascii=False))
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
