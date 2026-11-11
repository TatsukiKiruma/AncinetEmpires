"""V17 诊断：模型在**自己访问到的状态**上，与专家标签的一致率是多少？

为什么这是关键问题：
  * val 上的 45–48% 精确 / 92% 类型，测的是模型在 **H0-vs-H0 走过的状态**上的表现；
  * 但真正对局时，模型走的是**它自己的**轨迹。对局里的小偏差会把它带到数据里没见过的状态；
  * 如果模型在自己状态上的一致率明显更低，那么 5/20 与 H0 的 10/20 之间的差距
    就主要是**误差累积**，而不是"策略种类不同"。

本脚本直接用已采集的数据算这个对比，不需要新跑对局：
  * 学生来源行（`sourcePolicy == 'P1:s2026'`）：`behaviorActionCode` = **模型实际走的动作**，
    `l1ActionCode` = 专家在该状态的建议 ⇒ 两者相等率 = 模型在自己分布上的保真度；
  * H0 来源行（`sourcePolicy == 'h0'`）：`behaviorActionCode` = **H0 实际走的动作**，
    同一比较 ⇒ H0 与专家的自洽率（基准）。

同时按 phase / map / seat 分组，并给出类型级（粗粒度）版本。
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
    "v17/out/v17_20260926_r2/data/b2_student/encoded/student.b2.jsonl",
    "v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl",
]


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


def main() -> int:
    acc = defaultdict(lambda: {"rows": 0, "exact": 0, "type": 0,
                               "byPhase": defaultdict(lambda: [0, 0, 0]),
                               "byMap": defaultdict(lambda: [0, 0, 0]),
                               "bySeat": defaultdict(lambda: [0, 0, 0]),
                               "confusion": Counter()})
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
            beh, l1 = r.get("behaviorActionCode"), r.get("l1ActionCode")
            if not beh or not l1:
                continue
            src = str(r.get("sourcePolicy"))
            d = acc[src]
            ok_exact = int(beh == l1)
            ok_type = int(type_of(beh) == type_of(l1))
            d["rows"] += 1
            d["exact"] += ok_exact
            d["type"] += ok_type
            for key, field in (("byPhase", "phaseBucket"), ("byMap", "mapName"), ("bySeat", "subjectPlayerId")):
                cell = d[key][str(r.get(field))]
                cell[0] += 1
                cell[1] += ok_exact
                cell[2] += ok_type
            if not ok_type:
                d["confusion"][(type_of(beh), type_of(l1))] += 1

    report = {"schema": "v17_own_distribution_fidelity_1",
              "files": FILES,
              "question": "模型在自己访问到的状态上，与专家标签的一致率是多少（对比 H0 的基准）？",
              "groups": {}}
    print(f"{'sourcePolicy':14s} {'rows':>8s} {'exact':>8s} {'type':>8s}   (behaviorActionCode vs l1ActionCode)")
    for src, d in sorted(acc.items(), key=lambda kv: -kv[1]["rows"]):
        n = d["rows"]
        if not n:
            continue
        e, t = d["exact"] / n, d["type"] / n
        print(f"{src:14s} {n:8d} {e:8.4f} {t:8.4f}")
        entry = {
            "rows": n, "exactAgreement": round(e, 4), "typeAgreement": round(t, 4),
            "byPhase": {k: {"rows": v[0], "exact": round(v[1] / v[0], 4), "type": round(v[2] / v[0], 4)}
                        for k, v in sorted(d["byPhase"].items())},
            "byMap": {k: {"rows": v[0], "exact": round(v[1] / v[0], 4), "type": round(v[2] / v[0], 4)}
                      for k, v in sorted(d["byMap"].items())},
            "bySeat": {k: {"rows": v[0], "exact": round(v[1] / v[0], 4), "type": round(v[2] / v[0], 4)}
                       for k, v in sorted(d["bySeat"].items())},
            "topTypeMismatches": [{"behavior": b, "expert": l, "count": c} for (b, l), c in d["confusion"].most_common(8)],
        }
        report["groups"][src] = entry

    # 关键对比
    h0 = report["groups"].get("h0")
    st = report["groups"].get("P1:s2026")
    if h0 and st:
        report["comparison"] = {
            "h0Exact": h0["exactAgreement"], "h0Type": h0["typeAgreement"],
            "modelExactOnOwnStates": st["exactAgreement"], "modelTypeOnOwnStates": st["typeAgreement"],
            "exactGapPp": round((st["exactAgreement"] - h0["exactAgreement"]) * 100, 2),
            "typeGapPp": round((st["typeAgreement"] - h0["typeAgreement"]) * 100, 2),
            "meaning": ("负数表示模型在自己状态上的自洽率低于 H0；"
                        "差距越大，说明对局中的偏差把模型带到了它更不擅长的状态（误差累积）。"),
        }
        print("\ncomparison:", json.dumps(report["comparison"], ensure_ascii=False, indent=2))

    out = REPO / "v17/out/v17_20260926_r2/data/own_distribution_fidelity.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())