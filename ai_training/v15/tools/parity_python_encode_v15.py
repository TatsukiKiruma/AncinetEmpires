"""V15/T15-05：Python 端 V15 编码适配器（独立于 TS 重新编码同一快照）。

为什么需要：
`python/verify_parity.py` 只消费 TS 已经编码好的输入，因此它单独无法证明
「TS 编码 → 训练/推理实际消费的张量」与「Python 侧按同一规则重算的张量」一致。
本模块用仓库既有的独立 Python 编码器 `python/v14_spatial_encoder.py` 重算状态张量、
全局特征与候选语义，只把**规则已变更的那一处**（攻击语义槽 15/17 的预计反击）
替换成 V15 口径：

    V15 = 完整引擎结算顺序：主动伤害 → 状态附加 → 攻击者经验/升级 → 反击资格 → 反击伤害

历史 V14 口径漏掉「攻击者本次攻击获得的经验/升级」这一步，升级边界下会高估反击
（V14b 审核 §2.2：经验 90 的 0 级士兵预测 25 / 引擎实际 22）。

约束：
- **不修改** `python/v14_spatial_encoder.py`；这里通过模块级函数替换注入 V15 口径。
- V15 口径的正确性由 T15-02 的 18 个受控夹具独立校验（见 `validate_against_golden`），
  不靠"看起来对"。校验不通过就报错，不静默使用。

用法（作为模块）：
    from parity_python_encode_v15 import load_tables, encode_state_v15, validate_against_golden
CLI：
    python v15/tools/parity_python_encode_v15.py --golden-inputs <...> --golden-outputs <...>
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

import v14_spatial_encoder as enc  # noqa: E402

# 与 src/game/abilities.ts 一致的战斗经验常量。
ATTACK_EXP = 30
KILL_EXP = 60
MAX_EXP = 99999


def get_exp_threshold_for_level(level: int) -> int:
    """对齐 abilities.ts:getExpThresholdForLevel（1=100、2=300、3=600…）。"""
    if level <= 0:
        return 0
    return ((level + 1) * 100 * level) // 2


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def add_exp(unit: Dict[str, Any], amount: int, level_cap: int, tables: "enc.TerrainTables") -> bool:
    """对齐 abilities.ts:addExp（含升级带来的 HP 成长）。"""
    if unit.get("level") is None:
        unit["level"] = 0
    if unit.get("exp") is None:
        unit["exp"] = 0
    unit["exp"] = _clamp(unit["exp"] + amount, 0, MAX_EXP)
    levels_gained = 0
    while unit["level"] < level_cap:
        next_level = unit["level"] + 1
        if unit["exp"] >= get_exp_threshold_for_level(next_level):
            unit["level"] = next_level
            levels_gained += 1
        else:
            break
    if levels_gained > 0:
        config = tables.unit_configs[unit["unitClass"]]
        hp_gain = config["maxHpGrowth"] * levels_gained
        if hp_gain != 0:
            unit["hp"] = _clamp(unit["hp"] + hp_gain, 1, 9999)
    return levels_gained > 0


def project_exp_outcome(
    unit: Dict[str, Any], amount: int, level_cap: int, tables: "enc.TerrainTables",
) -> Dict[str, Any] | None:
    """对齐 abilities.ts:projectExpOutcome（无副作用，返回升级后的读数或 None）。"""
    copied = copy.deepcopy(unit)
    before_level = copied.get("level") or 0
    before_hp = copied["hp"]
    add_exp(copied, amount, level_cap, tables)
    after_level = copied.get("level") or 0
    if after_level == before_level and copied["hp"] == before_hp:
        return None
    return {"level": after_level, "exp": copied.get("exp") or 0, "hp": copied["hp"]}


def estimate_counter_damage_v15(
    state: Dict[str, Any],
    attacker_id: str,
    defender_id: str,
    tables: "enc.TerrainTables",
) -> int:
    """V15 口径的预计反击：与 src/game/rules.ts:estimateCounterDamage 逐步对应。"""
    by_id = {u["id"]: u for u in state["units"]}
    attacker = by_id.get(attacker_id)
    target = by_id.get(defender_id)
    if attacker is None or target is None:
        return 0

    incoming = enc.calculate_damage(state, attacker_id, defender_id, tables)
    target_hp_after = target["hp"] - incoming
    if target_hp_after <= 0:
        return 0

    projected = copy.deepcopy(state)
    projected_attacker = next((u for u in projected["units"] if u["id"] == attacker_id), None)
    projected_target = next((u for u in projected["units"] if u["id"] == defender_id), None)
    if projected_attacker is None or projected_target is None:
        return 0
    projected_target["hp"] = target_hp_after
    enc._apply_combat_status_effects(attacker, projected_target, tables)

    rule_config = state.get("rules") or {}
    level_cap = int(rule_config.get("levelCap") if rule_config.get("levelCap") is not None else 3)
    outgoing_exp = KILL_EXP if target_hp_after <= 0 else ATTACK_EXP
    before_level = projected_attacker.get("level") or 0
    before_max_hp = projected_attacker.get("maxHp") if projected_attacker.get("maxHp") is not None else 100
    projection = project_exp_outcome(projected_attacker, outgoing_exp, level_cap, tables)
    if projection is not None:
        projected_attacker["level"] = projection["level"]
        projected_attacker["exp"] = projection["exp"]
        projected_attacker["hp"] = projection["hp"]
        levels_gained = projection["level"] - before_level
        if levels_gained > 0:
            growth = tables.unit_configs[projected_attacker["unitClass"]]["maxHpGrowth"]
            projected_attacker["maxHp"] = before_max_hp + growth * levels_gained

    if not enc.can_counter_attack(projected, attacker_id, defender_id, tables):
        return 0
    # 反击伤害的缩放基准是反击方（defender_id）受击后的剩余 HP。
    return enc.calculate_damage(projected, defender_id, attacker_id, tables,
                                attacker_hp_override=target_hp_after)


# 保留原函数引用：它是 V14 口径（无经验投影），用于历史口径对照。
_ORIGINAL_ESTIMATE_COUNTER_DAMAGE = enc.estimate_counter_damage


def estimate_counter_damage_v14(
    state: Dict[str, Any], attacker_id: str, defender_id: str, tables: "enc.TerrainTables",
) -> int:
    """V14 历史口径（未注入 V15 之前的实现），仅供对照，不作为当前语义。"""
    return _ORIGINAL_ESTIMATE_COUNTER_DAMAGE(state, attacker_id, defender_id, tables)


def install_v15_semantics() -> None:
    """把 V15 口径注入既有独立编码器（模块级替换，不修改其源码）。"""
    enc.estimate_counter_damage = estimate_counter_damage_v15


def load_tables(path: str | Path) -> "enc.TerrainTables":
    with open(path, "r", encoding="utf-8") as handle:
        return enc.TerrainTables.from_dict(json.load(handle))


def encode_state_v15(
    state: Dict[str, Any],
    player_id: int,
    actions: List[Dict[str, Any]],
    tables: "enc.TerrainTables",
) -> Dict[str, Any]:
    """返回 {spatialTensor, globalFeatures, candidates:[{semantics,...}]}（V15 语义）。"""
    install_v15_semantics()
    encoded = enc.encode_game_state_spatial(state, player_id, tables)
    candidates = []
    for action in actions:
        feature = enc.encode_candidate_action_spatial(state, player_id, action, tables)
        candidates.append(feature)
    return {
        "spatialTensor": list(encoded["spatialTensor"]),
        "globalFeatures": list(encoded["globalFeatures"]),
        "candidates": candidates,
    }


def validate_against_golden(golden_inputs: Path, golden_outputs: Path, tables: "enc.TerrainTables") -> Dict[str, Any]:
    """用 T15-02 的 18 个受控夹具校验 Python 端 V15 口径。"""
    install_v15_semantics()
    expectations: Dict[str, Any] = {}
    with golden_outputs.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                record = json.loads(line)
                expectations[record["caseId"]] = record

    cases: List[Dict[str, Any]] = []
    mismatches = 0
    for line in golden_inputs.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        case_id = record["caseId"]
        expected = expectations.get(case_id) or {}
        expected_v15 = (expected.get("encodedCounterByVariant") or {}).get("v15")
        expected_v14 = (expected.get("encodedCounterByVariant") or {}).get("v14")
        state = record["state"]
        player_id = state["currentPlayer"]
        action = _decode_action_code(record["actionCode"])
        if action is None:
            cases.append({"caseId": case_id, "error": f"无法解码动作码 {record['actionCode']}"})
            mismatches += 1
            continue
        py_v15 = estimate_counter_damage_v15(state, action["attackerId"], action["targetId"], tables)
        # V14 口径对照：原实现（不含经验投影）。
        py_v14 = estimate_counter_damage_v14(state, action["attackerId"], action["targetId"], tables)
        feature = enc.encode_candidate_action_spatial(state, player_id, action, tables)
        slot15 = round(feature["semantics"][15] * 100.0)
        ok = expected_v15 is None or py_v15 == expected_v15
        slot_ok = expected_v15 is None or slot15 == expected_v15
        if not (ok and slot_ok):
            mismatches += 1
        cases.append({
            "caseId": case_id,
            "actionCode": record["actionCode"],
            "expectedV15FromT15_02": expected_v15,
            "expectedV14FromT15_02": expected_v14,
            "engineCounterFromT15_02": expected.get("engineCounter"),
            "pythonV15Counter": py_v15,
            "pythonEncodedSlot15": slot15,
            "pythonV14Counter": py_v14,
            "matchV15": ok and slot_ok,
        })
    return {
        "cases": cases,
        "casesCompared": len(cases),
        "mismatches": mismatches,
        "passed": mismatches == 0 and len(cases) > 0,
    }


def _decode_action_code(code: str) -> Dict[str, Any] | None:
    """极小动作码解码（只覆盖本校验用到的 attack 码）。"""
    parts = code.split(":")
    if len(parts) == 3 and parts[0] == "attack":
        return {"type": "attack", "attackerId": parts[1], "targetId": parts[2]}
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--golden-inputs", default="v15/out/v15_20260925_core/T15-02/golden_inputs.jsonl")
    parser.add_argument("--golden-outputs", default="v15/out/v15_20260925_core/T15-02/golden_outputs.jsonl")
    parser.add_argument("--tables", default="v15/out/v15_20260925_core/T15-05/states/terrain_tables_v15.json")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    tables = load_tables(args.tables)
    report = validate_against_golden(Path(args.golden_inputs), Path(args.golden_outputs), tables)
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({
        "casesCompared": report["casesCompared"],
        "mismatches": report["mismatches"],
        "passed": report["passed"],
    }, indent=2))
    return 0 if report["passed"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
