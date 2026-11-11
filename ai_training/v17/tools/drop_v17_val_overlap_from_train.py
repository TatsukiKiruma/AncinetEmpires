"""从训练集中剔除出现在指定 val 文件里的 actualInputKey，保证 val 与 B0/B1 逐行相同。

中文：B2 的学生态里有一小部分与冻结 val 撞输入（11 行）。为了让"同一份 val"这件事
真正成立（而不是 val 行数从 5,316 缩到 5,305），这里从 **train** 侧剔除撞车行，
val 保持不动。被剔除的行写入证据文件。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def resolve(spec: str) -> Path:
    p = Path(spec)
    return p if p.is_absolute() else (REPO / p)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dropped", required=True)
    args = ap.parse_args()

    val_keys = set()
    for line in resolve(args.val).open(encoding="utf-8"):
        line = line.strip()
        if line:
            val_keys.add(json.loads(line)["actualInputKey"])

    out_path, drop_path = resolve(args.out), resolve(args.dropped)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    kept = dropped = 0
    with out_path.open("w", encoding="utf-8") as out, drop_path.open("w", encoding="utf-8") as drop:
        for line in resolve(args.train).open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("actualInputKey") in val_keys:
                dropped += 1
                drop.write(json.dumps({"actualInputKey": row["actualInputKey"],
                                       "sampleId": row.get("sampleId"),
                                       "sourcePolicy": row.get("sourcePolicy"),
                                       "mapName": row.get("mapName")}, ensure_ascii=False) + "\n")
                continue
            kept += 1
            out.write(line + "\n")
    print(json.dumps({"train": str(resolve(args.train)).replace("\\", "/"),
                      "valKeys": len(val_keys), "kept": kept, "droppedOverlapWithVal": dropped,
                      "out": str(out_path).replace("\\", "/")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())