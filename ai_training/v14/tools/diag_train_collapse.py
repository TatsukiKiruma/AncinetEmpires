"""V14/T14-04 诊断：定位「train_loss=0 且 train_acc=0」的数值崩塌点。

现象（本轮实测，ladder_L0/train.log 第 251 个 epoch）：
    [Epoch 250/252] Train Loss: 0.0994 (Acc: 96.06%)
    [Epoch 251/252] Train Loss: 0.0000 (Acc: 0.00%)
同一个 epoch 报告里，交叉熵为 0 说明目标类概率已经饱和到 1，
但 top-1 准确率同时为 0 —— 这两件事在数学上不能同时成立于同一组 logits，
除非 logits 本身已经数值退化（NaN/Inf/巨大值）。本脚本把中间状态与终态都读出来核对，
用于判断这是「模型输出真的退化」还是「上报口径错误」。

用法：
    py v14/tools/diag_train_collapse.py --tiny-dataset <jsonl> --state <state.pt> \
        [--state <another.pt>] --out <report.json>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from spatial_resnet_model import SpatialResNet  # noqa: E402


def load_rows(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def policy_inputs(row: Dict[str, Any], model: SpatialResNet, spatial_channels: int, sem_dim: int) -> torch.Tensor:
    """构造某个状态的候选打分输入（与训练器同一路径）。"""
    spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, spatial_channels, 20, 20)
    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        z = model.forward_trunk(spatial)[0]
    candidates = row["candidateActions"]

    def pool(coords):
        out = []
        for coord in coords:
            if not coord or coord.get("x", -1) < 0 or coord.get("y", -1) < 0:
                out.append(torch.zeros(32, dtype=torch.float32))
            else:
                out.append(z[:, coord["y"], coord["x"]])
        return torch.stack(out)

    v_act = pool([c.get("actorCoord") for c in candidates])
    v_land = pool([c.get("landingCoord") for c in candidates])
    v_tgt = pool([c.get("targetCoord") for c in candidates])
    sem = np.stack([
        list(c.get("semantics", []))[:sem_dim] + [0.0] * max(0, sem_dim - len(c.get("semantics", [])))
        for c in candidates
    ]).astype("float32")
    sem_t = torch.from_numpy(sem)
    glob_expanded = glob[0].unsqueeze(0).expand(len(candidates), -1)
    return torch.cat([v_act, v_land, v_tgt, sem_t, glob_expanded], dim=-1).unsqueeze(0)


def analyse(model: SpatialResNet, rows: List[Dict[str, Any]], spatial_channels: int, sem_dim: int) -> Dict[str, Any]:
    model.eval()
    ce = torch.nn.CrossEntropyLoss()
    correct = 0
    losses = []
    degenerate = []
    with torch.no_grad():
        for row in rows:
            feats = policy_inputs(row, model, spatial_channels, sem_dim)
            logits = model.forward_action_logits(feats)[0]
            target = int(row["targetActionIndex"])
            loss = float(ce(logits.unsqueeze(0), torch.tensor([target])).item())
            pred = int(torch.argmax(logits).item())
            losses.append(loss)
            if pred == target:
                correct += 1
            finite = bool(torch.isfinite(logits).all().item())
            max_abs = float(torch.abs(logits).max().item()) if finite else float("inf")
            if (not finite) or max_abs > 100.0:
                degenerate.append({
                    "sampleId": row["sampleId"],
                    "finite": finite,
                    "maxAbsLogit": max_abs,
                    "targetLogit": float(logits[target].item()) if finite else None,
                    "predictedIndex": pred,
                    "targetActionCode": row["targetActionCode"],
                    "predictedActionCode": row["candidateActionCodes"][pred],
                })
    param_norms = {name: float(param.data.norm().item()) for name, param in model.named_parameters()}
    return {
        "states": len(rows),
        "top1": correct / len(rows) if rows else None,
        "meanCrossEntropy": float(np.mean(losses)) if losses else None,
        "maxCrossEntropy": float(np.max(losses)) if losses else None,
        "degenerateStates": degenerate,
        "degenerateCount": len(degenerate),
        "parameterNormTotal": float(sum(v ** 2 for v in param_norms.values()) ** 0.5),
        "parameterNormsTop": dict(sorted(param_norms.items(), key=lambda kv: -kv[1])[:6]),
    }


def build_model(state: Dict[str, Any]) -> SpatialResNet:
    model_state = state["model"]
    spatial_channels = int(model_state["stem.weight"].shape[1])
    pol_in = int(model_state["pol_dense1.weight"].shape[1])
    sem_dim = pol_in - 96 - 20
    model = SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=20,
        action_semantic_dim=sem_dim, version="spatial-resnet-v2", num_blocks=2,
    )
    model.load_state_dict(model_state)
    return model


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-04 训练崩塌定位")
    parser.add_argument("--tiny-dataset", required=True)
    parser.add_argument("--state", action="append", required=True, help="可重复传入；记录 epoch 与读数")
    parser.add_argument("--checkpoint", action="append", default=[], help="可选的 JSON 检查点（按 best/last 口径复核）")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    rows = load_rows(Path(args.tiny_dataset))
    report: Dict[str, Any] = {
        "schema": "v14_train_collapse_diagnosis_1",
        "task": "T14-04",
        "tinyDataset": args.tiny_dataset,
        "rows": len(rows),
        "states": [],
        "jsonCheckpoints": [],
    }

    for path in args.state:
        state = torch.load(path, map_location="cpu", weights_only=False)
        model = build_model(state)
        spatial_channels = int(state["model"]["stem.weight"].shape[1])
        sem_dim = int(state["model"]["pol_dense1.weight"].shape[1]) - 96 - 20
        reading = analyse(model, rows, spatial_channels, sem_dim)
        reading.update({"path": path, "epoch": state.get("epoch"), "updates": state.get("updates")})
        report["states"].append(reading)
        print(f"[T14-04] {path} epoch={reading['epoch']} top1={reading['top1']} "
              f"meanCE={reading['meanCrossEntropy']} degenerate={reading['degenerateCount']}")

    from spatial_resnet_model import load_model_from_ts_json

    for path in args.checkpoint:
        model = SpatialResNet(spatial_channels=26, trunk_channels=32, global_dim=20,
                              action_semantic_dim=53, version="spatial-resnet-v2", num_blocks=2)
        load_model_from_ts_json(model, path)
        reading = analyse(model, rows, 26, 53)
        reading.update({"path": path})
        report["jsonCheckpoints"].append(reading)
        print(f"[T14-04] {path} top1={reading['top1']} meanCE={reading['meanCrossEntropy']} "
              f"degenerate={reading['degenerateCount']}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[T14-04] -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
