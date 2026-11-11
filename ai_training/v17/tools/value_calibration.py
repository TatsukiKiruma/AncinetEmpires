"""V17/T17-02：独立价值校准与策略 top-1 评测（干净 val）。

评测对象（全部固定权重、CPU、无搜索）：
  * init   = v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json（冠军起点）
  * V0     = 只训练 value 部分，value_weight=1.0
  * P0     = 训练 trunk+policy，value_weight=0.0（value head 权重冻结但 trunk 变了）
  * PV0    = 全部训练，value_weight=0.25

价值侧（val = 干净 val，即「输入从未在 train 出现过」的 606 行）：
  * MSE 与 Brier（Brier = MSE/4：±1 目标映射到 {0,1} 后的平方误差），
    分量：全量 / 每图 / 每座位 / 每阶段；
  * 基线对比：(a) 常数基线 = train 集 valueTarget 均值，(b) init 冠军自己的 value head；
  * 预测符号 × 实际符号混淆矩阵（pred>0 / pred<0 × 实际 +1 / −1），
    并给出「预测是否符号翻转」的判定；
  * 是否可用于搜索的结论：必须同时 (i) MSE 优于常数基线，(ii) 与真实结果正相关、非符号翻转。

策略侧：
  * 干净 val 上对 `l1ActionCode` 的 top-1（与 v17/review/evaluate_clean_val.py 同一定义：
    argmax(logits) 候选的 actionCode == row['l1ActionCode']）；
  * 同一指标在「输入从未见于训练」的子集上——本数据里干净 val 的 606 行全部满足该条件，
    因此两个数字相同；脚本会**独立重算 v17-netinput-v1 实际输入 key** 并断言
    val∩train 交集为 0，否则拒绝声称「未见输入」。
  * 与审核参考值 311/606 = 51.32%（P1:s2026）对照。

用法（真实命令）：
  & $py v17/tools/value_calibration.py --experiments-dir v17/out/v17_20260926_r2/experiments `
      --val v17/out/v17_20260926_r2/data/legacy_val_dedup.jsonl `
      --train v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl --verify-identity
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "v17" / "tools"))
sys.path.insert(0, str(REPO / "python"))

import numpy as np  # noqa: E402
import torch  # noqa: E402

import train_v17 as T  # noqa: E402  （复用 trainer 完全相同的 pooling 代码）
from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402

# 审核参考值：v17/review/clean_val.json 的 unique_unseen = 606 行 / 311 正确。
AUDIT_REFERENCE = {"rows": 606, "correct": 311, "accuracy": 0.5132013201320133,
                   "checkpoint": "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"}


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def rows_of(path: Path, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    out = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
            if limit is not None and len(out) >= limit:
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
def evaluate(model: SpatialResNet, rows: List[Dict[str, Any]], device: torch.device) -> List[Dict[str, Any]]:
    out = []
    for row in rows:
        cands = row["candidateActions"]
        spatial = torch.from_numpy(np.array(row["spatialTensor"], dtype=np.float32)
                                   .reshape(-1, 20, 20)).unsqueeze(0).to(device)
        glob = torch.from_numpy(np.array(row["globalFeatures"], dtype=np.float32)).unsqueeze(0).to(device)
        z = model.forward_trunk(spatial)
        val = float(model.forward_value(z, glob).item())
        z_b = z[0]
        # 与 trainer 的 SpatialDataset 一致：语义按 53 维上界补齐/截断。
        sem = np.stack([
            np.array(list(c.get("semantics", []))[:53] + [0.0] * max(0, 53 - len(c.get("semantics", []))),
                     dtype=np.float32)
            for c in cands
        ], axis=0)
        feats = torch.cat([
            T.pool_coords_batch(z_b, [c.get("actorCoord") for c in cands]),
            T.pool_coords_batch(z_b, [c.get("landingCoord") for c in cands]),
            T.pool_coords_batch(z_b, [c.get("targetCoord") for c in cands]),
            torch.from_numpy(sem).to(device),
            glob[0].unsqueeze(0).expand(len(cands), -1),
        ], dim=-1).unsqueeze(0)
        logits = model.forward_action_logits(feats)[0].cpu().numpy()
        pred_idx = int(np.argmax(logits))
        pred_code = cands[pred_idx].get("actionCode")
        out.append({
            "sampleId": row.get("sampleId"),
            "family": row.get("trueFamilyId") or row.get("rootFamilyId"),
            "mapName": row.get("mapName"),
            "seat": str(row.get("subjectPlayerId")),
            "phase": str(row.get("phaseBucket")),
            "valuePred": val,
            "valueTarget": float(row["valueTarget"]),
            "outcomeSource": row.get("outcomeSource"),
            "policyTop1Correct": int(pred_code == row.get("l1ActionCode")),
            "targetIdxTop1Correct": int(pred_idx == int(row.get("targetActionIndex", -1))),
            "l1ActionCode": row.get("l1ActionCode"),
            "predActionCode": pred_code,
        })
    return out


def mse(preds: List[float], targets: List[float]) -> Optional[float]:
    if not preds:
        return None
    return float(sum((p - t) ** 2 for p, t in zip(preds, targets)) / len(preds))


def pearson(xs: List[float], ys: List[float]) -> Optional[float]:
    if len(xs) < 2:
        return None
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    dx = math.sqrt(sum((a - mx) ** 2 for a in xs))
    dy = math.sqrt(sum((b - my) ** 2 for b in ys))
    if dx == 0 or dy == 0:
        return None
    return float(num / (dx * dy))


def value_report(records: List[Dict[str, Any]], label: str,
                 constant: float) -> Dict[str, Any]:
    preds = [r["valuePred"] for r in records]
    tgts = [r["valueTarget"] for r in records]
    const_preds = [constant] * len(records)
    out: Dict[str, Any] = {
        "label": label,
        "rows": len(records),
        "mse": mse(preds, tgts),
        "brier": (mse([(p + 1) / 2 for p in preds], [(t + 1) / 2 for t in tgts])
                  if records else None),
        "constantBaseline": {
            "constant": constant,
            "mse": mse(const_preds, tgts),
            "brier": mse([(constant + 1) / 2] * len(records),
                         [(t + 1) / 2 for t in tgts]) if records else None,
        },
        "mseBetterThanConstant": None,
        "pearsonPredTarget": pearson(preds, tgts),
        "meanPred": (sum(preds) / len(preds)) if preds else None,
        "meanTarget": (sum(tgts) / len(tgts)) if tgts else None,
        "predRange": [min(preds), max(preds)] if preds else None,
    }
    if out["mse"] is not None and out["constantBaseline"]["mse"] is not None:
        out["mseImprovementVsConstant"] = out["constantBaseline"]["mse"] - out["mse"]
        out["mseBetterThanConstant"] = bool(out["mse"] < out["constantBaseline"]["mse"])
    # 符号混淆矩阵（预测正/负 × 实际胜/负）
    cm = Counter()
    for r in records:
        p_sign = "predPos" if r["valuePred"] > 0 else "predNeg"
        a_sign = "actualWin" if r["valueTarget"] > 0 else "actualLoss"
        cm[(p_sign, a_sign)] += 1
    out["signConfusionMatrix"] = {
        "predPositive_actualWin": cm[("predPos", "actualWin")],
        "predPositive_actualLoss": cm[("predPos", "actualLoss")],
        "predNegative_actualWin": cm[("predNeg", "actualWin")],
        "predNegative_actualLoss": cm[("predNeg", "actualLoss")],
        "signAccuracy": ((cm[("predPos", "actualWin")] + cm[("predNeg", "actualLoss")]) / len(records))
                        if records else None,
        "constantBaselineSignAccuracy": (sum(1 for t in tgts if (constant > 0) == (t > 0)) / len(tgts))
                                        if records else None,
    }
    out["signFlipped"] = bool(out["pearsonPredTarget"] is not None
                             and out["pearsonPredTarget"] < 0)
    # family 级汇总：val 行按 family 聚集（一个 family 多行、同一物理对局），
    # 行级 MSE 会因族内相关性而偏乐观，因此额外给出「族均值符号是否一致」。
    fam_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in records:
        fam_buckets[str(r["family"])].append(r)
    fam_rows = []
    for fam, rs in sorted(fam_buckets.items()):
        mp = sum(r["valuePred"] for r in rs) / len(rs)
        mt = sum(r["valueTarget"] for r in rs) / len(rs)
        fam_rows.append({"family": fam, "rows": len(rs), "meanPred": mp, "meanTarget": mt,
                         "signAgrees": bool((mp > 0) == (mt > 0)) if mt != 0 else None,
                         "mse": mse([r["valuePred"] for r in rs], [r["valueTarget"] for r in rs])})
    agree = [f["signAgrees"] for f in fam_rows if f["signAgrees"] is not None]
    out["familyRollup"] = {
        "families": len(fam_rows),
        "familiesWithSignAgreement": sum(1 for a in agree if a),
        "familySignAgreement": (sum(1 for a in agree if a) / len(agree)) if agree else None,
        "familyMseOfMeans": mse([f["meanPred"] for f in fam_rows], [f["meanTarget"] for f in fam_rows]),
        "perFamily": fam_rows[:80],
        "note": "同一 family 内的行来自同一物理对局（不同座位/步数），行级指标偏乐观；"
                "familySignAgreement 是按族均值算的符号一致率。",
    }
    out["breakdowns"] = {}
    for key in ("mapName", "seat", "phase"):
        buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for r in records:
            buckets[str(r[key])].append(r)
        out["breakdowns"][key] = {
            b: {
                "rows": len(rs),
                "mse": mse([r["valuePred"] for r in rs], [r["valueTarget"] for r in rs]),
                "brier": mse([(r["valuePred"] + 1) / 2 for r in rs], [(r["valueTarget"] + 1) / 2 for r in rs]),
                "constantMse": mse([constant] * len(rs), [r["valueTarget"] for r in rs]),
                "meanTarget": sum(r["valueTarget"] for r in rs) / len(rs),
                "meanPred": sum(r["valuePred"] for r in rs) / len(rs),
                "signAccuracy": (sum(1 for r in rs if (r["valuePred"] > 0) == (r["valueTarget"] > 0)) / len(rs)),
            }
            for b, rs in sorted(buckets.items())
        }
    return out


def policy_report(records: List[Dict[str, Any]], label: str) -> Dict[str, Any]:
    rows = len(records)
    correct = sum(r["policyTop1Correct"] for r in records)
    by_map: Dict[str, List[int]] = defaultdict(list)
    for r in records:
        by_map[str(r["mapName"])].append(r["policyTop1Correct"])
    by_seat: Dict[str, List[int]] = defaultdict(list)
    for r in records:
        by_seat[str(r["seat"])].append(r["policyTop1Correct"])
    return {
        "label": label,
        "rows": rows,
        "top1Correct": correct,
        "top1Accuracy": (correct / rows) if rows else None,
        "targetIndexTop1Accuracy": (sum(r["targetIdxTop1Correct"] for r in records) / rows) if rows else None,
        "byMap": {k: {"rows": len(v), "correct": sum(v), "accuracy": sum(v) / len(v)}
                  for k, v in sorted(by_map.items())},
        "bySeat": {k: {"rows": len(v), "correct": sum(v), "accuracy": sum(v) / len(v)}
                   for k, v in sorted(by_seat.items())},
        "reference": AUDIT_REFERENCE if label == "init_P1_s2026" else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--experiments-dir", default=str(REPO / "v17/out/v17_20260926_r2/experiments"))
    ap.add_argument("--val", default=str(REPO / "v17/out/v17_20260926_r2/data/legacy_val_dedup.jsonl"))
    ap.add_argument("--train", default=str(REPO / "v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl"))
    ap.add_argument("--init", default=str(REPO / "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"))
    ap.add_argument("--out", default=str(REPO / "v17/out/v17_20260926_r2/experiments/value_calibration.json"))
    ap.add_argument("--verify-identity", action="store_true",
                    help="独立重算 v17-netinput-v1 实际输入 key，断言 train∩val = 0（较慢，读 432MB）")
    ap.add_argument("--train-subsample", type=int, default=0,
                    help="在 train 上额外评测 N 行（等距抽样），用于对比「记忆 train」与「泛化 val」；0=关闭")
    args = ap.parse_args()

    exp_dir = Path(args.experiments_dir)
    val_path = Path(args.val)
    device = torch.device("cpu")
    val_rows = rows_of(val_path)
    print(f"[calib] val rows = {len(val_rows)} ({val_path})")

    # ---- 0) 独立重算实际输入身份，证明「未见输入」这一说法 --------------------
    identity_check: Dict[str, Any] = {"performed": bool(args.verify_identity)}
    if args.verify_identity:
        import importlib.util
        spec = importlib.util.spec_from_file_location("build_v17_dataset",
                                                      str(REPO / "v17/tools/build_v17_dataset.py"))
        bmod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bmod)
        val_keys = {bmod.input_key(r): r["sampleId"] for r in val_rows}
        train_keys = set()
        train_path = Path(args.train)
        with train_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    train_keys.add(bmod.input_key(json.loads(line)))
        inter = set(val_keys) & train_keys
        identity_check.update({
            "identityId": "v17-netinput-v1",
            "valUniqueInputs": len(val_keys),
            "trainUniqueInputs": len(train_keys),
            "intersection": len(inter),
            "intersectionExamples": sorted(inter)[:5],
            "valRowsAllUnseen": len(inter) == 0,
            "trainPath": str(train_path).replace("\\", "/"),
            "trainSha256": sha256(train_path),
        })
        print(f"[calib] identity: val={len(val_keys)} train={len(train_keys)} intersection={len(inter)}")

    # ---- 1) 常数基线：train 集 valueTarget 均值 ---------------------------------
    train_mean = None
    train_stats = None
    train_path = Path(args.train)
    tvals = []
    tcount = Counter()
    train_sample: List[Dict[str, Any]] = []
    _stride = None
    _idx = 0
    if args.train_subsample > 0:
        with train_path.open("r", encoding="utf-8") as fh:
            _total = sum(1 for line in fh if line.strip())
        _stride = max(1, _total // int(args.train_subsample))
    with train_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            v = r.get("valueTarget")
            if v is not None:
                tvals.append(float(v))
                tcount[str(int(v))] += 1
            if _stride is not None and _idx % _stride == 0 and len(train_sample) < int(args.train_subsample):
                train_sample.append(r)
            _idx += 1
    train_mean = sum(tvals) / len(tvals) if tvals else 0.0
    train_stats = {"rows": len(tvals), "mean": train_mean, "distribution": dict(sorted(tcount.items())),
                   "subsampleRows": len(train_sample), "subsampleStride": _stride}
    print(f"[calib] train mean target = {train_mean:.6f} over {len(tvals)} rows; "
          f"train subsample = {len(train_sample)} rows (stride={_stride})")

    # ---- 2) 各权重前向 --------------------------------------------------------
    checkpoints: List[Tuple[str, Path]] = [("init_P1_s2026", Path(args.init))]
    for arm in ("V0", "P0", "PV0"):
        for suffix in ("final", "best"):
            p = exp_dir / arm / f"{arm}_{suffix}.json"
            if p.exists():
                checkpoints.append((arm if suffix == "final" else f"{arm}_{suffix}", p))
            elif suffix == "final":
                print(f"[calib] [!] 缺少 {p}，跳过 {arm}")
    if len(checkpoints) == 1:
        print("[calib] 只找到 init 权重；仍然输出 init 的校准结果。")

    payload: Dict[str, Any] = {
        "schema": "v17_value_calibration_1",
        "val": {"path": str(val_path).replace("\\", "/"), "sha256": sha256(val_path),
                "rows": len(val_rows),
                "valueTargetDistribution": dict(sorted(Counter(str(int(r["valueTarget"])) for r in val_rows).items())),
                "families": len({r.get("trueFamilyId") for r in val_rows})},
        "trainConstantBaseline": train_stats,
        "identityCheck": identity_check,
        "checkpoints": {},
        "policy": {},
        "conclusion": {},
    }

    for label, ckpt in checkpoints:
        model = build_model(ckpt, device)
        recs = evaluate(model, val_rows, device)
        entry = {
            "path": str(ckpt).replace("\\", "/"),
            "sha256": sha256(ckpt),
            "value": value_report(recs, label, train_mean),
        }
        if train_sample:
            tr_recs = evaluate(model, train_sample, device)
            entry["trainSubsample"] = value_report(tr_recs, f"{label}_train_sub", train_mean)
        payload["checkpoints"][label] = entry
        payload["policy"][label] = policy_report(recs, label)
        print(f"[calib] {label}: policy top1={payload['policy'][label]['top1Accuracy']:.4f} "
              f"valueMSE={entry['value']['mse']:.4f} "
              f"constMSE={entry['value']['constantBaseline']['mse']:.4f}"
              + (f" trainValueMSE={entry['trainSubsample']['mse']:.4f}" if train_sample else ""))

    # ---- 3) 「未见输入」子集上的策略 top-1 -------------------------------------
    for label, _ in checkpoints:
        payload["policy"][label]["unseenInputSubset"] = {
            "definition": "val 行中实际输入 key 不在 train key 集合内的行；本数据里 606/606 行全部满足",
            "rows": payload["policy"][label]["rows"],
            "top1Accuracy": payload["policy"][label]["top1Accuracy"],
            "identityVerified": bool(identity_check.get("valRowsAllUnseen")),
            "referenceAudit": AUDIT_REFERENCE if label == "init_P1_s2026" else None,
        }

    # ---- 4) 结论 --------------------------------------------------------------
    init_v = payload["checkpoints"].get("init_P1_s2026", {}).get("value", {})
    for arm in ("V0", "PV0"):
        v = payload["checkpoints"].get(arm, {}).get("value")
        if not v:
            payload["conclusion"][arm] = {"usableForSearch": None, "reason": "缺少该臂的权重或评测"}
            continue
        beats_const = bool(v.get("mseBetterThanConstant"))
        flipped = bool(v.get("signFlipped"))
        payload["conclusion"][arm] = {
            "mse": v.get("mse"),
            "constantMse": (v.get("constantBaseline") or {}).get("mse"),
            "initMse": init_v.get("mse"),
            "beatsConstantBaseline": beats_const,
            "signFlipped": flipped,
            "pearsonPredTarget": v.get("pearsonPredTarget"),
            "signAccuracy": (v.get("signConfusionMatrix") or {}).get("signAccuracy"),
            "familySignAgreement": (v.get("familyRollup") or {}).get("familySignAgreement"),
            "familyMseOfMeans": (v.get("familyRollup") or {}).get("familyMseOfMeans"),
            "usableForSearch": bool(beats_const and not flipped),
            "reason": ("优于常数基线且与真实结果正相关" if (beats_const and not flipped)
                       else ("不比常数基线好" if not beats_const else "预测与真实结果负相关（符号翻转）")),
        }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[calib] wrote {out}")
    for arm, c in payload["conclusion"].items():
        print(f"[conclusion] {arm}: usableForSearch={c.get('usableForSearch')} ({c.get('reason')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
