"""V17 诊断：模型在 val 上犯错时，是"接近平局"还是"自信地错"？

这决定了下一步该往哪走：
  * 若错误集中在**极小 logit 间隔**（near-tie），说明正确答案就在嘴边，
    应该改的是优化/正则/选择（例如等价集合损失、集成、更好的 best-checkpoint 选择）；
  * 若错误是**大间隔自信错误**，说明表示里根本没有能分辨的信息，
    只能改输入表示（新 schema 通道）或换模型类。

同时输出：
  * 正确/错误两组的 logit margin 分布（top1 - top2）；
  * "类型对但单位错"与"类型也错"两类各自的中位 margin；
  * 与标签同类型的候选平均有多少个（同一个类型内要挑多细）。

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/diag_v17_error_margin.py --model v17/out/v17_20260926_r2/experiments/B0/B0_final.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "v17" / "tools"))
sys.path.insert(0, str(REPO / "python"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np  # noqa: E402
import torch  # noqa: E402

import value_calibration as VC  # noqa: E402
import train_v17 as T  # noqa: E402


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


@torch.no_grad()
def logits_for(model, row, device):
    cands = row["candidateActions"]
    spatial = torch.from_numpy(np.array(row["spatialTensor"], dtype=np.float32).reshape(-1, 20, 20)).unsqueeze(0).to(device)
    glob = torch.from_numpy(np.array(row["globalFeatures"], dtype=np.float32)).unsqueeze(0).to(device)
    z = model.forward_trunk(spatial)
    z_b = z[0]
    sem = np.stack([
        np.array(list(c.get("semantics", []))[:53] + [0.0] * max(0, 53 - len(c.get("semantics", []))), dtype=np.float32)
        for c in cands
    ], axis=0)
    feats = torch.cat([
        T.pool_coords_batch(z_b, [c.get("actorCoord") for c in cands]),
        T.pool_coords_batch(z_b, [c.get("landingCoord") for c in cands]),
        T.pool_coords_batch(z_b, [c.get("targetCoord") for c in cands]),
        torch.from_numpy(sem).to(device),
        glob[0].unsqueeze(0).expand(len(cands), -1),
    ], dim=-1).unsqueeze(0)
    return model.forward_action_logits(feats)[0].cpu().numpy()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, action="append")
    ap.add_argument("--val", default=str(REPO / "v17/out/v17_20260926_r2/experiments/_data/B01_val_fixed.jsonl"))
    ap.add_argument("--label-field", default="l1ActionCode")
    ap.add_argument("--limit", type=int, default=1200)
    ap.add_argument("--out", default=str(REPO / "v17/out/v17_20260926_r2/data/error_margin.json"))
    args = ap.parse_args()

    rows = VC.rows_of(Path(args.val), args.limit or None)
    device = torch.device("cpu")
    report = {"schema": "v17_error_margin_1", "val": args.val, "rows": len(rows), "models": {}}

    for model_path in args.model:
        ckpt = Path(model_path)
        if not ckpt.is_absolute():
            ckpt = REPO / ckpt
        model = VC.build_model(ckpt, device)
        correct_margins: list[float] = []
        typewrong_margins: list[float] = []
        unitwrong_margins: list[float] = []
        margin_of_label: list[float] = []
        pct_label_in_top3 = 0
        pct_label_in_top5 = 0
        n = 0
        for row in rows:
            code = row.get(args.label_field)
            cands = row.get("candidateActions") or []
            if code is None or not cands:
                continue
            logits = logits_for(model, row, device)
            order = np.argsort(-logits)
            pred_idx = int(order[0])
            pred = cands[pred_idx].get("actionCode")
            label_idx = next((i for i, c in enumerate(cands) if c.get("actionCode") == code), None)
            if label_idx is None:
                continue
            n += 1
            top1 = float(logits[order[0]])
            top2 = float(logits[order[1]]) if len(order) > 1 else top1
            margin = top1 - top2
            label_rank = int(np.where(order == label_idx)[0][0])
            margin_of_label.append(float(top1 - logits[label_idx]))
            pct_label_in_top3 += int(label_rank < 3)
            pct_label_in_top5 += int(label_rank < 5)
            if pred == code:
                correct_margins.append(margin)
            else:
                if type_of(pred) == type_of(code):
                    unitwrong_margins.append(margin)
                else:
                    typewrong_margins.append(margin)

        def q(v, p):
            return round(float(np.percentile(v, p)), 4) if v else None

        entry = {
            "path": str(ckpt).replace("\\", "/"),
            "rowsScored": n,
            "exactTop1": round(len(correct_margins) / n, 4) if n else None,
            "correct": {"count": len(correct_margins), "p10": q(correct_margins, 10), "p50": q(correct_margins, 50)},
            "wrongSameType": {"count": len(unitwrong_margins), "p10": q(unitwrong_margins, 10), "p50": q(unitwrong_margins, 50)},
            "wrongDifferentType": {"count": len(typewrong_margins), "p10": q(typewrong_margins, 10), "p50": q(typewrong_margins, 50)},
            "labelTop3Rate": round(pct_label_in_top3 / n, 4) if n else None,
            "labelTop5Rate": round(pct_label_in_top5 / n, 4) if n else None,
            "labelMarginVsTop1": {"p50": q(margin_of_label, 50), "p90": q(margin_of_label, 90)},
        }
        report["models"][ckpt.name] = entry
        print(f"\n== {ckpt.name}  rows={n}  exact={entry['exactTop1']}")
        print(f"   correct        n={entry['correct']['count']:5d}  margin p10={entry['correct']['p10']} p50={entry['correct']['p50']}")
        print(f"   wrong sameType n={entry['wrongSameType']['count']:5d}  margin p10={entry['wrongSameType']['p10']} p50={entry['wrongSameType']['p50']}")
        print(f"   wrong diffType n={entry['wrongDifferentType']['count']:5d}  margin p10={entry['wrongDifferentType']['p10']} p50={entry['wrongDifferentType']['p50']}")
        print(f"   label in top-3 = {entry['labelTop3Rate']}   top-5 = {entry['labelTop5Rate']}")
        print(f"   (top1 - labelLogit) p50={entry['labelMarginVsTop1']['p50']}  p90={entry['labelMarginVsTop1']['p90']}")

    out = Path(args.out)
    if not out.is_absolute():
        out = REPO / out
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())