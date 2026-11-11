"""V17 诊断：学生模仿的 L1 标签是否等于它要对战的 H0 行为？

中文：B0/B1 的 policy 目标来自 `l1ActionCode`（L1 标注器）。对局里的对手是 H0
（`heuristic_ai`）。如果这两者不是同一个策略，那么"提高模仿率"根本不等于"更像对手"，
5/20 与 10/20 刻度线之间的差距就不能靠继续训 L1 标签来补。

本脚本在**真实采集数据**上按 sourcePolicy 分组，比较：
  * `l1ActionCode`（学生被训练去模仿的）  vs  `behaviorActionCode`（该局实际执行者的动作）
  * 并且给出分歧的动作类型构成，便于判断是"同策略不同抖动"还是"不同策略"。

数据来源：`data/new_train/dataset_v17_newtrain.jsonl`（h0 与 P1:s2026 两种来源）
以及 `data/new_val/dataset_v17_newval.jsonl`（h0）。
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FILES = [
    "v17/out/v17_20260926_r2/data/new_train/dataset_v17_newtrain.jsonl",
    "v17/out/v17_20260926_r2/data/new_val/dataset_v17_newval.jsonl",
    "v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl",
]


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


def main() -> int:
    per_source = defaultdict(lambda: {"rows": 0, "same": 0, "differ": 0, "confusion": Counter()})
    for rel in FILES:
        p = REPO / rel
        if not p.exists():
            print("skip missing", rel)
            continue
        for line in p.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            src = str(r.get("sourcePolicy"))
            l1 = r.get("l1ActionCode")
            beh = r.get("behaviorActionCode")
            if l1 is None:
                continue
            d = per_source[src]
            d["rows"] += 1
            if beh is None:
                continue
            if l1 == beh:
                d["same"] += 1
            else:
                d["differ"] += 1
                d["confusion"][(type_of(beh), type_of(l1))] += 1

    out = {}
    print(f"{'sourcePolicy':16s} {'rows':>7s} {'same':>7s} {'differ':>7s} {'agree':>7s}")
    for src, d in sorted(per_source.items(), key=lambda kv: -kv[1]["rows"]):
        total = d["same"] + d["differ"]
        agree = d["same"] / total if total else None
        print(f"{src:16s} {d['rows']:7d} {d['same']:7d} {d['differ']:7d} {agree:7.4f}")
        print("    top disagreements (behavior -> l1):",
              ", ".join(f"{b}->{l}:{n}" for (b, l), n in d["confusion"].most_common(6)))
        out[src] = {
            "rows": d["rows"], "same": d["same"], "differ": d["differ"],
            "agreement": agree,
            "topDisagreements": [{"behavior": b, "l1": l, "count": n} for (b, l), n in d["confusion"].most_common(10)],
        }

    dest = REPO / "v17/out/v17_20260926_r2/data/l1_vs_behavior_agreement.json"
    dest.write_text(json.dumps({
        "schema": "v17_l1_vs_behavior_agreement_1",
        "question": "Is the L1 target the same policy as the H0 opponent?",
        "files": FILES,
        "bySourcePolicy": out,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())