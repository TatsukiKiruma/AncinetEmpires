"""V18/T18-01e：用**正确的分教师标签**重新评分现有检查点，纠正 V17 诊断。

背景（V17 独立复核）：实际送入 trainer 的验证分区 5,316 行里，
`teacherActionCode` 出现 0 次、4,770 行没有 targetSource、实际 target 与行为动作相同 99.00%，
且 0-2 阶段只有 2 行。因此「B1/B1e 的 val 衡量的不是 B100 保真度」，
「B0 的 ~45% val 不是纯净的 L1 模仿率」，而且这些数字来自**另一个状态集合**。

本脚本在同一批 V18 冻结验证状态（`data/val_dual_teacher.labels.jsonl`，5,729 状态 / 3,864 不同输入）
上分别计算：
  - L1 模仿率（targets.L1_V18，单次评分）
  - B100-Q 模仿率（targets.B100_Q）
  - H0/行为保真度（targets.BEHAVIOR）
并按 图 / 阶段 / 来源 分层。三者**不混算、不相减**。

同时报告 `logits 层面的 argmax 一致` 与 `top3 命中`，但明确：离线准确率不能单独作为晋升依据。

用法：
    python v18/tools/rescore_checkpoints_v18.py --run-id run_20260927_v18_01 \
        --checkpoints "P1:v16/out/.../P1_final.json" "B0:v17/out/.../B0_final.json" ...
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from verify_parity import load_spatial_model_from_json, pool_coords_batch  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(min(8, max(2, (torch.get_num_threads() or 2))))

V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"
ENCODED_VAL = V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"

DEFAULT_CHECKPOINTS = [
    ("P1_s2026", "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"),
    ("P1_s42", "v16/out/v16_20260926_core/experiments/P1/s42/P1_final.json"),
    ("P1_s1337", "v16/out/v16_20260926_core/experiments/P1/s1337/P1_final.json"),
    ("B0_final", "v17/out/v17_20260926_r2/experiments/B0/B0_final.json"),
    ("B0_best", "v17/out/v17_20260926_r2/experiments/B0/B0_best.json"),
    ("B1_final", "v17/out/v17_20260926_r2/experiments/B1/B1_final.json"),
    ("B1_best", "v17/out/v17_20260926_r2/experiments/B1/B1_best.json"),
    ("B1e_final", "v17/out/v17_20260926_r2/experiments/B1e/B1e_final.json"),
    ("B1e_best", "v17/out/v17_20260926_r2/experiments/B1e/B1e_best.json"),
    ("B2_final", "v17/out/v17_20260926_r2/experiments/B2/B2_final.json"),
    # V18/T18-02 三臂表示对照（C 未实现）
    ("T18_02_A_final", "v18/out/run_20260927_v18_01/experiments/T18_02_A/A_final.json"),
    ("T18_02_B_final", "v18/out/run_20260927_v18_01/experiments/T18_02_B/B_final.json"),
]


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def forward_logits(model, row: dict) -> list[int]:
    """返回候选顺序下的 argmax 下标，以及 logits 列表（用于 top-k）。"""
    z = model.forward_trunk(torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, 26, 20, 20))
    candidates = row["candidateActions"]
    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32)
    feat = torch.cat(
        [
            *[pool_coords_batch(z[0], [a.get(k) for a in candidates]) for k in ("actorCoord", "landingCoord", "targetCoord")],
            torch.tensor([a["semantics"] for a in candidates], dtype=torch.float32),
            glob.unsqueeze(0).expand(len(candidates), -1),
        ],
        dim=1,
    )
    if getattr(model, "global_policy_pool", False):
        feat = torch.cat([feat, z.mean(dim=(2, 3)).expand(len(candidates), -1)], dim=1)
    logits = model.forward_action_logits(feat.unsqueeze(0))[0]
    return logits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--checkpoints", nargs="*", default=None, help="name:path 形式；缺省用内置清单")
    parser.add_argument("--limit", type=int, default=0, help="只用前 N 行（0=全部）")
    parser.add_argument(
        "--independence-class",
        default="ALL",
        choices=["ALL", "UNSEEN_INPUT_VALIDATION", "SHARED_OPENING_REGRESSION", "OPENING_PROBE"],
        help="只评估指定独立性类别的状态；V17 教训：共享状态不能冒充未见验证。",
    )
    args = parser.parse_args()

    run = ROOT / "v18" / "out" / args.run_id
    labels_path = run / "data" / "val_dual_teacher.labels.jsonl"
    probe_labels_path = run / "data" / "opening_probe.labels.jsonl"
    checkpoints = (
        [tuple(item.split(":", 1)) for item in args.checkpoints] if args.checkpoints else DEFAULT_CHECKPOINTS
    )

    print(f"[rescore] 读取统一验证标签 {labels_path.name}", flush=True)
    labels: dict[str, dict] = {}
    for row in iter_jsonl(labels_path):
        labels[row["policyInputKey"]] = row
    print(f"[rescore] 标签行 {len(labels)}（不同输入 {len(set(labels))}）", flush=True)

    encoded_sources: list[tuple[Path, str]] = [(ENCODED_VAL, "val_dual_teacher")]
    # 各来源面板（开局探针 / 冻结学生 / 教师）在存在时一并评估，来源标签随之带入分桶。
    for tag, encoded_rel in (
        ("opening_probe", "data/val_states/opening_probe.encoded.jsonl"),
        ("val_student", "data/val_states/val_student.v18.encoded.jsonl"),
        ("val_teacher", "data/val_states/val_teacher.v18.encoded.jsonl"),
    ):
        panel_labels = run / "data" / f"{tag}.labels.jsonl"
        panel_encoded = run / encoded_rel
        if panel_labels.is_file() and panel_encoded.is_file():
            for row in iter_jsonl(panel_labels):
                labels.setdefault(row["policyInputKey"], row)
            encoded_sources.append((panel_encoded, tag))

    results: dict[str, dict] = {}
    for name, rel in checkpoints:
        path = ROOT / rel
        if not path.is_file():
            results[name] = {"status": "MISSING", "path": rel}
            continue
        model = load_spatial_model_from_json(str(path))
        model.eval()
        per_target = {key: collections.defaultdict(collections.Counter) for key in ("L1_V18", "B100_Q", "BEHAVIOR")}
        top3 = collections.Counter()
        used = 0
        started = time.time()
        with torch.inference_mode():
            for encoded_path, source_tag in encoded_sources:
                for row in iter_jsonl(encoded_path):
                    key = row.get("actualInputKey") or row.get("policyInputKey")
                    label = labels.get(key)
                    if label is None:
                        continue
                    independence = str(label.get("independenceClass") or "OPENING_PROBE")
                    if args.independence_class != "ALL" and independence != args.independence_class:
                        continue
                    candidates = row["candidateActions"]
                    codes = [c["actionCode"] for c in candidates]
                    logits = forward_logits(model, row)
                    order = torch.argsort(logits, descending=True).tolist()
                    argmax_code = codes[order[0]]
                    used += 1
                    if args.limit and used > args.limit:
                        break

                    phase = str(label["phaseBucket"])
                    map_name = str(label["mapName"])
                    for target_key, target_code in (
                        ("L1_V18", label["targets"]["L1_V18"]["targetActionCode"]),
                        ("B100_Q", (label["targets"]["B100_Q"] or {}).get("targetActionCode")),
                        ("BEHAVIOR", label["targets"]["BEHAVIOR"]["targetActionCode"]),
                    ):
                        if target_code is None:
                            continue
                        correct = int(argmax_code == target_code)
                        bucket = per_target[target_key]
                        bucket["all"]["rows"] += 1
                        bucket["all"]["correct"] += correct
                        bucket[f"phase:{phase}"]["rows"] += 1
                        bucket[f"phase:{phase}"]["correct"] += correct
                        bucket[f"map:{map_name}"]["rows"] += 1
                        bucket[f"map:{map_name}"]["correct"] += correct
                        bucket[f"source:{source_tag}"]["rows"] += 1
                        bucket[f"source:{source_tag}"]["correct"] += correct
                    l1_code = label["targets"]["L1_V18"]["targetActionCode"]
                    top3["rows"] += 1
                    top3["hit"] += int(l1_code in [codes[i] for i in order[:3]])

        def finish(bucket: dict) -> dict:
            out = {}
            for key, counter in bucket.items():
                rows = counter["rows"]
                out[key] = {
                    "rows": rows,
                    "correct": counter["correct"],
                    "accuracy": (counter["correct"] / rows) if rows else None,
                }
            return dict(sorted(out.items()))

        results[name] = {
            "status": "OK",
            "path": rel,
            "sha256": __import__("hashlib").sha256(path.read_bytes()).hexdigest(),
            "valRows": used,
            "wallSeconds": round(time.time() - started, 1),
            "targets": {key: finish(bucket) for key, bucket in per_target.items()},
            "l1Top3": {"rows": top3["rows"], "hit": top3["hit"], "accuracy": (top3["hit"] / top3["rows"]) if top3["rows"] else None},
        }
        print(
            f"[rescore] {name}: L1={results[name]['targets']['L1_V18']['all']['accuracy']}"
            f" B100Q={results[name]['targets']['B100_Q']['all']['accuracy']}"
            f" BEHAVIOR={results[name]['targets']['BEHAVIOR']['all']['accuracy']}",
            flush=True,
        )

    report = {
        "schema": "v18_rescore_1",
        "runId": args.run_id,
        "validationSet": str(labels_path.relative_to(ROOT)).replace("\\", "/"),
        "independenceClass": args.independence_class,
        "validationIdentity": {
            "rows": len(labels),
            "note": "V18 统一合同：同一批冻结状态上分别记录 L1-v18 与 B100-Q 目标；三者不混算。"
            "共享输入（出现在训练池里）单独归为 SHARED_OPENING_REGRESSION，不计入未见输入验证。",
        },
        "checkpoints": results,
        "interpretationLimits": [
            "离线 top-1 准确率不是胜率，也不能单独作为晋升依据（V17 已实测『val 更高而实战更差』）。",
            "L1/B100/H0 三个数字来自不同教师，禁止相减或当成同一条曲线。",
            "本表用于**纠正 V17 的诊断口径**，不用于挑选冠军；选型必须用自然胜场。",
        ],
    }
    out = run / "experiments" / (
        "rescore_existing_checkpoints.json"
        if args.independence_class == "ALL"
        else f"rescore_existing_checkpoints.{args.independence_class}.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[rescore] 写出 {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())