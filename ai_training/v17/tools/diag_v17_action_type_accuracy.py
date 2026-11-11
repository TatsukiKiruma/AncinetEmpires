"""V17 诊断：精确动作准确率低，是"选错类型"还是"类型对但单位/目标选错"？

中文：B0 在干净 val 上的 top-1 只有 ~45%，但这个数字是**精确 actionCode 匹配**。
H0/L1 的候选里经常存在多个"同类不同单位"的动作（例如 `wait:u_8` vs `wait:u_7`、
`move:u_3:9,4` vs `move:u_3:8,3`），选错其中一个在棋力上未必有差别。
本脚本把差距拆开：

    exact top-1        —— 学生预测的动作 == 标签动作（当前报告用的口径）
    type top-1         —— 学生预测的动作类型 == 标签类型（粗粒度）
    type-chance        —— 候选里与标签同类型的比例（"乱选一个同类型"的基线）
    type-lift          —— type top-1 / type-chance
    wrongExactRightType—— 精确错但类型对的比例（说明错在多细的粒度上）

若 type top-1 远高于 exact（且 type-lift 明显 >1），说明瓶颈在**细粒度单位/目标选择**，
对应可执行的改进是等价集合/偏好损失（任务书 §7.2 的 equiv/soft 路线）；
若 type top-1 本身就低，则瓶颈在更上层的策略选择，需要换表示或换目标。

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/diag_v17_action_type_accuracy.py --model v17/out/v17_20260926_r2/experiments/B0/B0_final.json `
    --val v17/out/v17_20260926_r2/experiments/_data/../B01_val_fixed.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "v17" / "tools"))
sys.path.insert(0, str(REPO / "python"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np  # noqa: E402
import torch  # noqa: E402

import value_calibration as VC  # noqa: E402


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, action="append")
    ap.add_argument("--val", default=str(REPO / "v17/out/v17_20260926_r2/experiments/_data/B01_val_fixed.jsonl"))
    ap.add_argument("--label-field", default="l1ActionCode")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=str(REPO / "v17/out/v17_20260926_r2/data/action_type_accuracy.json"))
    args = ap.parse_args()

    val_rows = VC.rows_of(Path(args.val), args.limit or None)
    print(f"val rows: {len(val_rows)} from {args.val}")

    device = torch.device("cpu")
    report: dict = {
        "schema": "v17_action_type_accuracy_1",
        "val": args.val,
        "valRows": len(val_rows),
        "labelField": args.label_field,
        "models": {},
        "interpretation": (
            "exact = 精确动作匹配；type = 动作类型匹配；"
            "typeChance = 候选里与标签同类型的比例（随机选同类型的基线）；"
            "wrongExactRightType = 精确错但类型对的比例。"
        ),
    }

    for model_path in args.model:
        ckpt = Path(model_path)
        if not ckpt.is_absolute():
            ckpt = REPO / ckpt
        model = VC.build_model(ckpt, device)
        recs = VC.evaluate(model, val_rows, device)
        assert len(recs) == len(val_rows), "evaluate() 必须保序返回"

        exact = type_ok = 0
        chance_num = chance_den = 0
        wrong_exact_right_type = 0
        confusion: Counter = Counter()
        pred_types: Counter = Counter()
        label_types: Counter = Counter()
        by_phase: dict = defaultdict(lambda: {"rows": 0, "exact": 0, "type": 0})
        n_same_type_candidates: list[int] = []

        for row, rec in zip(val_rows, recs):
            label = row.get(args.label_field)
            pred = rec.get("predActionCode")
            if label is None or pred is None:
                continue
            lt, pt = type_of(label), type_of(pred)
            label_types[lt] += 1
            pred_types[pt] += 1
            ok_exact = int(pred == label)
            ok_type = int(pt == lt)
            exact += ok_exact
            type_ok += ok_type
            if not ok_exact and ok_type:
                wrong_exact_right_type += 1
            cands = row.get("candidateActions") or []
            same = sum(1 for c in cands if type_of(c.get("actionCode")) == lt)
            chance_num += same
            chance_den += max(1, len(cands))
            n_same_type_candidates.append(same)
            confusion[(lt, pt)] += 1
            ph = str(row.get("phaseBucket"))
            by_phase[ph]["rows"] += 1
            by_phase[ph]["exact"] += ok_exact
            by_phase[ph]["type"] += ok_type

        n = len(recs)
        chance = chance_num / chance_den if chance_den else None
        type_acc = type_ok / n if n else None
        entry = {
            "path": str(ckpt).replace("\\", "/"),
            "rows": n,
            "exactTop1": round(exact / n, 4) if n else None,
            "typeTop1": round(type_acc, 4) if type_acc is not None else None,
            "typeChance": round(chance, 4) if chance is not None else None,
            "typeLift": round(type_acc / chance, 3) if (type_acc and chance) else None,
            "wrongExactRightType": wrong_exact_right_type,
            "wrongExactRightTypeShare": round(wrong_exact_right_type / (n - exact), 4) if n > exact else None,
            "meanSameTypeCandidates": round(sum(n_same_type_candidates) / n, 2) if n else None,
            "byPhase": {k: {"rows": v["rows"], "exact": round(v["exact"] / v["rows"], 4) if v["rows"] else None,
                            "type": round(v["type"] / v["rows"], 4) if v["rows"] else None}
                        for k, v in sorted(by_phase.items())},
            "labelTypeDistribution": dict(label_types.most_common()),
            "predTypeDistribution": dict(pred_types.most_common()),
            "topTypeConfusions": [
                {"labelType": lt, "predType": pt, "count": c}
                for (lt, pt), c in confusion.most_common(10) if lt != pt
            ],
        }
        report["models"][ckpt.name] = entry
        print(f"\n== {ckpt.name}")
        print(f"   exact top-1 = {entry['exactTop1']}   type top-1 = {entry['typeTop1']}   "
              f"type chance = {entry['typeChance']}   lift = {entry['typeLift']}")
        print(f"   wrong-but-right-type = {entry['wrongExactRightTypeShare']} of the wrong answers; "
              f"mean same-type candidates = {entry['meanSameTypeCandidates']}")
        print(f"   by phase: {json.dumps(entry['byPhase'], ensure_ascii=False)}")
        print(f"   top type confusions: {entry['topTypeConfusions'][:5]}")

    out = Path(args.out)
    if not out.is_absolute():
        out = REPO / out
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())