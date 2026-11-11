"""V14/T14-03：候选重排不变性与一次优化更新的数值一致性。

任务书 5.2 要求：对固定状态反序与至少 3 次固定种子乱序，目标和辅助标签同步映射；
对齐后的 logits、loss、梯度、一轮优化更新必须满足预登记容差。
预登记容差：FP32 梯度/更新 atol=1e-5, rtol=1e-4；logits atol=1e-6, rtol=1e-6。

用法：
    py python/v14_check_permutation_invariance.py \\
        --dataset <dataset.jsonl> --out-dir <dir> [--states 16] [--model-seed 42]
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_rows(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def permutations_of(n: int, seed: int, replicates: int) -> List[Tuple[str, List[int]]]:
    """返回 (名称, 新顺序 -> 旧下标) 列表：反向 + replicates 次固定种子乱序。"""
    import random

    base = list(range(n))
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
    parser.add_argument("--states", type=int, default=16)
    parser.add_argument("--model-seed", type=int, default=42)
    parser.add_argument("--replicates", type=int, default=3)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    rows = load_rows(dataset)[: args.states]
    if not rows:
        print("[T14-03] 数据集为空", file=sys.stderr)
        return 1

    # V14/T14-03：特征维度由数据决定，避免把 53 维语义静默截成 32 维。
    sem_dims = {len(c.get("semantics", [])) for row in rows for c in row.get("candidateActions", [])}
    channels = {len(row["spatialTensor"]) // (20 * 20) for row in rows}
    global_dims = {len(row["globalFeatures"]) for row in rows}
    if not (len(sem_dims) == len(channels) == len(global_dims) == 1):
        print(f"[T14-03] 维度不唯一：sem={sorted(sem_dims)} ch={sorted(channels)} g={sorted(global_dims)}", file=sys.stderr)
        return 6
    semantic_dim = sem_dims.pop()
    spatial_channels = channels.pop()
    global_dim = global_dims.pop()
    print(f"[T14-03] dims from data: channels={spatial_channels} global={global_dim} semantics={semantic_dim}")
    torch.manual_seed(args.model_seed)
    model = SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=global_dim,
        action_semantic_dim=semantic_dim, version="spatial-resnet-v2", num_blocks=2,
    )
    model.train()

    def policy_features(row: Dict[str, Any], order: List[int]):
        """按给定候选顺序构造 [K, pol_dim] 特征（与训练器 run_epoch 完全同构）。"""
        import numpy as np
        spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(spatial_channels, 20, 20).unsqueeze(0)
        glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
        z = model.forward_trunk(spatial)
        cands = [row["candidateActions"][i] for i in order]
        act = [c.get("actorCoord") for c in cands]
        land = [c.get("landingCoord") for c in cands]
        tgt = [c.get("targetCoord") for c in cands]
        v_act = trainer.pool_coords_batch(z[0], act)
        v_land = trainer.pool_coords_batch(z[0], land)
        v_tgt = trainer.pool_coords_batch(z[0], tgt)
        sem = torch.from_numpy(np.stack([
            np.array(list(c.get("semantics", []))[:semantic_dim] + [0.0] * max(0, semantic_dim - len(c.get("semantics", []))),
                     dtype=np.float32)
            for c in cands
        ]))
        glob_expanded = glob[0].unsqueeze(0).expand(len(cands), -1)
        return torch.cat([v_act, v_land, v_tgt, sem, glob_expanded], dim=-1).unsqueeze(0), z, glob

    report: Dict[str, Any] = {
        "schema": "v14_candidate_permutation_invariance_1",
        "task": "T14-03",
        "dataset": str(dataset).replace("\\", "/"),
        "datasetSha256": _sha256_file(dataset),
        "states": len(rows),
        "replicates": args.replicates,
        "modelSeed": args.model_seed,
        "tolerances": {"logitsAtol": 1e-6, "logitsRtol": 1e-6, "gradAtol": 1e-5, "gradRtol": 1e-4},
        "cases": [],
    }

    worst_logit = 0.0
    worst_loss = 0.0
    worst_grad = 0.0
    worst_update = 0.0
    target_mapping_errors = 0

    for row_index, row in enumerate(rows):
        n = len(row["candidateActionCodes"])
        if n < 2:
            continue
        target_old = int(row["targetActionIndex"])
        base_order = list(range(n))
        base_feats, _, _ = policy_features(row, base_order)
        # 中文：不能 detach —— 后续要比较 loss/grad/一次优化更新的差异。
        base_logits = model.forward_action_logits(base_feats)  # [1, K]
        ce = torch.nn.CrossEntropyLoss()
        base_loss = ce(base_logits, torch.tensor([target_old], dtype=torch.long))
        base_grads = {}
        model.zero_grad()
        base_loss.backward(retain_graph=True)
        for name, param in model.named_parameters():
            if param.grad is not None:
                base_grads[name] = param.grad.detach().clone()
        # 一次优化更新的参考参数
        reference_model = copy.deepcopy(model)
        reference_optimizer = torch.optim.AdamW(reference_model.parameters(), lr=args.lr, weight_decay=1e-4)
        reference_optimizer.zero_grad()
        reference_loss = ce(
            reference_model.forward_action_logits(base_feats),
            torch.tensor([target_old], dtype=torch.long),
        )
        reference_loss.backward()
        reference_optimizer.step()

        case = {"sampleId": row.get("sampleId"), "candidates": n, "permutations": []}
        for name, order in permutations_of(n, args.model_seed, args.replicates):
            new_target = order.index(target_old)
            if row["candidateActionCodes"][order[new_target]] != row["targetActionCode"]:
                target_mapping_errors += 1
            feats, _, _ = policy_features(row, order)
            logits = model.forward_action_logits(feats)  # [1, K]
            # 对齐：permuted 的第 i 位对应原顺序的 order[i]
            aligned = torch.empty_like(base_logits[0])
            for position, old_index in enumerate(order):
                aligned[old_index] = logits[0][position]
            logit_diff = float(torch.max(torch.abs(aligned - base_logits[0].detach())).item())
            loss = ce(logits, torch.tensor([new_target], dtype=torch.long))
            loss_diff = float(torch.abs(loss - base_loss).item())
            model.zero_grad()
            loss.backward(retain_graph=True)
            grad_diff = 0.0
            for pname, param in model.named_parameters():
                if param.grad is None or pname not in base_grads:
                    continue
                grad_diff = max(grad_diff, float(torch.max(torch.abs(param.grad - base_grads[pname])).item()))
            update_diff = 0.0
            if name == "reverse":
                permuted_model = copy.deepcopy(model)
                permuted_optimizer = torch.optim.AdamW(permuted_model.parameters(), lr=args.lr, weight_decay=1e-4)
                permuted_optimizer.zero_grad()
                permuted_loss = ce(
                    permuted_model.forward_action_logits(feats),
                    torch.tensor([new_target], dtype=torch.long),
                )
                permuted_loss.backward()
                permuted_optimizer.step()
                for (pname, p_param), (_, r_param) in zip(
                    permuted_model.named_parameters(), reference_model.named_parameters(),
                ):
                    update_diff = max(update_diff, float(torch.max(torch.abs(p_param.detach() - r_param.detach())).item()))
            worst_logit = max(worst_logit, logit_diff)
            worst_loss = max(worst_loss, loss_diff)
            worst_grad = max(worst_grad, grad_diff)
            worst_update = max(worst_update, update_diff)
            case["permutations"].append({
                "name": name,
                "newTargetIndex": new_target,
                "targetCodeAtNewIndex": row["candidateActionCodes"][order[new_target]],
                "maxLogitDiff": logit_diff,
                "lossDiff": loss_diff,
                "maxGradDiff": grad_diff,
                "maxUpdateDiff": update_diff if name == "reverse" else None,
            })
        case["worstLogitDiff"] = max(p["maxLogitDiff"] for p in case["permutations"])
        case["worstGradDiff"] = max(p["maxGradDiff"] for p in case["permutations"])
        report["cases"].append(case)

    report["summary"] = {
        "statesCompared": len(report["cases"]),
        "maxLogitDiff": worst_logit,
        "maxLossDiff": worst_loss,
        "maxGradDiff": worst_grad,
        "maxUpdateDiffAfterOneStep": worst_update,
        "targetMappingErrors": target_mapping_errors,
        "logitsWithinTolerance": worst_logit <= 1e-6,
        "gradientsWithinTolerance": worst_grad <= 1e-5,
        "passed": worst_logit <= 1e-6 and worst_grad <= 1e-5 and target_mapping_errors == 0,
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "candidate_permutation_invariance.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"[T14-03] states={len(report['cases'])} maxLogitDiff={worst_logit:.3e} "
          f"maxGradDiff={worst_grad:.3e} maxUpdateDiff={worst_update:.3e} targetMapErrors={target_mapping_errors}")
    return 0 if report["summary"]["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
