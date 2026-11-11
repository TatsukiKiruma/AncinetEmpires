"""V17/T17-02：训练运行核对（ledger / value 权重是否真的生效 / 参数增量 / V0 policy 一致性）。

对每个实验目录（V0/P0/PV0）报告：
  1. ledger 实测：真实 optimizer update 数、曝光数、valueSupervised、policyMasked、lr 首末、耗时；
  2. metrics 里的 value_weight 与 v17ValueSupervision（可训练部分 / 冻结参数 / 优化器参数数）；
  3. **参数增量**：与 --init-checkpoint（P1:s2026 冠军）逐模块比较 max|Δ| 与 L2。
     这是「value 梯度真的流进了 value head」的正面证据；非零的 valueSupervised 计数**不算证据**。
  4. **前向一致性**：同 N 行输入分别过 init 与结果权重，报告
       - policy logits 的最大绝对差、argmax 变化数（V0 期望恒为 0，因为 trunk+policy 冻结）
       - value 输出的最大绝对差（V0 期望非 0）
  5. 梯度探针（若存在 value_head_grad_probe.jsonl）：前 N 次更新的 pre-clip value head 梯度范数，
     以及每步优化器参数组实际包含哪些部分。

用法（真实命令）：
  & $py v17/tools/verify_training_runs.py --experiments-dir v17/out/v17_20260926_r2/experiments `
      --init v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json `
      --val v17/out/v17_20260926_r2/data/legacy_val_dedup.jsonl --rows 200
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "v17" / "tools"))
sys.path.insert(0, str(REPO / "python"))

import numpy as np  # noqa: E402
import torch  # noqa: E402

import train_v17 as T  # noqa: E402  （只为复用与 trainer 完全相同的 pooling / 前向代码）
from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402

GROUPS = {
    "trunk": ["stem", "res1_1", "res1_2", "res2_1", "res2_2", "res3_1", "res3_2", "res4_1", "res4_2"],
    "value": ["valDense1", "valDense2"],
    "policy": ["polDense1", "polDense2"],
}


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def load_rows(path: Path, n: int) -> List[Dict[str, Any]]:
    out = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
            if len(out) >= n:
                break
    return out


def build_model(ckpt: Path, device: torch.device) -> SpatialResNet:
    model = SpatialResNet(spatial_channels=26, trunk_channels=32, global_dim=20,
                          action_semantic_dim=53, version="spatial-resnet-v2",
                          num_blocks=2, global_policy_pool=False).to(device)
    load_model_from_ts_json(model, str(ckpt))
    model.eval()
    return model


@torch.no_grad()
def forward_rows(model: SpatialResNet, rows: List[Dict[str, Any]], device: torch.device):
    """与 trainer 的 run_epoch 使用同一套 pooling/拼接代码，返回每行的 logits 与 value。"""
    logits_per_row: List[np.ndarray] = []
    values: List[float] = []
    for row in rows:
        spatial = torch.from_numpy(np.array(row["spatialTensor"], dtype=np.float32).reshape(-1, 20, 20)).unsqueeze(0).to(device)
        glob = torch.from_numpy(np.array(row["globalFeatures"], dtype=np.float32)).unsqueeze(0).to(device)
        cands = row["candidateActions"]
        z = model.forward_trunk(spatial)
        val = model.forward_value(z, glob).squeeze(-1)
        z_b = z[0]
        v_act = T.pool_coords_batch(z_b, [c.get("actorCoord") for c in cands])
        v_land = T.pool_coords_batch(z_b, [c.get("landingCoord") for c in cands])
        v_tgt = T.pool_coords_batch(z_b, [c.get("targetCoord") for c in cands])
        sem = np.stack([np.array(c.get("semantics", [])[:53] + [0.0] * max(0, 53 - len(c.get("semantics", []))),
                                 dtype=np.float32) for c in cands], axis=0)
        sem_t = torch.from_numpy(sem).to(device)
        glob_exp = glob[0].unsqueeze(0).expand(len(cands), -1)
        feats = torch.cat([v_act, v_land, v_tgt, sem_t, glob_exp], dim=-1).unsqueeze(0)
        logits = model.forward_action_logits(feats)[0].cpu().numpy()
        logits_per_row.append(logits)
        values.append(float(val.item()))
    return logits_per_row, values


def param_deltas(init_ckpt: Path, other_ckpt: Path) -> Dict[str, Any]:
    a = json.loads(init_ckpt.read_text(encoding="utf-8"))
    b = json.loads(other_ckpt.read_text(encoding="utf-8"))
    out: Dict[str, Any] = {}
    for group, keys in GROUPS.items():
        max_abs = 0.0
        l2 = 0.0
        changed = 0
        total = 0
        per_key: Dict[str, Any] = {}
        for key in keys:
            if key not in a or key not in b:
                continue
            w1 = np.array(a[key]["weights"], dtype=np.float64)
            w2 = np.array(b[key]["weights"], dtype=np.float64)
            b1 = np.array(a[key]["biases"], dtype=np.float64)
            b2 = np.array(b[key]["biases"], dtype=np.float64)
            d = np.concatenate([np.abs(w1 - w2), np.abs(b1 - b2)])
            per_key[key] = {"maxAbsDelta": float(d.max()), "l2Delta": float(np.linalg.norm(d)),
                            "changedElements": int((d > 0).sum()), "elements": int(d.size)}
            max_abs = max(max_abs, float(d.max()))
            l2 += float(np.linalg.norm(d) ** 2)
            changed += int((d > 0).sum())
            total += int(d.size)
        out[group] = {"maxAbsDelta": max_abs, "l2Delta": math.sqrt(l2),
                      "changedElements": changed, "elements": total, "perKey": per_key}
    return out


def ledger_stats(path: Path) -> Dict[str, Any]:
    updates = 0
    exposures = 0
    value_sup = 0
    policy_masked = 0
    value_masked = 0
    lr_first = lr_last = None
    dur = 0.0
    epochs = set()
    sizes = {}
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            updates += 1
            bs = int(e.get("batchSize") or 0)
            exposures += bs
            sizes[bs] = sizes.get(bs, 0) + 1
            value_sup += int(e.get("valueSupervised") or 0)
            policy_masked += int(e.get("policyMasked") or 0)
            value_masked += int(e.get("valueMasked") or 0)
            if e.get("lr") is not None:
                if lr_first is None:
                    lr_first = float(e["lr"])
                lr_last = float(e["lr"])
            dur += float(e.get("durationMs") or 0.0)
            epochs.add(e.get("epoch"))
    return {
        "ledgerPath": str(path).replace("\\", "/"),
        "ledgerSha256": sha256(path),
        "ledgerLines": updates,
        "updatesMeasured": updates,
        "exposuresMeasured": exposures,
        "batchSizeHistogram": {str(k): v for k, v in sorted(sizes.items())},
        "valueSupervisedExposures": value_sup,
        "valueMaskedExposures": value_masked,
        "policyMaskedExposures": policy_masked,
        "lrFirstUpdate": lr_first,
        "lrLastUpdate": lr_last,
        "sumDurationMs": dur,
        "sumDurationMinutes": round(dur / 60000.0, 2),
        "epochsWithUpdates": sorted(x for x in epochs if x is not None),
    }


def probe_stats(path: Path, n_updates: int = 20) -> Dict[str, Any]:
    pre: List[Dict[str, Any]] = []
    steps: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            (pre if e.get("phase") == "preClip" else steps).append(e)
    val_norms = []
    for e in pre[:n_updates]:
        g = (e.get("gradNorms") or {}).get("value")
        if g is not None:
            val_norms.append(float(g))
    pol_norms = [float((e.get("gradNorms") or {}).get("policy") or 0.0) for e in pre[:n_updates]]
    trunk_norms = [float((e.get("gradNorms") or {}).get("trunk") or 0.0) for e in pre[:n_updates]]
    parts = sorted({tuple(s.get("optimizerParts") or []) for s in steps})
    return {
        "probePath": str(path).replace("\\", "/"),
        "preClipRows": len(pre),
        "optimizerSteps": len(steps),
        "firstNUpdates": min(n_updates, len(val_norms)),
        "valueHeadGradNormPreClip": {
            "values": val_norms,
            "mean": (sum(val_norms) / len(val_norms)) if val_norms else None,
            "max": max(val_norms) if val_norms else None,
            "min": min(val_norms) if val_norms else None,
        },
        "policyHeadGradNormPreClipFirstN": pol_norms,
        "trunkGradNormPreClipFirstN": trunk_norms,
        "clipMaxNorm": pre[0].get("maxNorm") if pre else None,
        "optimizerPartsObserved": [list(p) for p in parts],
        "note": "pre-clip 梯度范数：探针在 trainer 调用 clip_grad_norm_(max_norm=5.0) 之前读取，"
                "因此是裁剪前范数；optimizerPartsObserved 是 AdamW.step 里实际持有的部分。",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--experiments-dir", default=str(REPO / "v17/out/v17_20260926_r2/experiments"))
    ap.add_argument("--init", default=str(REPO / "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"))
    ap.add_argument("--val", default=str(REPO / "v17/out/v17_20260926_r2/data/legacy_val_dedup.jsonl"))
    ap.add_argument("--arms", default="V0,P0,PV0")
    ap.add_argument("--rows", type=int, default=200)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    exp_dir = Path(args.experiments_dir)
    init_ckpt = Path(args.init)
    rows = load_rows(Path(args.val), args.rows)
    print(f"[verify] 前向一致性样本数 N={len(rows)}（来自 {args.val}）")
    device = torch.device("cpu")

    init_model = build_model(init_ckpt, device)
    init_logits, init_values = forward_rows(init_model, rows, device)

    report: Dict[str, Any] = {
        "schema": "v17_training_run_verification_1",
        "initCheckpoint": str(init_ckpt).replace("\\", "/"),
        "initCheckpointSha256": sha256(init_ckpt),
        "forwardProbeRows": len(rows),
        "forwardProbeSource": str(Path(args.val)).replace("\\", "/"),
        "arms": {},
    }

    for arm in [a.strip() for a in args.arms.split(",") if a.strip()]:
        arm_dir = exp_dir / arm
        entry: Dict[str, Any] = {"dir": str(arm_dir).replace("\\", "/"), "exists": arm_dir.is_dir()}
        if not entry["exists"]:
            entry["error"] = "目录不存在"
            report["arms"][arm] = entry
            continue
        final = arm_dir / f"{arm}_final.json"
        last = arm_dir / f"{arm}_last.json"
        best = arm_dir / f"{arm}_best.json"
        metrics = arm_dir / "metrics.json"
        ledgers = sorted(arm_dir.glob("*.optimizer_update_ledger.jsonl"))
        probe = arm_dir / "value_head_grad_probe.jsonl"

        for label, p in (("final", final), ("last", last), ("best", best)):
            entry[label] = ({"path": str(p).replace("\\", "/"), "sha256": sha256(p),
                             "bytes": p.stat().st_size} if p.exists() else None)
        if metrics.exists():
            m = json.loads(metrics.read_text(encoding="utf-8"))
            entry["metrics"] = {
                "path": str(metrics).replace("\\", "/"),
                "value_weight": m.get("value_weight"),
                "optimizerUpdates": m.get("optimizerUpdates"),
                "epochsCompleted": m.get("epochsCompleted"),
                "train_samples": m.get("train_samples"),
                "val_samples": m.get("val_samples"),
                "best_val_acc": m.get("best_val_acc"),
                "stopReason": (m.get("lifecycle") or {}).get("stopReason"),
                "lifecycle": m.get("lifecycle"),
                "lrSchedule": m.get("lrSchedule"),
                "v17ValueSupervision": m.get("v17ValueSupervision"),
                "dataset": m.get("dataset"),
                "datasetSha256": m.get("datasetSha256"),
                "split": m.get("split"),
                "initCheckpointSha256": m.get("initCheckpointSha256"),
                "maskAccountingFirstEpoch": ((m.get("maskAccounting") or {}).get("perEpoch") or [None])[0],
                "trainFinalLoss": (m.get("history") or [{}])[-1].get("train_loss"),
                "trainFinalAcc": (m.get("history") or [{}])[-1].get("train_acc"),
                "valFinalLoss": (m.get("history") or [{}])[-1].get("val_loss"),
                "valFinalAcc": (m.get("history") or [{}])[-1].get("val_acc"),
            }
        else:
            entry["metrics"] = None
        entry["ledger"] = ledger_stats(ledgers[0]) if ledgers else None
        if len(ledgers) > 1:
            entry["ledgerWarning"] = [str(p) for p in ledgers]
        if probe.exists():
            entry["gradientProbe"] = probe_stats(probe)
        else:
            entry["gradientProbe"] = None
        entry["paramDeltasVsInit"] = param_deltas(init_ckpt, final) if final.exists() else None

        if final.exists():
            model = build_model(final, device)
            logits, values = forward_rows(model, rows, device)
            max_logit = 0.0
            argmax_changes = 0
            for a, b in zip(init_logits, logits):
                if a.shape != b.shape:
                    raise RuntimeError(f"{arm}: candidate count differs between checkpoints")
                max_logit = max(max_logit, float(np.max(np.abs(a - b))))
                if int(np.argmax(a)) != int(np.argmax(b)):
                    argmax_changes += 1
            vdiff = [abs(x - y) for x, y in zip(init_values, values)]
            entry["forwardComparisonVsInit"] = {
                "rows": len(rows),
                "policyLogitsMaxAbsDelta": max_logit,
                "policyArgmaxChangedRows": argmax_changes,
                "valueOutputMaxAbsDelta": max(vdiff) if vdiff else None,
                "valueOutputMeanAbsDelta": (sum(vdiff) / len(vdiff)) if vdiff else None,
                "valueOutputIdentical": all(d == 0.0 for d in vdiff),
            }
        report["arms"][arm] = entry
        vs = entry.get("forwardComparisonVsInit") or {}
        pd = entry.get("paramDeltasVsInit") or {}
        print(f"[{arm}] updates={((entry.get('ledger') or {}).get('updatesMeasured'))} "
              f"exposures={((entry.get('ledger') or {}).get('exposuresMeasured'))} "
              f"valueW={(entry.get('metrics') or {}).get('value_weight')} "
              f"dValue={(pd.get('value') or {}).get('maxAbsDelta')} "
              f"dPolicy={(pd.get('policy') or {}).get('maxAbsDelta')} "
              f"dTrunk={(pd.get('trunk') or {}).get('maxAbsDelta')} "
              f"logitMaxDelta={vs.get('policyLogitsMaxAbsDelta')} "
              f"valueMaxDelta={vs.get('valueOutputMaxAbsDelta')}")

    out = Path(args.out) if args.out else exp_dir / "training_run_verification.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[verify] wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
