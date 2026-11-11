"""V17 诊断（修正版）：只看**被重复观测到**的输入 key，估计 H0 的可预测性。

为什么要修正：原始脚本的 bayesTop1 是"按行加权"的，而绝大多数 key 只被观测过一次，
它们天然"一致"，会把上限推到虚高的 99.7%。真正有意义的是：

    consistency = Σ_{keys with n>=2} max_action_count / Σ_{keys with n>=2} n

它回答的是"H0 在同一个网络输入上会不会给出不同动作"，也就是**确定性网络能追到的比例**。
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


def main() -> int:
    for policy in ("h0", "P1:s2026"):
        by_key: dict[str, Counter] = defaultdict(Counter)
        for rel in FILES:
            p = REPO / rel
            if not p.exists():
                continue
            for line in p.open(encoding="utf-8"):
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if str(r.get("sourcePolicy")) != policy:
                    continue
                a, k = r.get("behaviorActionCode"), r.get("actualInputKey")
                if a and k:
                    by_key[k][a] += 1

        rep_keys = {k: c for k, c in by_key.items() if sum(c.values()) >= 2}
        tot = sum(sum(c.values()) for c in rep_keys.values())
        cor = sum(c.most_common(1)[0][1] for c in rep_keys.values())
        agree = cor / tot if tot else None
        print(f"[{policy}] rows={sum(sum(c.values()) for c in by_key.values())} "
              f"keys={len(by_key)} repeatedKeys={len(rep_keys)} repeatedRows={tot} "
              f"consistency={agree if agree is None else round(agree, 4)}")
        if rep_keys:
            worst = sorted(rep_keys.items(), key=lambda kv: -(sum(kv[1].values()) - kv[1].most_common(1)[0][1]))[:5]
            for k, c in worst:
                print(f"    {k[:16]}… -> {dict(c)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())