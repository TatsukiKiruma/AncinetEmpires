"""V17/T17-08：生成 run 目录的证据索引（路径、大小、SHA256），供下一轮复算与交接。

只读遍历，不修改任何产物。覆盖：
  * v17/out/<runId>/ 下除超大 JSONL 之外的全部文件（超大文件记录大小与 SHA 前缀标记）；
  * 本轮新增的 v17/{tools,teachers,scripts} 源码；
  * arena 各臂的 summary 汇总（胜/图/座位）一次读齐，避免下一轮再去翻分片。

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/make_v17_evidence_index.py --run-id v17_20260926_r2
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BIG_BYTES = 64 * 1024 * 1024


def sha256_file(path: Path, limit: int | None = None) -> str:
    h = hashlib.sha256()
    read = 0
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            h.update(block)
            read += len(block)
            if limit is not None and read >= limit:
                break
    return h.hexdigest()


def describe(path: Path, root: Path) -> dict:
    size = path.stat().st_size
    rel = str(path.relative_to(root)).replace("\\", "/")
    if size > BIG_BYTES:
        return {"path": rel, "bytes": size, "sha256": None,
                "sha256Note": f"超过 {BIG_BYTES} 字节，未取全量 SHA；用 `Get-FileHash <path> -Algorithm SHA256` 单独核验"}
    return {"path": rel, "bytes": size, "sha256": sha256_file(path)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v17_20260926_r2")
    args = parser.parse_args()

    run_root = REPO / "v17" / "out" / args.run_id
    if not run_root.exists():
        raise SystemExit(f"run 目录不存在：{run_root}")

    files = [describe(p, run_root) for p in sorted(run_root.rglob("*")) if p.is_file()]
    code_dirs = [REPO / "v17" / "tools", REPO / "v17" / "teachers", REPO / "v17" / "scripts"]
    code_files = []
    for d in code_dirs:
        if d.exists():
            for p in sorted(d.rglob("*")):
                if p.is_file() and "__pycache__" not in p.parts:
                    code_files.append(describe(p, REPO))

    # arena roll-up：把每个 summary.json 的核心读数抄进索引，下一轮不必翻分片
    rollup = {}
    for summary in sorted(run_root.rglob("*.summary.json")):
        try:
            data = json.loads(summary.read_text(encoding="utf-8"))
        except Exception as error:  # noqa: BLE001
            rollup[str(summary.relative_to(run_root)).replace("\\", "/")] = {"error": str(error)}
            continue
        for key, value in (data.get("models") or {}).items():
            rollup[key] = {
                "wins": value.get("wins"), "games": value.get("games"),
                "byMap": value.get("byMap"), "bySeat": value.get("bySeat"),
                "outcomeCounts": value.get("outcomeCounts"),
                "naturalCompletionRate": value.get("naturalCompletionRate"),
                "errors": value.get("errors"), "fallbacks": value.get("fallbacks"),
                "sha256": value.get("checkpointSha256"),
                "summaryFile": str(summary.relative_to(run_root)).replace("\\", "/"),
            }

    index = {
        "schema": "v17_evidence_index_1",
        "runId": args.run_id,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runRoot": str(run_root).replace("\\", "/"),
        "counts": {"runFiles": len(files), "codeFiles": len(code_files), "arenaArms": len(rollup)},
        "totalBytes": sum(f["bytes"] for f in files),
        "arena": rollup,
        "runFiles": files,
        "codeFiles": code_files,
        "note": (
            "本索引是交接用的只读快照。真正的权威来源仍是各 run 目录里的 metrics.json、"
            "*.optimizer_update_ledger.jsonl、*.games.jsonl 与 *.progress.json。"
        ),
    }
    out = run_root / "evidence_index.json"
    out.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"schema": index["schema"], "counts": index["counts"], "totalMB": round(index["totalBytes"] / 1024 / 1024, 1),
                      "arena": {k: f"{v.get('wins')}/{v.get('games')}" for k, v in rollup.items() if "wins" in v}}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())