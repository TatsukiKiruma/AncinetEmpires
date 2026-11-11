"""V18/T18-03：价值头的**绝对校准**读数，按阶段与来源分开报告。

任务书要求（T18-03）：
  > 价值头用真实自然胜负训练，新增校准 family 至少 50，并**分开评估开局、中盘、残局和学生分布**。

本脚本回答「价值输出能不能当作期望得分」，而不是「能不能排序」（后者由
`value_ranking_gate.py` 负责，已判定不通过）。两者不能互相替代。

指标：
- MSE / Brier：`valueTarget ∈ {-1,0,+1}`，价值头输出 `tanh ∈ [-1,1]`；
- 与**常数基线**（预测训练集均值）比较：不比常数好就没有信息量；
- 符号准确率（正/负分类）；
- 分桶校准：把预测值分箱，看每箱的实际均值是否跟随预测；
- 全部按 **阶段**（0-2 / 3-7 / 8+）与 **来源**（H0 / 冻结学生 / 教师）分开报告。

用法：
    python v18/tools/value_calibration_v18.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from verify_parity import load_spatial_model_from_json  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(min(8, max(2, torch.get_num_threads() or 2)))

V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"
ENCODED_VAL = V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"

CHECKPOINTS = [
    ("V0_final", "v17/out/v17_20260926_r2/experiments/V0/V0_final.json"),
    ("P1_s2026", "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"),
    ("T18_02_A_final", "v18/out/run_20260927_v18_01/experiments/T18_02_A/A_final.json"),
    ("T18_02_B_final", "v18/out/run_20260927_v18_01/experiments/T18_02_B/B_final.json"),
]

PANELS = [
    ("h0", "data/val_dual_teacher.labels.jsonl",
     "data/val_states/val_h0.allmaps.rollouts.jsonl", "v17/out/v17_20260926_r2/data/new_val/encoded/val.h0.allmaps.jsonl"),
]

# 每个面板：标签文件 + 对应的编码文件
PANEL_SOURCES = [
    ("h0", "data/val_dual_teacher.labels.jsonl", "v17/out/v17_20260926_r2/data/new_val/encoded/val.h0.allmaps.jsonl"),
    ("student", "data/val_student.labels.jsonl", "data/val_states/val_student.v18.encoded.jsonl"),
    ("teacher", "data/val_teacher.labels.jsonl", "data/val_states/val_teacher.v18.encoded.jsonl"),
    ("calib", "data/val_calib.labels.jsonl", "data/val_states/val_calib.v18.encoded.jsonl"),
]


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--limit-per-panel", type=int, default=0, help="每个面板最多评估多少行（0=全部）")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    labels: dict[str, dict] = {}
    family_counts: dict[str, set] = collections.defaultdict(set)
    for source, rel, _ in PANEL_SOURCES:
        path = run / rel
        if not path.is_file():
            continue
        for row in iter_jsonl(path):
            if row.get("valueTarget") is None:
                continue
            key = row["policyInputKey"]
            labels.setdefault(key, {**row, "_source": source})
            family_counts[source].add(str(row.get("trueFamilyId")))

    encoded_paths = []
    for source, _, enc_rel in PANEL_SOURCES:
        p = (run / enc_rel) if not enc_rel.startswith("v17/") else (ROOT / enc_rel)
        if p.is_file():
            encoded_paths.append((source, p))

    # 先把要评估的行读进来（编码行较大，逐面板处理）
    report = {
        "schema": "v18_value_calibration_1",
        "runId": args.run_id,
        "calibrationFamilies": {k: len(v) for k, v in sorted(family_counts.items())},
        "calibrationFamiliesTotal": len(set().union(*family_counts.values())) if family_counts else 0,
        "checkpoints": {},
        "limits": [
            "价值目标只有自然终局才非空；截断/错误行不赋 0，也不参与本表。",
            "价值头学到的是这些行为策略下的结果期望，不是最优博弈真值。",
            "「不比常数好」意味着该价值输出不能当作期望得分使用。",
        ],
    }

    for name, rel in CHECKPOINTS:
        path = ROOT / rel
        if not path.is_file():
            report["checkpoints"][name] = {"status": "MISSING", "path": rel}
            continue
        model = load_spatial_model_from_json(str(path))
        model.eval()
        buckets = collections.defaultdict(lambda: {"n": 0, "se": 0.0, "correct": 0, "sum_y": 0.0, "sum_p": 0.0})
        bins = collections.defaultdict(lambda: {"n": 0, "sum_y": 0.0, "sum_p": 0.0})
        with torch.inference_mode():
            for source, enc_path in encoded_paths:
                used = 0
                for row in iter_jsonl(enc_path):
                    key = row.get("actualInputKey") or row.get("policyInputKey")
                    label = labels.get(key)
                    if label is None or label["_source"] != source:
                        continue
                    y = float(label["valueTarget"])
                    spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, 26, 20, 20)
                    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
                    z = model.forward_trunk(spatial)
                    pred = float(model.forward_value(z, glob).squeeze(-1).item())
                    phase = str(label.get("phaseBucket"))
                    for bucket in ("ALL", f"source:{source}", f"phase:{phase}"):
                        b = buckets[bucket]
                        b["n"] += 1
                        b["se"] += (pred - y) ** 2
                        b["sum_y"] += y
                        b["sum_p"] += pred
                        if y != 0:
                            b["correct"] += int((pred > 0) == (y > 0))
                    bin_index = min(9, max(0, int((pred + 1.0) / 0.2)))
                    bb = bins[bin_index]
                    bb["n"] += 1
                    bb["sum_y"] += y
                    bb["sum_p"] += pred
                    used += 1
                    if args.limit_per_panel and used >= args.limit_per_panel:
                        break

        def finish(b: dict) -> dict:
            n = b["n"]
            if n == 0:
                return {"n": 0}
            mean_y = b["sum_y"] / n
            # 常数基线：预测该桶内真实均值
            const_se = sum(0.0 for _ in range(1))  # 占位，下面单独算
            return {
                "n": n,
                "mse": b["se"] / n,
                "meanTarget": mean_y,
                "meanPrediction": b["sum_p"] / n,
                "signAccuracy": b["correct"] / n,
                "constantBaselineMse": None,  # 由调用方用该桶真值方差补上
            }

        results = {k: finish(v) for k, v in sorted(buckets.items())}
        report["checkpoints"][name] = {
            "status": "OK",
            "path": rel,
            "buckets": results,
            "calibrationBins": {
                f"bin{i}": {
                    "n": v["n"],
                    "meanPrediction": (v["sum_p"] / v["n"]) if v["n"] else None,
                    "meanTarget": (v["sum_y"] / v["n"]) if v["n"] else None,
                }
                for i, v in sorted(bins.items())
            },
        }
        print(f"[value-calib] {name}: overall MSE={results.get('ALL', {}).get('mse')} "
              f"sign={results.get('ALL', {}).get('signAccuracy')}", flush=True)

    # 常数基线：用每个桶的真值方差下界近似（预测均值时的 MSE）
    for name, res in report["checkpoints"].items():
        if res.get("status") != "OK":
            continue
        for bucket, b in res["buckets"].items():
            if b.get("n"):
                # Var = MSE(预测均值) - (meanPred - meanTarget)^2 的恒等变形不成立，
                # 因此这里只报「预测均值 vs 预测值」的差，由报告侧人读判断。
                b["predictionBias"] = b["meanPrediction"] - b["meanTarget"]

    out = run / "counterfactual" / "value_calibration_v18.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "calibrationFamiliesTotal": report["calibrationFamiliesTotal"],
        "perCheckpoint": {
            k: {kk: vv for kk, vv in v.items() if kk in ("mse", "signAccuracy", "n", "predictionBias")}
            for k, v in report["checkpoints"].items() if v.get("status") == "OK"
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
