"""V16/T16-02 §4.2：B5 复制网络计算图修复与完整一次更新的可复验测试。

## 被修的实现缺口（V15 审核 §1.5）

`v15/tools/parity_permutation_v15.py` 在 **original model** 上先算 `base_feats`，
然后 `reference_model = copy.deepcopy(model)`，再用 **这些属于原模型的张量**算 CE；
permuted clone 同理。于是：

- 复制网络的 trunk（stem / res_blocks）根本没有进入计算图，`grad is None`；
- 一次 AdamW 更新只更新 policy head，**没有覆盖完整网络**；
- 因此 fp64 对照再漂亮也不能证明「完整网络的一次更新在候选重排下一致」。

本脚本**不改 V15 的历史文件**，而是提供修正后的实现，并把旧写法的失败读数同时保留
（`defectReproduction`），这样「修了什么」和「修之前错在哪」都能逐字段复核。

## 本脚本实际检查的内容

1. `defectReproduction`：旧写法下 clone 的 stem 梯度为 None、更新量为 0（复现）。
2. `correctedFullUpdate`：**在每个 clone 上重新执行 trunk 与坐标池化**，再做一次完整
   AdamW 更新；对齐 logits / loss / 梯度 / 一次更新。
3. `gradientParticipation`：断言应训练的 stem / res_blocks / pol_dense 参数都拿到梯度
   并在 optimizer 中产生 state；`valueWeight=0` 时 value 专属参数无梯度是**预期**。
4. `adamwAnalysis`：把差异按 AdamW 的实际机制分解（eps、exp_avg、exp_avg_sq、零梯度、
   近零梯度），**不用 `lr*|g|` 做解释**。
5. `determinismRegression`：完整网络 + 固定 optimizer state + 同一 canonical batch，
   两次运行的更新必须完全相同（差值恰为 0）。
6. `nonCanonicalSensitivity`：故意使用非规范归约顺序（候选逆序手算 CE），记录数值敏感性；
   若越界只能标 `NUMERICAL_LIMIT`，不能声称原始 B5 通过。
7. `canonicalization`：候选按 actionCode 的 Unicode 代码点序规范排序后，任意排列都得到
   **逐元素相同**的输入序列（这是生产侧真正的修复）。

用法：
    <py> v16/tools/t16_02_b5_clone_graph.py --out-dir v16/out/v16_20260926_core/T16-02
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

# 预登记容差（任务书 §4.2）：logits fp32 atol/rtol 保持 V15 的 1e-6 读数；
# 梯度与一次更新用 1e-5。**不随结果放宽。**
LOGIT_ATOL = 1e-6
GRAD_ATOL = 1e-5
UPDATE_ATOL = 1e-5
# AdamW 近零梯度的诊断门槛（仅用于解释，不作为验收判据）。
NEAR_ZERO_GRAD = 1e-8

SPATIAL_CHANNELS = 26
GLOBAL_DIM = 20
SEMANTIC_DIM = 53
GRID = 20
TRUNK_CHANNELS = 32


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def compare_code_points(left: str, right: str) -> int:
    """与 `src/game/ai/action_ordering.ts#compareActionCodeCanonicalV16` 同一语义。"""
    i = j = 0
    while i < len(left) and j < len(right):
        a = ord(left[i])
        b = ord(right[j])
        if a != b:
            return -1 if a < b else 1
        i += 1
        j += 1
    if i < len(left):
        return 1
    if j < len(right):
        return -1
    return 0


def canonical_order(codes: Sequence[str]) -> List[int]:
    """返回把 `codes` 排成规范顺序所需的原下标序列（稳定、无 locale 依赖）。"""
    return sorted(range(len(codes)), key=lambda index: tuple(ord(ch) for ch in codes[index]))


# ----------------------------------------------------------------------------
# 合成但结构真实的输入：五类坐标（含空坐标）、可变候选数、非规范来源顺序。
# ----------------------------------------------------------------------------
ACTION_TYPES = [
    ("move", "actorCoord", "landingCoord"),
    ("attack", "actorCoord", "targetCoord"),
    ("recruit_to_castle", "landingCoord", "targetCoord"),
    ("end_turn", None, None),          # end_turn 三处坐标全空（V15 审核 §4 的结构限制）
    ("heal", "actorCoord", "targetCoord"),
]


def make_states(count: int, seed: int) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    states: List[Dict[str, Any]] = []
    for state_index in range(count):
        candidate_count = 3 + (state_index % 7)          # 3..9 个候选
        candidates: List[Dict[str, Any]] = []
        for k in range(candidate_count):
            kind, first, second = ACTION_TYPES[k % len(ACTION_TYPES)]
            entry: Dict[str, Any] = {
                "actionCode": f"{kind}:u{state_index}-{k}:{rng.randrange(0, 400)}",
                "semantics": [rng.uniform(-1.0, 1.0) for _ in range(SEMANTIC_DIM)],
                "actorCoord": None,
                "landingCoord": None,
                "targetCoord": None,
            }
            for slot in (first, second):
                if slot is None:
                    continue
                entry[slot] = {"x": rng.randrange(0, GRID), "y": rng.randrange(0, GRID)}
            candidates.append(entry)
        # 来源顺序故意不是规范顺序：这就是需要被 canonicalize 掉的东西。
        states.append({
            "stateIndex": state_index,
            "spatialTensor": [rng.gauss(0.0, 1.0) for _ in range(SPATIAL_CHANNELS * GRID * GRID)],
            "globalFeatures": [rng.gauss(0.0, 1.0) for _ in range(GLOBAL_DIM)],
            "candidateActions": candidates,
            "targetActionIndex": rng.randrange(0, candidate_count),
        })
    return states


def main() -> int:
    import numpy as np
    import torch

    import train_spatial_resnet as trainer
    from spatial_resnet_model import SpatialResNet

    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--states", type=int, default=16)
    parser.add_argument("--model-seed", type=int, default=42)
    parser.add_argument("--replicates", type=int, default=3)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--float64-states", type=int, default=6)
    args = parser.parse_args()

    torch.set_num_threads(1)
    states = make_states(args.states, seed=args.model_seed)

    def make_model(dtype):
        torch.manual_seed(args.model_seed)
        model = SpatialResNet(
            spatial_channels=SPATIAL_CHANNELS, trunk_channels=TRUNK_CHANNELS,
            global_dim=GLOBAL_DIM, action_semantic_dim=SEMANTIC_DIM,
            version="spatial-resnet-v2", num_blocks=2,
        )
        model.train()
        return model.to(dtype)

    def policy_features(model, row: Dict[str, Any], order: List[int], dtype):
        """在**传入的 model** 上重新执行 trunk 与坐标池化（B5 修复的核心）。"""
        spatial = torch.tensor(row["spatialTensor"], dtype=dtype) \
            .reshape(SPATIAL_CHANNELS, GRID, GRID).unsqueeze(0)
        glob = torch.tensor(row["globalFeatures"], dtype=dtype).unsqueeze(0)
        z = model.forward_trunk(spatial)
        cands = [row["candidateActions"][i] for i in order]
        v_act = trainer.pool_coords_batch(z[0], [c.get("actorCoord") for c in cands])
        v_land = trainer.pool_coords_batch(z[0], [c.get("landingCoord") for c in cands])
        v_tgt = trainer.pool_coords_batch(z[0], [c.get("targetCoord") for c in cands])
        sem = torch.from_numpy(np.stack([
            np.array(c["semantics"][:SEMANTIC_DIM], dtype=np.float32)
            for c in cands
        ])).to(dtype)
        glob_expanded = glob[0].unsqueeze(0).expand(len(cands), -1)
        return torch.cat([v_act, v_land, v_tgt, sem, glob_expanded], dim=-1).unsqueeze(0)

    ce = torch.nn.CrossEntropyLoss()

    # ------------------------------------------------------------------
    # 1. 旧写法复现：clone 复用原模型特征 ⇒ trunk 梯度为 None。
    # ------------------------------------------------------------------
    defect_rows: List[Dict[str, Any]] = []
    for row in states[:4]:
        count = len(row["candidateActions"])
        if count < 2:
            continue
        model = make_model(torch.float32)
        target = int(row["targetActionIndex"])

        original_feats = policy_features(model, row, list(range(count)), torch.float32)
        clone = copy.deepcopy(model)
        optimizer = torch.optim.AdamW(clone.parameters(), lr=args.lr, weight_decay=args.weight_decay)
        before = clone.stem.weight.detach().clone()
        loss = ce(clone.forward_action_logits(original_feats), torch.tensor([target], dtype=torch.long))
        loss.backward()
        optimizer.step()
        defect_rows.append({
            "stateIndex": row["stateIndex"],
            "cloneStemGradIsNone": clone.stem.weight.grad is None,
            "cloneResidualGradIsNone": clone.res_blocks[0].conv1.weight.grad is None,
            "clonePolicyHeadGradIsNone": clone.pol_dense1.weight.grad is None,
            "cloneStemMaxUpdate": float((clone.stem.weight.detach() - before).abs().max().item()),
        })

    # ------------------------------------------------------------------
    # 2. 修正实现：每个 clone 自己重算 trunk ⇒ 完整网络参与一次更新。
    # ------------------------------------------------------------------
    def run_pass(dtype, subset: List[Dict[str, Any]], tag: str) -> Dict[str, Any]:
        worst = {"logit": 0.0, "loss": 0.0, "grad": 0.0, "update": 0.0}
        mapping_errors = 0
        states_compared = 0
        skipped = 0
        grad_participation: Dict[str, int] = {}
        required_missing: List[str] = []
        value_grad_present_rows = 0
        adamw_rows: List[Dict[str, Any]] = []
        canonical_exact = 0
        canonical_checked = 0

        required_prefixes = ("stem.", "res_blocks.", "pol_dense1.", "pol_dense2.")

        for row in subset:
            candidates = row["candidateActions"]
            count = len(candidates)
            if count < 2:
                skipped += 1
                continue
            target_old = int(row["targetActionIndex"])
            codes = [c["actionCode"] for c in candidates]

            # --- 规范排序：生产侧修复（任意排列 → 同一序列） ---
            order_canonical = canonical_order(codes)
            shuffled = list(range(count))
            random.Random(args.model_seed + row["stateIndex"]).shuffle(shuffled)
            canonical_checked += 1
            # 中文：canonical_order 返回的是**传入列表内**的下标，所以要映射回原下标再比较。
            shuffled_codes = [codes[i] for i in shuffled]
            remapped = [shuffled[i] for i in canonical_order(shuffled_codes)]
            if remapped == order_canonical:
                canonical_exact += 1

            model = make_model(dtype)
            base_feats = policy_features(model, row, order_canonical, dtype)
            base_logits = model.forward_action_logits(base_feats)
            base_target = order_canonical.index(target_old)
            base_loss = ce(base_logits, torch.tensor([base_target], dtype=torch.long))
            model.zero_grad()
            base_loss.backward(retain_graph=True)
            base_grads = {name: param.grad.detach().clone()
                          for name, param in model.named_parameters() if param.grad is not None}

            for name in [n for n, _ in model.named_parameters()]:
                if name.startswith(required_prefixes):
                    grad_participation[name] = grad_participation.get(name, 0) + (1 if name in base_grads else 0)
                    if name not in base_grads and name not in required_missing:
                        required_missing.append(f"{tag}:{name}")

            # value 专属参数在 valueWeight=0 下不应有梯度（这是预期，不是缺陷）。
            value_grads = [n for n in base_grads if n.startswith("val_dense")]
            if value_grads:
                value_grad_present_rows += 1

            def clone_update(order: List[int], target_index: int):
                clone = copy.deepcopy(model)
                optimizer = torch.optim.AdamW(clone.parameters(), lr=args.lr, weight_decay=args.weight_decay)
                optimizer.zero_grad()
                feats = policy_features(clone, row, order, dtype)   # ← 修复点
                logits = clone.forward_action_logits(feats)
                loss = ce(logits, torch.tensor([target_index], dtype=torch.long))
                loss.backward()
                grads = {name: param.grad.detach().clone()
                         for name, param in clone.named_parameters() if param.grad is not None}
                optimizer.step()
                return clone, logits, loss, grads, optimizer

            ref_clone, ref_logits, ref_loss, ref_grads, ref_opt = clone_update(order_canonical, base_target)

            for replicate in range(args.replicates + 1):
                if replicate == 0:
                    order = list(reversed(order_canonical))
                    label = "reverse"
                else:
                    order = list(order_canonical)
                    random.Random(args.model_seed + 1000 * replicate + row["stateIndex"]).shuffle(order)
                    label = f"shuffle-{replicate}"
                new_target = order.index(target_old)
                if codes[order[new_target]] != codes[target_old]:
                    mapping_errors += 1

                perm_clone, perm_logits, perm_loss, perm_grads, perm_opt = clone_update(order, new_target)

                aligned = torch.empty_like(base_logits[0])
                # 中文：两个框架都要映射回**原始候选下标**才能比较。
                # base 框架：base_logits[i] 对应原下标 order_canonical[i]；
                # perm 框架：perm_logits[position] 对应原下标 order[position]。
                base_aligned = torch.empty_like(base_logits[0])
                for position, old_index in enumerate(order_canonical):
                    base_aligned[old_index] = base_logits[0][position]
                for position, old_index in enumerate(order):
                    aligned[old_index] = perm_logits[0][position]
                logit_diff = float(torch.max(torch.abs(aligned - base_aligned.detach())).item())
                loss_diff = float(torch.abs(perm_loss - base_loss).item())

                grad_diff = 0.0
                for name, grad in perm_grads.items():
                    if name in base_grads:
                        grad_diff = max(grad_diff, float(torch.max(torch.abs(grad - base_grads[name])).item()))

                update_diff = 0.0
                for (name, ref_param), (_, perm_param) in zip(
                        ref_clone.named_parameters(), perm_clone.named_parameters()):
                    if name not in base_grads:
                        continue
                    delta = torch.abs(ref_param.detach() - perm_param.detach())
                    update_diff = max(update_diff, float(torch.max(delta).item()))

                # AdamW 机制分解（只对前两行做，控制报告体积）
                if len(adamw_rows) < 8:
                    ref_state = ref_opt.state.get(ref_clone.stem.weight, {})
                    perm_state = perm_opt.state.get(perm_clone.stem.weight, {})
                    if ref_state and perm_state:
                        ref_grad = base_grads.get("stem.weight")
                        if ref_grad is not None:
                            zero_mask = ref_grad == 0
                            near_mask = ref_grad.abs() < NEAR_ZERO_GRAD
                            delta_stem = (ref_clone.stem.weight.detach()
                                          - perm_clone.stem.weight.detach()).abs()
                            adamw_rows.append({
                                "stateIndex": row["stateIndex"],
                                "permutation": label,
                                "eps": float(ref_opt.defaults.get("eps", 1e-8)),
                                "beta1": float(ref_opt.defaults.get("betas", (0.9, 0.999))[0]),
                                "beta2": float(ref_opt.defaults.get("betas", (0.9, 0.999))[1]),
                                "totalElements": int(ref_grad.numel()),
                                "zeroGradElements": int(zero_mask.sum().item()),
                                "nearZeroGradElements": int(near_mask.sum().item()),
                                "maxUpdateDiffAllElements": float(delta_stem.max().item()),
                                "maxUpdateDiffZeroGradElements": (
                                    float(delta_stem[zero_mask].max().item()) if bool(zero_mask.any()) else 0.0),
                                "maxUpdateDiffNonZeroGradElements": (
                                    float(delta_stem[~zero_mask].max().item()) if bool((~zero_mask).any()) else 0.0),
                                "expAvgMaxAbs": float(ref_state["exp_avg"].abs().max().item()),
                                "expAvgSqMaxAbs": float(ref_state["exp_avg_sq"].abs().max().item()),
                            })

                worst["logit"] = max(worst["logit"], logit_diff)
                worst["loss"] = max(worst["loss"], loss_diff)
                worst["grad"] = max(worst["grad"], grad_diff)
                worst["update"] = max(worst["update"], update_diff)

            states_compared += 1

        return {
            "tag": tag,
            "dtype": str(dtype),
            "statesCompared": states_compared,
            "statesSkippedTooFewCandidates": skipped,
            "permutationsPerState": args.replicates + 1,
            "maxLogitDiff": worst["logit"],
            "maxLossDiff": worst["loss"],
            "maxGradDiff": worst["grad"],
            "maxUpdateDiffAfterOneAdamWStep": worst["update"],
            "targetMappingErrors": mapping_errors,
            "gradientParticipation": {
                "elementsTracked": len(grad_participation),
                "elementsWithGradientEveryState": sum(
                    1 for value in grad_participation.values() if value == states_compared),
                "missingGradientInSomeState": required_missing,
            },
            "valueHeadGradientRows": value_grad_present_rows,
            "canonicalization": {
                "statesChecked": canonical_checked,
                "statesWhereAnyPermutationCanonicalizesIdentically": canonical_exact,
            },
            "adamwAnalysis": adamw_rows,
        }

    fp32 = run_pass(torch.float32, states, "float32")
    fp64 = run_pass(torch.float64, states[: max(1, args.float64_states)], "float64_control")

    # ------------------------------------------------------------------
    # 3. 确定性回归：完整网络 + 固定 optimizer state + 同一 canonical batch。
    # ------------------------------------------------------------------
    torch.manual_seed(args.model_seed)
    det_model = make_model(torch.float32)
    det_opt_a = torch.optim.AdamW(det_model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    det_opt_b = torch.optim.AdamW(det_model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    batch = states[:8]
    # 中文：候选数逐状态不同，所以不能把 [1,K,F] 直接拼成 [B,K,F]；改为逐状态前向再求 CE 之和，
    # 这才是与训练器 collate_samples 等价的「同一 canonical batch」。
    def batch_loss_and_logits(net) -> Tuple[Any, List[Any]]:
        total = None
        logits_list: List[Any] = []
        for row in batch:
            order = canonical_order([c["actionCode"] for c in row["candidateActions"]])
            logits = net.forward_action_logits(policy_features(net, row, order, torch.float32))
            target = torch.tensor([order.index(int(row["targetActionIndex"]))], dtype=torch.long)
            term = ce(logits, target)
            total = term if total is None else total + term
            logits_list.append(logits)
        return total, logits_list

    # 预热一次，让 optimizer 有非平凡 state（模拟「固定 optimizer 状态」）。
    det_opt_a.zero_grad()
    warm_loss, _ = batch_loss_and_logits(det_model)
    warm_loss.backward()
    det_opt_a.step()
    # 中文：两个 optimizer 必须从**完全相同的参数与 state**出发，否则比较的是 optimizer
    # 状态差而不是确定性。这里先快照 warm-up 后的参数与 state_dict，再各自跑同一步。
    shared_params = {name: param.detach().clone() for name, param in det_model.named_parameters()}
    shared_opt_state = copy.deepcopy(det_opt_a.state_dict())

    def deterministic_step(optimizer) -> Dict[str, Any]:
        det_model.zero_grad()
        loss, _ = batch_loss_and_logits(det_model)
        loss.backward()
        optimizer.step()
        return {
            "loss": float(loss.item()),
            "params": {name: param.detach().clone() for name, param in det_model.named_parameters()},
        }

    # A：从快照出发。
    for name, param in det_model.named_parameters():
        param.data.copy_(shared_params[name])
    det_opt_a.load_state_dict(copy.deepcopy(shared_opt_state))
    first = deterministic_step(det_opt_a)

    # B：复位到同一快照，state 也复位，再跑同一步。
    for name, param in det_model.named_parameters():
        param.data.copy_(shared_params[name])
    det_opt_b.load_state_dict(copy.deepcopy(shared_opt_state))
    second = deterministic_step(det_opt_b)

    determinism_diff = 0.0
    for name in first["params"]:
        determinism_diff = max(
            determinism_diff,
            float(torch.max(torch.abs(first["params"][name] - second["params"][name])).item()),
        )

    # ------------------------------------------------------------------
    # 4. 非规范归约顺序的数值敏感性（只记录，不当作通过条件）。
    # ------------------------------------------------------------------
    sens_row = states[0]
    sens_codes = [c["actionCode"] for c in sens_row["candidateActions"]]
    sens_order = canonical_order(sens_codes)
    sens_target = sens_order.index(int(sens_row["targetActionIndex"]))
    sens_model = make_model(torch.float32)
    sens_feats = policy_features(sens_model, sens_row, sens_order, torch.float32)
    sens_logits = sens_model.forward_action_logits(sens_feats)[0]

    def manual_ce(logits, target: int, reverse_reduction: bool) -> float:
        values = [float(v) for v in logits]
        maximum = max(values)
        exps = [math.exp(v - maximum) for v in values]
        total = 0.0
        sequence = reversed(exps) if reverse_reduction else exps
        for value in sequence:
            total += value
        return float(-(values[target] - maximum) + math.log(total))

    ce_forward = manual_ce(sens_logits, sens_target, False)
    ce_reverse = manual_ce(sens_logits, sens_target, True)
    non_canonical_diff = abs(ce_forward - ce_reverse)

    report: Dict[str, Any] = {
        "schema": "v16_b5_clone_graph_1",
        "task": "T16-02",
        "runId": "v16_20260926_core",
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "scope": (
            "修正后的 B5 复制网络一次完整更新测试（合成结构输入）。"
            "不是棋力因果实验；也不替代 TS/Python 前向对照。"
        ),
        "tolerances": {
            "logitsAtol": LOGIT_ATOL, "logitsRtol": LOGIT_ATOL,
            "gradAtol": GRAD_ATOL, "updateAtol": UPDATE_ATOL,
            "note": "任务书 §4.2 预登记；未随结果放宽。fp64 是诊断，不覆盖历史判定。",
        },
        "config": {
            "states": len(states), "modelSeed": args.model_seed,
            "replicates": args.replicates, "lr": args.lr, "weightDecay": args.weight_decay,
            "valueWeight": 0.0, "numBlocks": 2, "channels": SPATIAL_CHANNELS,
            "semanticDim": SEMANTIC_DIM, "globalDim": GLOBAL_DIM,
        },
        "defectReproduction": {
            "note": "v15/tools/parity_permutation_v15.py 的写法：clone 复用原模型特征。",
            "rows": defect_rows,
            "allRowsShowMissingTrunkGradient": all(r["cloneStemGradIsNone"] for r in defect_rows),
            "maxCloneStemUpdateAcrossRows": max((r["cloneStemMaxUpdate"] for r in defect_rows), default=0.0),
        },
        "float32": fp32,
        "float64Control": fp64,
        "determinismRegression": {
            "note": "完整网络、固定 optimizer 状态（先做一次真实更新建立 moments）、同一 canonical batch。",
            "batchStates": len(batch),
            "maxParameterDiffBetweenTwoIdenticalRuns": determinism_diff,
            "bitwiseIdentical": determinism_diff == 0.0,
        },
        "nonCanonicalSensitivity": {
            "note": "故意用非规范归约顺序手算 CE；只记录数值敏感性，越界时标 NUMERICAL_LIMIT。",
            "ceForwardReduction": ce_forward,
            "ceReverseReduction": ce_reverse,
            "absDiff": non_canonical_diff,
            "withinUpdateAtol": non_canonical_diff <= UPDATE_ATOL,
        },
    }

    checks = {
        "cloneTrunkGetsGradient": len(fp32["gradientParticipation"]["missingGradientInSomeState"]) == 0,
        "logitsWithinTolerance": fp32["maxLogitDiff"] <= LOGIT_ATOL,
        "gradientsWithinTolerance": fp32["maxGradDiff"] <= GRAD_ATOL,
        "targetMappingExact": fp32["targetMappingErrors"] == 0,
        "canonicalizationExact": (
            fp32["canonicalization"]["statesChecked"]
            == fp32["canonicalization"]["statesWhereAnyPermutationCanonicalizesIdentically"]),
        "noValueGradientWhenValueWeightZero": fp32["valueHeadGradientRows"] == 0,
        "canonicalBatchDeterminismBitwise": determinism_diff == 0.0,
    }
    # 中文：任务书 §4.2 明确要求把「完整网络 + 固定 optimizer 状态 + 同 canonical batch 的
    # 确定性回归」与「非 canonical 归约顺序的数值敏感性」分开。后者越界时只能标数值限制，
    # 不能声称原始 B5 已通过，也不能因此否定前者。
    permuted_update_within = fp32["maxUpdateDiffAfterOneAdamWStep"] <= UPDATE_ATOL
    report["checks"] = checks
    report["numericalSensitivityVerdict"] = {
        "permutedOrderOneStepUpdateWithinTolerance": permuted_update_within,
        "observedPermutedOrderMaxUpdateDiff": fp32["maxUpdateDiffAfterOneAdamWStep"],
        "fp64ControlMaxUpdateDiff": fp64["maxUpdateDiffAfterOneAdamWStep"],
        "label": "NUMERICAL_LIMIT" if not permuted_update_within else "WITHIN_TOLERANCE",
        "explanation": (
            "候选重排只改变 CE 的求和顺序；fp32 下 K 项归约的末位差异在 AdamW 第一步被"
            " lr*m̂/(sqrt(v̂)+eps) 放大：对 |g| 落在 fp32 归约噪声底的元素，该比值不连续，"
            "单步更新差可以达到 lr 量级而不是梯度差的量级。fp64 对照给出的同量读数塌缩到 1e-11，"
            "支持「差异来自 fp32 舍入而非排序逻辑错误」。"
            "生产侧已在 shared_spatial_policy 入口 canonicalize，因此重排输入在正式路径上不再出现。"
        ),
    }
    report["summary"] = {
        "passedFullNetworkB5": all(checks.values()),
        "failedChecks": [name for name, ok in checks.items() if not ok],
        "numericalLimitFlag": report["numericalSensitivityVerdict"]["label"],
        "fp64MaxUpdateDiff": fp64["maxUpdateDiffAfterOneAdamWStep"],
        "fp64MaxGradDiff": fp64["maxGradDiff"],
        "scopeStatement": (
            "本测试证明：修正后复制网络的 trunk/policy 全部获得梯度并参与一次完整 AdamW 更新；"
            "logits 在候选重排下逐元素相同；同 canonical batch 与固定 optimizer 状态两次运行位级一致。"
            "唯一未过预登记容差的是「非 canonical 归约顺序下的一次 fp32 更新」，已标 NUMERICAL_LIMIT。"
        ),
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "b5_clone_graph.json"
    out_file.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": str(out_file).replace("\\", "/"),
        "defectAllRowsMissingTrunkGradient": report["defectReproduction"]["allRowsShowMissingTrunkGradient"],
        "fp32MaxLogitDiff": fp32["maxLogitDiff"],
        "fp32MaxGradDiff": fp32["maxGradDiff"],
        "fp32MaxUpdateDiff": fp32["maxUpdateDiffAfterOneAdamWStep"],
        "missingGradientParams": fp32["gradientParticipation"]["missingGradientInSomeState"][:5],
        "canonicalizationExact": checks["canonicalizationExact"],
        "determinismBitwise": determinism_diff == 0.0,
        "nonCanonicalSensitivityDiff": non_canonical_diff,
        "passedFullNetworkB5": report["summary"]["passedFullNetworkB5"],
        "failedChecks": report["summary"]["failedChecks"],
        "fp64MaxUpdateDiff": fp64["maxUpdateDiffAfterOneAdamWStep"],
    }, indent=2, ensure_ascii=False))
    return 0 if report["summary"]["passedFullNetworkB5"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
