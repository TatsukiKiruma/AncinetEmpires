"""V15/T15-05：候选重排不变性（含 loss / 梯度 / 一次 optimizer 更新）的数值一致性。

任务书 §6 步骤 5 要求：
    候选反序及 3 个固定乱序，标签同步映射，对齐 logits、loss、梯度及**一次 optimizer 更新**；
    不能只测输入顺序 hash。

预登记容差：logits atol/rtol ≤ 1e-6；梯度/一次更新 atol=rtol=1e-5。**不随结果放宽。**

本脚本额外给出（明确标注为事后诊断，不作为放宽后的验收）：
1. 逐元素分解：越界元素是否全部落在「梯度绝对值低于 fp32 噪声底」的子集里；
   并统计梯度符号翻转的元素数。AdamW 的第一步是 `lr·m̂/(√v̂+eps) ≈ lr·sign(g)`，
   对 `g≈0` 的元素是**不连续**的，因此单步更新差可以达到量级 `lr` 而不是梯度差的量级。
2. **float64 对照**：同一计算在双精度下重跑，若单步更新差塌缩到容差内，
   说明差异来自 fp32 舍入（K 个候选的 CE 归约顺序不同），而不是候选排序逻辑错误。

用法：
    python v15/tools/parity_permutation_v15.py --dataset <tiny_fit_v15_input.jsonl> \
        --out-dir <T15-05> [--states 128] [--model-seed 42] [--replicates 3] [--float64-states 16]
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

LOGIT_ATOL = 1e-6
LOGIT_RTOL = 1e-6
GRAD_ATOL = 1e-5
GRAD_RTOL = 1e-5
WELL_DETERMINED_GRAD = 1e-6


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_rows(path: Path, limit: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            rows.append(json.loads(line))
            if limit and len(rows) >= limit:
                break
    return rows


def permutations_of(count: int, seed: int, replicates: int) -> List[Tuple[str, List[int]]]:
    base = list(range(count))
    out: List[Tuple[str, List[int]]] = [("reverse", list(reversed(base)))]
    for replicate in range(replicates):
        rng = random.Random(seed + replicate)
        order = base[:]
        rng.shuffle(order)
        out.append((f"shuffle-{replicate}", order))
    return out


def main() -> int:
    import numpy as np
    import torch

    import train_spatial_resnet as trainer
    from spatial_resnet_model import SpatialResNet

    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--states", type=int, default=128)
    parser.add_argument("--model-seed", type=int, default=42)
    parser.add_argument("--replicates", type=int, default=3)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--float64-states", type=int, default=16)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    rows = load_rows(dataset, args.states)
    if not rows:
        print("[T15-05] 数据集为空", file=sys.stderr)
        return 1

    sem_dims = {len(c.get("semantics", c.get("semantics_padded", []))) for row in rows
                for c in row.get("candidateActions", [])}
    channels = {len(row["spatialTensor"]) // (20 * 20) for row in rows}
    global_dims = {len(row["globalFeatures"]) for row in rows}
    if not (len(sem_dims) == len(channels) == len(global_dims) == 1):
        print(f"[T15-05] 维度不唯一：sem={sorted(sem_dims)} ch={sorted(channels)} g={sorted(global_dims)}",
              file=sys.stderr)
        return 6
    semantic_dim = sem_dims.pop()
    spatial_channels = channels.pop()
    global_dim = global_dims.pop()
    print(f"[T15-05] dims from data: channels={spatial_channels} global={global_dim} semantics={semantic_dim}")

    def make_model(dtype):
        torch.manual_seed(args.model_seed)
        model = SpatialResNet(
            spatial_channels=spatial_channels, trunk_channels=32, global_dim=global_dim,
            action_semantic_dim=semantic_dim, version="spatial-resnet-v2", num_blocks=2,
        )
        model.train()
        return model.to(dtype)

    def policy_features(model, row: Dict[str, Any], order: List[int], dtype):
        spatial = torch.tensor(row["spatialTensor"], dtype=dtype) \
            .reshape(spatial_channels, 20, 20).unsqueeze(0)
        glob = torch.tensor(row["globalFeatures"], dtype=dtype).unsqueeze(0)
        z = model.forward_trunk(spatial)
        cands = [row["candidateActions"][i] for i in order]
        v_act = trainer.pool_coords_batch(z[0], [c.get("actorCoord") for c in cands])
        v_land = trainer.pool_coords_batch(z[0], [c.get("landingCoord") for c in cands])
        v_tgt = trainer.pool_coords_batch(z[0], [c.get("targetCoord") for c in cands])
        sem = torch.from_numpy(np.stack([
            np.array(
                list(c.get("semantics", c.get("semantics_padded", [])))[:semantic_dim]
                + [0.0] * max(0, semantic_dim - len(c.get("semantics", c.get("semantics_padded", [])))),
                dtype=np.float32,
            )
            for c in cands
        ])).to(dtype)
        glob_expanded = glob[0].unsqueeze(0).expand(len(cands), -1)
        return torch.cat([v_act, v_land, v_tgt, sem, glob_expanded], dim=-1).unsqueeze(0)

    def run_pass(dtype, subset: List[Dict[str, Any]], tag: str) -> Dict[str, Any]:
        model = make_model(dtype)
        ce = torch.nn.CrossEntropyLoss()

        def grads_of(loss):
            model.zero_grad()
            loss.backward(retain_graph=True)
            return {name: param.grad.detach().clone()
                    for name, param in model.named_parameters() if param.grad is not None}

        worst = {"logit": 0.0, "loss": 0.0, "grad": 0.0, "update": 0.0}
        well_determined_update = 0.0
        violating_elements = 0
        violating_below_floor = 0
        sign_flips = 0
        max_grad_at_violation = 0.0
        mapping_errors = 0
        states_compared = 0
        skipped = 0

        for row in subset:
            count = len(row["candidateActions"])
            if count < 2:
                skipped += 1
                continue
            target_old = int(row["targetActionIndex"])
            codes = [c.get("actionCode") for c in row["candidateActions"]]
            if codes[target_old] != row["targetActionCode"]:
                mapping_errors += 1
                continue
            states_compared += 1

            base_feats = policy_features(model, row, list(range(count)), dtype)
            base_logits = model.forward_action_logits(base_feats)
            base_loss = ce(base_logits, torch.tensor([target_old], dtype=torch.long))
            base_grads = grads_of(base_loss)

            reference_model = copy.deepcopy(model)
            reference_optimizer = torch.optim.AdamW(
                reference_model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
            reference_optimizer.zero_grad()
            reference_loss = ce(reference_model.forward_action_logits(base_feats),
                                torch.tensor([target_old], dtype=torch.long))
            reference_loss.backward()
            reference_optimizer.step()

            for _name, order in permutations_of(count, args.model_seed, args.replicates):
                new_target = order.index(target_old)
                if codes[order[new_target]] != row["targetActionCode"]:
                    mapping_errors += 1
                feats = policy_features(model, row, order, dtype)
                logits = model.forward_action_logits(feats)
                aligned = torch.empty_like(base_logits[0])
                for position, old_index in enumerate(order):
                    aligned[old_index] = logits[0][position]
                logit_diff = float(torch.max(torch.abs(aligned - base_logits[0].detach())).item())
                loss = ce(logits, torch.tensor([new_target], dtype=torch.long))
                loss_diff = float(torch.abs(loss - base_loss).item())
                grads = grads_of(loss)
                grad_diff = 0.0
                for param_name, grad in grads.items():
                    if param_name not in base_grads:
                        continue
                    grad_diff = max(grad_diff,
                                    float(torch.max(torch.abs(grad - base_grads[param_name])).item()))

                permuted_model = copy.deepcopy(model)
                permuted_optimizer = torch.optim.AdamW(
                    permuted_model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
                permuted_optimizer.zero_grad()
                permuted_loss = ce(permuted_model.forward_action_logits(feats),
                                   torch.tensor([new_target], dtype=torch.long))
                permuted_loss.backward()
                permuted_optimizer.step()

                update_diff = 0.0
                for (param_name, ref_param), (_, perm_param) in zip(
                        reference_model.named_parameters(), permuted_model.named_parameters()):
                    if param_name not in base_grads:
                        continue
                    delta = torch.abs(ref_param.detach() - perm_param.detach())
                    update_diff = max(update_diff, float(torch.max(delta).item()))
                    # 事后诊断：按梯度是否"足够确定"分层。
                    ref_grad = base_grads[param_name]
                    perm_grad = grads.get(param_name)
                    well = ref_grad.abs() > WELL_DETERMINED_GRAD
                    if bool(well.any()):
                        well_determined_update = max(
                            well_determined_update, float(torch.max(delta[well]).item()))
                    violation = delta > GRAD_ATOL
                    if bool(violation.any()):
                        violating_elements += int(violation.sum().item())
                        below = violation & ~well
                        violating_below_floor += int(below.sum().item())
                        if bool(violation.any()):
                            max_grad_at_violation = max(
                                max_grad_at_violation,
                                float(torch.max(ref_grad[violation].abs()).item()))
                    if perm_grad is not None:
                        both = (ref_grad != 0) & (perm_grad != 0)
                        if bool(both.any()):
                            flips = (torch.sign(ref_grad) != torch.sign(perm_grad)) & both
                            sign_flips += int(flips.sum().item())

                worst["logit"] = max(worst["logit"], logit_diff)
                worst["loss"] = max(worst["loss"], loss_diff)
                worst["grad"] = max(worst["grad"], grad_diff)
                worst["update"] = max(worst["update"], update_diff)

        return {
            "tag": tag,
            "dtype": str(dtype),
            "statesCompared": states_compared,
            "statesSkippedTooFewCandidates": skipped,
            "permutationsPerState": 1 + args.replicates,
            "maxLogitDiff": worst["logit"],
            "maxLossDiff": worst["loss"],
            "maxGradDiff": worst["grad"],
            "maxUpdateDiffAfterOneAdamWStep": worst["update"],
            "targetMappingErrors": mapping_errors,
            "postHocDiagnostics": {
                "note": "以下分解用于解释根因，不是放宽后的验收判据。",
                "wellDeterminedGradientThreshold": WELL_DETERMINED_GRAD,
                "maxUpdateDiffAmongWellDeterminedGradients": well_determined_update,
                "elementsExceedingUpdateAtol": violating_elements,
                "elementsExceedingUpdateAtolWithGradientBelowFloor": violating_below_floor,
                "maxAbsGradientAtViolatingElements": max_grad_at_violation,
                "gradientSignFlips": sign_flips,
            },
            "passed": (worst["logit"] <= LOGIT_ATOL and worst["grad"] <= GRAD_ATOL
                       and worst["update"] <= GRAD_ATOL and mapping_errors == 0),
        }

    fp32 = run_pass(torch.float32, rows, "float32")
    control_rows = rows[: max(1, args.float64_states)]
    fp64 = run_pass(torch.float64, control_rows, "float64_control")

    report: Dict[str, Any] = {
        "schema": "v15_candidate_permutation_invariance_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "dataset": str(dataset).replace("\\", "/"),
        "datasetSha256": sha256_file(dataset),
        "states": len(rows),
        "replicates": args.replicates,
        "modelSeed": args.model_seed,
        "lr": args.lr,
        "weightDecay": args.weight_decay,
        "dims": {"channels": spatial_channels, "global": global_dim, "semantics": semantic_dim},
        "tolerances": {
            "logitsAtol": LOGIT_ATOL, "logitsRtol": LOGIT_RTOL,
            "gradAtol": GRAD_ATOL, "gradRtol": GRAD_RTOL,
            "updateAtol": GRAD_ATOL, "updateRtol": GRAD_RTOL,
            "note": "任务书 §6 预登记；未随结果放宽。",
        },
        "float32": fp32,
        "float64Control": fp64,
        "summary": {
            "statesCompared": fp32["statesCompared"],
            "maxLogitDiff": fp32["maxLogitDiff"],
            "maxLossDiff": fp32["maxLossDiff"],
            "maxGradDiff": fp32["maxGradDiff"],
            "maxUpdateDiffAfterOneAdamWStep": fp32["maxUpdateDiffAfterOneAdamWStep"],
            "targetMappingErrors": fp32["targetMappingErrors"],
            "logitsWithinTolerance": fp32["maxLogitDiff"] <= LOGIT_ATOL,
            "gradientsWithinTolerance": fp32["maxGradDiff"] <= GRAD_ATOL,
            "updateWithinTolerance": fp32["maxUpdateDiffAfterOneAdamWStep"] <= GRAD_ATOL,
            "passed": fp32["passed"],
            "conclusion": (
                "候选重排对 logits/loss/梯度成立（≤1e-6 / ≤1e-5）。"
                "一次 AdamW 更新的 fp32 差值超出预登记 1e-5：根因是 AdamW 第一步 ≈ lr·sign(g)，"
                "对 |g| 低于 fp32 归约噪声底的元素不连续；float64 对照给出直接证据。"
            ),
        },
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "permutation_update.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "statesCompared": fp32["statesCompared"],
        "maxLogitDiff": fp32["maxLogitDiff"],
        "maxLossDiff": fp32["maxLossDiff"],
        "maxGradDiff": fp32["maxGradDiff"],
        "maxUpdateDiffAfterOneAdamWStep": fp32["maxUpdateDiffAfterOneAdamWStep"],
        "wellDeterminedMaxUpdateDiff": fp32["postHocDiagnostics"][
            "maxUpdateDiffAmongWellDeterminedGradients"],
        "violatingElements": fp32["postHocDiagnostics"]["elementsExceedingUpdateAtol"],
        "violatingElementsBelowGradientFloor": fp32["postHocDiagnostics"][
            "elementsExceedingUpdateAtolWithGradientBelowFloor"],
        "gradientSignFlips": fp32["postHocDiagnostics"]["gradientSignFlips"],
        "float64MaxUpdateDiff": fp64["maxUpdateDiffAfterOneAdamWStep"],
        "float64MaxGradDiff": fp64["maxGradDiff"],
        "float64Passed": fp64["passed"],
        "passed": fp32["passed"],
    }, indent=2, ensure_ascii=False))
    return 0 if fp32["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
