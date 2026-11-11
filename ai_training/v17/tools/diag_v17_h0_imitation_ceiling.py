"""V17 诊断：从网络输入预测 H0 动作的**可达上限**（贝叶斯 top-1）。

中文：H0 内部有逐座位 RNG 抖动（评分乘 *20/*30），所以"同一个网络输入"在不同对局里
可能对应不同动作。任何确定性网络（合法集→编码→网络→稳定 argmax）都无法超过

    ceiling = Σ_keys max_action count / Σ_keys total          （按行数加权的贝叶斯 top-1）

本脚本在真实 H0 数据上算这个上限，用来回答一个具体的规划问题：
"把模仿保真度从 5/20 提到 10/20"到底有多少空间，还是说 51% 已经接近可达上限。

同时报告：
  * 每个 input 的动作熵分布（有多少 key 是唯一的、有多少有 2 个以上动作）；
  * 按 phase/seat 分组的可达上限；
  * 候选集合大小与上限的关系（候选越多越难）。
"""

from __future__ import annotations

import json
import math
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


def main() -> int:
    by_key: dict[str, Counter] = defaultdict(Counter)
    meta: dict[str, dict] = {}
    rows = 0
    for rel in FILES:
        p = REPO / rel
        if not p.exists():
            continue
        for line in p.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if str(r.get("sourcePolicy")) != "h0":
                continue
            action = r.get("behaviorActionCode")
            key = r.get("actualInputKey")
            if not action or not key:
                continue
            rows += 1
            by_key[key][action] += 1
            if key not in meta:
                meta[key] = {
                    "phase": r.get("phaseBucket"),
                    "seat": r.get("subjectPlayerId"),
                    "candidates": len(r.get("candidateActions") or []),
                    "map": r.get("mapName"),
                }

    total = sum(sum(c.values()) for c in by_key.values())
    correct = sum(c.most_common(1)[0][1] for c in by_key.values())
    ceiling = correct / total if total else None

    unique_keys = sum(1 for c in by_key.values() if len(c) == 1)
    multi = {k: len(c) for k, c in by_key.items() if len(c) > 1}
    entropies = []
    for c in by_key.values():
        n = sum(c.values())
        h = -sum((v / n) * math.log2(v / n) for v in c.values())
        entropies.append(h)
    mean_entropy = sum(entropies) / len(entropies) if entropies else None

    def group_ceiling(field: str) -> dict:
        groups: dict[str, list[str]] = defaultdict(list)
        for key in by_key:
            groups[str(meta[key][field])].append(key)
        out = {}
        for g, keys in sorted(groups.items()):
            tot = sum(sum(by_key[k].values()) for k in keys)
            cor = sum(by_key[k].most_common(1)[0][1] for k in keys)
            out[g] = {"rows": tot, "keys": len(keys), "ceiling": round(cor / tot, 4) if tot else None}
        return out

    report = {
        "schema": "v17_h0_imitation_ceiling_1",
        "question": "What top-1 accuracy can ANY deterministic function of the v17-netinput-v1 key reach on H0 actions?",
        "files": FILES,
        "h0Rows": rows,
        "h0UniqueInputKeys": len(by_key),
        "keysWithSingleAction": unique_keys,
        "keysWithMultipleActions": len(multi),
        "maxActionsPerKey": max(multi.values()) if multi else 1,
        "meanActionEntropyBits": round(mean_entropy, 4) if mean_entropy is not None else None,
        "bayesTop1Ceiling": round(ceiling, 4) if ceiling is not None else None,
        "rowsResolvedByOneActionKeys": sum(sum(by_key[k].values()) for k in by_key if len(by_key[k]) == 1),
        "interpretation": (
            "这是**上界**：同一输入下 H0 出现过的所有动作里，出现最多的那个永远选对所能达到的 top-1。"
            "任何确定性网络都不可能超过它。若该值明显高于当前 val top-1（B0 44.8%），说明还有空间；"
            "若接近，则问题不在训练而在标签本身的可预测性。"
        ),
        "byPhase": group_ceiling("phase"),
        "bySeat": group_ceiling("seat"),
    }
    dest = REPO / "v17/out/v17_20260926_r2/data/h0_imitation_ceiling.json"
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"H0 rows                 : {rows}")
    print(f"unique input keys       : {len(by_key)}")
    print(f"keys with 1 action      : {unique_keys}  ({unique_keys / len(by_key):.1%} of keys)")
    print(f"keys with >1 action     : {len(multi)}  max variants = {report['maxActionsPerKey']}")
    print(f"mean action entropy     : {report['meanActionEntropyBits']} bits")
    print(f"BAYES TOP-1 CEILING     : {report['bayesTop1Ceiling']}")
    print("by phase:", json.dumps(report["byPhase"], ensure_ascii=False))
    print("by seat :", json.dumps(report["bySeat"], ensure_ascii=False))
    print("wrote", dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())