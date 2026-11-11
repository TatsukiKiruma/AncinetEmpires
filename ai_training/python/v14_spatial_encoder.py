"""V14/T14-03：空间张量编码器的 Python 端实现（与 TS 端逐字段对齐）。

为什么需要它：
Python 训练器从不自己编码棋盘，它只读取 TS 写出的 `spatialTensor` / `candidateActions`。
因此历史 `python_ts_parity.json` 只能证明“同一个 TS 转换器两次输出一致”，
无法证明“推理时的编码与训练时载入的特征语义相同”。本模块把 TS 端
`src/game/ai/spatial_tensor_encoder.ts` 的编码过程独立实现一遍，
由 `python/tests/test_v14_encoder_parity.py` 用同一批状态做逐数值比对。

对齐范围（必须与 TS 一致，改动任何一侧都要同步）：
- 24 通道空间张量：地形/防御/归属/单位/威胁圈；
- 20 维全局标量（v2）；
- 32 维候选动作语义（v2），含槽 15「预计反击」使用与引擎共用的规则判定。

输入：TS 导出的 fixture JSON（含 terrainTables、states、cases），
不直接读取仓库源码，避免在 Python 里再维护一份规则常量。
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any

SPATIAL_TENSOR_CHANNELS = 26
#: V19/T19-01：新增 8 个通道（26..33），与 TS `SPATIAL_TENSOR_CHANNELS_V19` 一致。
SPATIAL_TENSOR_CHANNELS_V19 = 34
SPATIAL_TENSOR_CHANNELS_LEGACY = 24
SPATIAL_TENSOR_MAX_H = 20
SPATIAL_TENSOR_MAX_W = 20


def unit_class_index(unit_class: str) -> int:
    """对齐 TS `unitClassIndex`：未知兵种返回 0。

    使用本文件下方（历史既有）的 `ACTION_UNIT_CLASS_LIST`，其顺序必须与 TS 完全一致。
    """
    try:
        return ACTION_UNIT_CLASS_LIST.index(unit_class)
    except ValueError:
        return 0


GLOBAL_FEATURE_DIM_V2 = 20
ACTION_SEMANTIC_DIM_V2 = 32
# V14：48 = 32 维基础语义 + 槽 14..34 的 21 维兵种 one-hot（招募候选必须能区分兵种）。
ACTION_SEMANTIC_DIM_V3 = 53
ACTION_UNIT_CLASS_LIST = [
    "soldier", "ghost", "mermaid", "archer", "slime", "water_elemental", "dark_mage", "witch",
    "paladin", "elf", "berserker", "wolf", "golem", "ice_elemental", "druid", "catapult",
    "wolf_archer", "dragon", "commander", "skeleton", "crystal",
]
ACTION_UNIT_CLASS_SLOT_START = 32
#: 兵种 one-hot / 身份索引的维度，来自上面的 ACTION_UNIT_CLASS_LIST。
ACTION_UNIT_CLASS_DIM = len(ACTION_UNIT_CLASS_LIST)
#: 战斗经验常量，与 src/game/abilities.ts 一致（普攻 30 / 击杀 60）。
ATTACK_EXP = 30
KILL_EXP = 60

ACTION_TYPE_LIST = [
    "move", "attack", "capture", "repair", "wait",
    "recruit_to_castle", "recruit_and_deploy", "heal", "summon",
    "support", "destroy_town", "post_attack_move", "surrender", "end_turn",
]

# 与 src/game/terrain.ts 的 TERRAIN_CONFIG 相同；随 fixture 一起导出以便核对。
DEFAULT_TERRAIN_CONFIG: dict[int, dict[str, Any]] = {}


@dataclass
class TerrainTables:
    """TS 导出的地形/兵种常量表，保证两侧使用同一份数字。"""

    terrain_config: dict[int, dict[str, Any]]
    unit_configs: dict[str, dict[str, Any]]
    unit_classes: list[str]
    apk_terrain_configs: dict[int, dict[str, Any]]
    skirmish_apk_to_project: dict[int, int]

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "TerrainTables":
        return TerrainTables(
            terrain_config={int(k): v for k, v in data["terrainConfig"].items()},
            unit_configs=data["unitConfigs"],
            unit_classes=list(data["unitClasses"]),
            apk_terrain_configs={int(k): v for k, v in data["apkTerrainConfigs"].items()},
            skirmish_apk_to_project={int(k): int(v) for k, v in data["skirmishApkToProject"].items()},
        )


def _tile_terrain_id(tile: dict[str, Any], tables: TerrainTables) -> int:
    """对齐 src/game/terrain_rules.ts:getTileTerrainIdForRules。"""
    apk_id = tile.get("apkTerrainId")
    if apk_id is not None:
        mapped = tables.skirmish_apk_to_project.get(int(apk_id))
        if mapped is not None:
            return int(mapped)
        return int(tile["terrainId"])
    return int(tile["terrainId"])


def _tile_terrain_config(tile: dict[str, Any], tables: TerrainTables) -> dict[str, Any]:
    return tables.terrain_config[_tile_terrain_id(tile, tables)]


def _apk_config(tile: dict[str, Any], tables: TerrainTables) -> dict[str, Any] | None:
    apk_id = tile.get("apkTerrainId")
    if apk_id is None:
        return None
    return tables.apk_terrain_configs.get(int(apk_id))


def _apk_terrain_value(tile: dict[str, Any], field: str, tables: TerrainTables) -> Any:
    """对齐 terrain_rules.ts:getApkTerrainValue —— 有 APK 元数据时优先使用 data.bin 数值。"""
    config = _apk_config(tile, tables)
    if config is None:
        return None
    return config.get(field)


def _tile_defense_bonus(tile: dict[str, Any], tables: TerrainTables) -> float:
    """对齐 terrain_rules.ts:getTileDefenseBonus（APK 数值优先，回落项目表）。"""
    value = _apk_terrain_value(tile, "defenseBonus", tables)
    if value is not None:
        return float(value)
    return float(_tile_terrain_config(tile, tables).get("defenseBonus") or 0)


def _terrain_has_tag(tile: dict[str, Any], tag: str, tables: TerrainTables) -> bool:
    """对齐 abilities.ts:terrainHasTag —— 有 APK 元数据时按 isLand/kind 判定。"""
    config = _apk_config(tile, tables)
    if config is not None:
        apk_is_land = tile.get("apkTerrainIsLand")
        if apk_is_land is None:
            flag_a = config.get("flagA")
            apk_is_land = None if flag_a is None else bool(flag_a != 0)
        apk_kind = tile.get("apkTerrainKind")
        if apk_kind is None:
            apk_kind = config.get("kind")
        if tag == "water" and apk_is_land is not None:
            return not apk_is_land
        if tag == "land" and apk_is_land is not None:
            return bool(apk_is_land)
        if tag == "forest" and apk_kind == 2:
            return True
        if tag == "mountain" and apk_kind == 1:
            return True
    return tag in (_tile_terrain_config(tile, tables).get("tags") or [])


def _categorize_unit_class(unit_class: str) -> int:
    """对齐 TS categorizeUnitClass：按兵种归入 7 类。"""
    infantry = {"soldier", "skeleton"}
    ranged = {"archer", "wolf_archer"}
    flying = {"ghost", "dragon"}
    cavalry = {"wolf", "berserker"}
    caster = {"dark_mage", "witch", "druid"}
    heavy = {"catapult", "golem"}
    if unit_class in infantry:
        return 1
    if unit_class in ranged:
        return 2
    if unit_class in flying:
        return 3
    if unit_class in cavalry:
        return 4
    if unit_class in caster:
        return 5
    if unit_class in heavy:
        return 6
    if unit_class == "commander":
        return 7
    return 1


def _effective_stats(unit: dict[str, Any], tables: TerrainTables) -> dict[str, float]:
    """对齐 src/game/abilities.ts:getEffectiveStats（仅项目侧规则，无 APK 覆盖）。"""
    base = tables.unit_configs[unit["unitClass"]]
    level = unit.get("level") or 0
    attack_bonus = base["attackGrowth"] * level
    def_bonus = base["defenseGrowth"] * level
    max_hp_bonus = base["maxHpGrowth"] * level
    move_bonus = base["moveGrowth"] * level

    p_def = base["physicalDefense"] + def_bonus
    m_def = base["magicDefense"] + def_bonus
    max_hp = (unit.get("maxHp") if unit.get("maxHp") is not None else 100) + max_hp_bonus
    move = base["move"] + move_bonus

    status = unit.get("status")
    status_type = status.get("type") if isinstance(status, dict) else None
    if status_type == "weakened":
        p_def -= 10
        m_def -= 10
        move = 1

    min_range = base["minRange"]
    max_range = base["maxRange"]
    if status_type == "blinded":
        min_range = 0
        max_range = 0

    return {
        "attack": base["attack"] + attack_bonus,
        "physicalDefense": p_def,
        "magicDefense": m_def,
        "maxHp": max_hp,
        "move": move,
        "minRange": min_range,
        "maxRange": max_range,
    }


def _has_ability(unit: dict[str, Any], ability: str, tables: TerrainTables) -> bool:
    return ability in tables.unit_configs[unit["unitClass"]]["abilities"]


def _alliance_id(state: dict[str, Any], player_id: int) -> int:
    alliances = (state.get("rules") or {}).get("alliances") or {}
    value = alliances.get(str(player_id), alliances.get(player_id))
    return int(value) if value is not None else int(player_id)


def _are_enemy_players(state: dict[str, Any], a: int, b: int) -> bool:
    if a == b:
        return False
    disabled = {int(x) for x in ((state.get("rules") or {}).get("disabledTeams") or [])}
    if a in disabled or b in disabled:
        return False
    return _alliance_id(state, a) != _alliance_id(state, b)


def _get_distance(a: dict[str, int], b: dict[str, int]) -> int:
    return abs(a["x"] - b["x"]) + abs(a["y"] - b["y"])


def calc_army_value(state: dict[str, Any], player_id: int, tables: TerrainTables) -> float:
    """对齐 src/game/env.ts:calculateArmyValue：金币 + Σ(单位造价 * hp/maxHp + 1)。"""
    player = next((p for p in state["players"] if p["id"] == player_id), None)
    gold_value = float((player or {}).get("gold", 0))
    unit_value = 0.0
    for unit in state["units"]:
        if unit["ownerId"] != player_id or unit["hp"] <= 0:
            continue
        configured = _get_unit_cost(state, player_id, unit["unitClass"], tables)
        base_cost = configured if configured is not None else (tables.unit_configs[unit["unitClass"]].get("cost") or 0)
        stats = _effective_stats(unit, tables)
        hp_ratio = max(0.0, float(unit["hp"])) / max(1.0, float(stats["maxHp"]))
        unit_value += float(base_cost) * hp_ratio + 1.0
    return gold_value + unit_value


def _get_unit_cost(state: dict[str, Any], player_id: int, unit_class: str, tables: TerrainTables) -> float | None:
    rules = state.get("rules") or {}
    prices = rules.get("prices") or {}
    override = prices.get(unit_class)
    if unit_class == "commander":
        base_cost = rules.get("commanderRecruitBaseCost")
        if override is None and base_cost is None:
            return None
        price = override if override is not None else base_cost
        if price is None:
            return None
        death_count = 0
        for player in state["players"]:
            if player["id"] == player_id:
                death_count = player.get("commanderDeathCount") or 0
        growth = rules.get("commanderRecruitCostGrowth")
        growth = 100 if growth is None else growth
        return float(price) + death_count * float(growth)
    if override is not None:
        return float(override)
    cost = tables.unit_configs[unit_class].get("cost")
    return None if cost is None else float(cost)


def _is_commander_unit(state: dict[str, Any], unit: dict[str, Any]) -> bool:
    rules = state.get("rules") or {}
    commander_ids = rules.get("commanderUnitIds") or {}
    specified = commander_ids.get(str(unit["ownerId"]), commander_ids.get(unit["ownerId"]))
    if specified is not None:
        return unit["id"] == specified
    return unit["unitClass"] == "commander"


def encode_game_state_spatial(state: dict[str, Any], player_id: int, tables: TerrainTables,
                              channels: int = SPATIAL_TENSOR_CHANNELS) -> dict[str, Any]:
    """对齐 TS encodeGameStateSpatial（v2）。返回 spatialTensor / globalFeatures。

    `channels` 支持 26（v14/v15 语义）与 34（V19 语义）。26 通道时新通道一律不写，
    因此历史张量逐位不变。
    """
    h = SPATIAL_TENSOR_MAX_H
    w = SPATIAL_TENSOR_MAX_W
    c = channels
    if c not in (SPATIAL_TENSOR_CHANNELS, SPATIAL_TENSOR_CHANNELS_V19, SPATIAL_TENSOR_CHANNELS_LEGACY):
        raise ValueError(f"不支持的通道数 {c}")
    write_v19 = c >= SPATIAL_TENSOR_CHANNELS_V19
    tensor = [0.0] * (c * h * w)
    map_w = state["map"]["width"]
    map_h = state["map"]["height"]
    alliance = _alliance_id(state, player_id)

    def set_channel(ch: int, y: int, x: int, val: float) -> None:
        if y < 0 or y >= h or x < 0 or x >= w:
            return
        tensor[ch * (h * w) + y * w + x] = val

    for y in range(min(map_h, h)):
        for x in range(min(map_w, w)):
            tile = state["map"]["tiles"][y][x]
            set_channel(23, y, x, 1.0)
            cfg = _tile_terrain_config(tile, tables)
            key = cfg["key"]
            def_bonus = (cfg.get("defenseBonus") or 0) / 40.0
            set_channel(7, y, x, def_bonus)
            if key in ("road", "bridge", "snow"):
                set_channel(0, y, x, 1.0)
            elif key == "forest":
                set_channel(1, y, x, 1.0)
            elif key in ("mountain", "hill"):
                set_channel(2, y, x, 1.0)
            elif key in ("deep_water", "water_temple"):
                set_channel(3, y, x, 1.0)
            elif key == "castle":
                set_channel(4, y, x, 1.0)
            elif key in ("town", "damaged_town"):
                set_channel(5, y, x, 1.0)
            else:
                set_channel(6, y, x, 1.0)

            owner = tile.get("ownerId")
            if owner is not None:
                if _alliance_id(state, int(owner)) == alliance:
                    set_channel(8, y, x, 1.0)
                elif _are_enemy_players(state, player_id, int(owner)):
                    set_channel(9, y, x, 1.0)
            elif key in ("town", "castle", "damaged_town"):
                set_channel(10, y, x, 1.0)

    alive = [u for u in state["units"] if u["hp"] > 0]
    own_units = [u for u in alive if _alliance_id(state, u["ownerId"]) == alliance]
    enemy_units = [u for u in alive if _are_enemy_players(state, player_id, u["ownerId"])]

    for unit in own_units:
        x, y = unit["pos"]["x"], unit["pos"]["y"]
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        set_channel(11, y, x, 1.0)
        set_channel(12, y, x, max(0.0, min(1.0, unit["hp"] / max(1, unit["maxHp"]))))
        set_channel(13, y, x, 0.0 if unit.get("hasActed") else 1.0)
        set_channel(14, y, x, _categorize_unit_class(unit["unitClass"]) / 7.0)
        stats = _effective_stats(unit, tables)
        set_channel(15, y, x, (stats["minRange"] if stats["minRange"] is not None else 1) / 5.0)
        set_channel(16, y, x, (stats["maxRange"] if stats["maxRange"] is not None else 1) / 5.0)
        set_channel(17, y, x, 1.0 if _is_commander_unit(state, unit) else 0.0)
        # V14 新增通道（与 TS 端逐位对齐）：本回合是否已移动 + 有效攻击力归一化。
        set_channel(24, y, x, 1.0 if unit.get("hasMoved") else 0.0)
        set_channel(25, y, x, max(0.0, min(1.0, stats["attack"] / 200.0)))
        # V19 新增通道：己方兵种身份、剩余移动力、有效物防。
        if write_v19:
            set_channel(27, y, x, unit_class_index(unit["unitClass"]) / ACTION_UNIT_CLASS_DIM)
            set_channel(32, y, x, 0.0 if unit.get("hasMoved")
                        else max(0.0, min(1.0, (stats["move"] or 0) / 8.0)))
            set_channel(33, y, x, stats["physicalDefense"] / 60.0)

    for unit in enemy_units:
        x, y = unit["pos"]["x"], unit["pos"]["y"]
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        set_channel(18, y, x, 1.0)
        set_channel(19, y, x, max(0.0, min(1.0, unit["hp"] / max(1, unit["maxHp"]))))
        set_channel(20, y, x, _categorize_unit_class(unit["unitClass"]) / 7.0)
        set_channel(22, y, x, 1.0 if _is_commander_unit(state, unit) else 0.0)
        stats = _effective_stats(unit, tables)
        max_r = stats["maxRange"] if stats["maxRange"] is not None else 1
        move = 0 if unit.get("hasMoved") else (stats["move"] if stats["move"] is not None else 4)
        threat_dist = int(move + max_r)
        for dy in range(-threat_dist, threat_dist + 1):
            for dx in range(-threat_dist, threat_dist + 1):
                tx, ty = x + dx, y + dy
                dist = abs(dx) + abs(dy)
                if 0 <= tx < map_w and 0 <= ty < map_h and dist <= threat_dist:
                    set_channel(21, ty, tx, 1.0)
        if write_v19:
            # V19：敌军身份与战斗数值（修复「同粗分类不同兵种输入碰撞」）。
            set_channel(26, y, x, unit_class_index(unit["unitClass"]) / ACTION_UNIT_CLASS_DIM)
            set_channel(28, y, x, stats["physicalDefense"] / 60.0)
            set_channel(29, y, x, stats["magicDefense"] / 60.0)
            set_channel(30, y, x, max(0.0, min(1.0, stats["attack"] / 200.0)))
            # V19：**下一敌方行动阶段**威胁，显式忽略当前 hasMoved/hasActed
            # （敌军下次开始回合会重置这两个标记）。与 TS 端同一口径。
            next_turn_threat = int((stats["move"] if stats["move"] is not None else 4) + max_r)
            for dy in range(-next_turn_threat, next_turn_threat + 1):
                for dx in range(-next_turn_threat, next_turn_threat + 1):
                    tx, ty = x + dx, y + dy
                    dist = abs(dx) + abs(dy)
                    if 0 <= tx < map_w and 0 <= ty < map_h and dist <= next_turn_threat:
                        set_channel(31, ty, tx, 1.0)

    globals_vec = [0.0] * GLOBAL_FEATURE_DIM_V2
    enemies = [p for p in state["players"] if p["id"] != player_id and _are_enemy_players(state, player_id, p["id"])]
    own_player = next((p for p in state["players"] if p["id"] == player_id), None)
    own_gold = (own_player or {}).get("gold", 0)
    best_enemy_gold = max((p.get("gold", 0) for p in enemies), default=0)
    own_army = calc_army_value(state, player_id, tables)
    enemy_army = max((calc_army_value(state, p["id"], tables) for p in enemies), default=0.0)

    all_tiles = [tile for row in state["map"]["tiles"] for tile in row]

    def town_count(predicate) -> int:
        total = 0
        for tile in all_tiles:
            key = _tile_terrain_config(tile, tables)["key"]
            if key in ("town", "castle") and predicate(tile):
                total += 1
        return total

    own_towns = town_count(lambda t: t.get("ownerId") is not None and _alliance_id(state, int(t["ownerId"])) == alliance)
    enemy_towns = town_count(lambda t: t.get("ownerId") is not None and _are_enemy_players(state, player_id, int(t["ownerId"])))
    neutral_towns = town_count(lambda t: t.get("ownerId") is None)

    globals_vec[0] = state["turn"] / 50.0
    globals_vec[1] = own_gold / 1000.0
    globals_vec[2] = best_enemy_gold / 1000.0
    globals_vec[3] = (own_gold - best_enemy_gold) / 1000.0
    globals_vec[4] = len(own_units) / 10.0
    globals_vec[5] = len(enemy_units) / 10.0
    globals_vec[6] = own_army / 1000.0
    globals_vec[7] = enemy_army / 1000.0
    globals_vec[8] = own_towns / 10.0
    globals_vec[9] = enemy_towns / 10.0
    globals_vec[10] = neutral_towns / 10.0
    globals_vec[11] = 1.0 if any(_is_commander_unit(state, u) for u in own_units) else 0.0
    globals_vec[12] = 1.0 if any(_is_commander_unit(state, u) for u in enemy_units) else 0.0
    globals_vec[13] = 1.0 if state.get("pendingUnitId") else 0.0
    globals_vec[14] = map_w / 20.0
    globals_vec[15] = map_h / 20.0

    comm_cost = _get_unit_cost(state, player_id, "commander", tables)
    death_count = (own_player or {}).get("commanderDeathCount") or 0
    globals_vec[16] = min(1.0, death_count / 5.0)
    globals_vec[17] = min(1.0, comm_cost / 1000.0) if comm_cost is not None else 0.0
    globals_vec[18] = (
        min(1.0, max(0.0, comm_cost - own_gold) / 1000.0) if comm_cost is not None else 0.0
    )

    unoccupied_castles = 0
    for y in range(map_h):
        for x in range(map_w):
            tile = state["map"]["tiles"][y][x]
            if _tile_terrain_config(tile, tables)["key"] != "castle":
                continue
            owner = tile.get("ownerId")
            if owner is None or _alliance_id(state, int(owner)) != alliance:
                continue
            occupied = any(u["hp"] > 0 and u["pos"]["x"] == x and u["pos"]["y"] == y for u in state["units"])
            if not occupied:
                unoccupied_castles += 1
    globals_vec[19] = min(1.0, unoccupied_castles / 5.0)

    return {
        "spatialTensor": tensor,
        "globalFeatures": globals_vec,
        "mapWidth": map_w,
        "mapHeight": map_h,
    }


# --- 动作语义：与 tools/skirmish_action_semantics.ts + rules.ts 对齐 -----------------

def _unit_pos(units_by_id: dict[str, dict[str, Any]], unit_id: str | None) -> dict[str, int] | None:
    if not unit_id:
        return None
    unit = units_by_id.get(unit_id)
    if not unit or unit["hp"] <= 0:
        return None
    return {"x": unit["pos"]["x"], "y": unit["pos"]["y"]}


def action_coords(
    action: dict[str, Any],
    units_by_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, int] | None, dict[str, int] | None, dict[str, int] | None]:
    """返回 (actorCoord, landingCoord, targetCoord)，与 TS encodeCandidateActionSpatial 一致。"""
    action_type = action["type"]
    if action_type in ("move", "post_attack_move"):
        actor = _unit_pos(units_by_id, action["unitId"])
        return actor, dict(action["to"]), dict(action["to"])
    if action_type == "attack":
        actor = _unit_pos(units_by_id, action["attackerId"])
        target = _unit_pos(units_by_id, action["targetId"])
        return actor, None, target
    if action_type == "heal":
        actor = _unit_pos(units_by_id, action["healerId"])
        target = _unit_pos(units_by_id, action["targetId"])
        return actor, None, target
    if action_type == "support":
        actor = _unit_pos(units_by_id, action["supporterId"])
        target = _unit_pos(units_by_id, action["targetId"])
        return actor, None, target
    if action_type == "capture":
        actor = _unit_pos(units_by_id, action["unitId"])
        return actor, None, actor
    if action_type == "repair":
        actor = _unit_pos(units_by_id, action["unitId"])
        return actor, None, actor
    if action_type == "wait":
        actor = _unit_pos(units_by_id, action["unitId"])
        return actor, None, actor
    if action_type == "destroy_town":
        actor = _unit_pos(units_by_id, action["unitId"])
        target = action.get("target")
        return actor, None, dict(target) if target else actor
    if action_type == "summon":
        actor = _unit_pos(units_by_id, action["summonerId"])
        spawn = dict(action["spawnPos"])
        return actor, spawn, spawn
    if action_type == "recruit_to_castle":
        castle = dict(action["castlePos"])
        return castle, castle, castle
    if action_type == "recruit_and_deploy":
        castle = dict(action["castlePos"])
        to = dict(action["to"])
        return castle, to, to
    return None, None, None


def _distance(a: dict[str, int], b: dict[str, int]) -> int:
    return abs(a["x"] - b["x"]) + abs(a["y"] - b["y"])


def calculate_damage(
    state: dict[str, Any],
    attacker_id: str,
    defender_id: str,
    tables: TerrainTables,
    attacker_hp_override: float | None = None,
) -> int:
    """对齐 src/game/rules.ts:calculateDamage（含 calculateDamageAtHp 的 HP 覆盖入口）。"""
    by_id = {u["id"]: u for u in state["units"]}
    attacker = by_id.get(attacker_id)
    defender = by_id.get(defender_id)
    if attacker is None or defender is None:
        return 0
    eff_atk = _effective_stats(attacker, tables)
    eff_def = _effective_stats(defender, tables)
    rules = state.get("rules") or {}
    atk_stats = tables.unit_configs[attacker["unitClass"]]
    def_tile = state["map"]["tiles"][defender["pos"]["y"]][defender["pos"]["x"]]
    def_terrain = _tile_terrain_config(def_tile, tables)
    dist = _distance(attacker["pos"], defender["pos"])

    def rule_value(key: str, default: float) -> float:
        value = rules.get(key)
        return float(default if value is None else value)

    extra_attack = 0.0
    if _has_ability(attacker, "sharpshooter", tables) and _has_ability(defender, "flying", tables):
        extra_attack += rule_value("sharpshooterAttackBonus", 10)
    if _has_ability(attacker, "destroyer", tables) and def_terrain["key"] == "town":
        extra_attack += rule_value("destroyerAttackBonus", 10)
    flying_water = _has_ability(attacker, "flying", tables) and _terrain_has_tag(def_tile, "water", tables) \
        and not _has_ability(defender, "flying", tables)
    if flying_water:
        extra_attack += rule_value("flyingWaterAttackBonus", 10)
    defender_status = (defender.get("status") or {}).get("type")
    if _has_ability(attacker, "death_reaper", tables) and defender_status in ("poisoned", "blinded", "weakened"):
        extra_attack += rule_value("deathReaperAttackBonus", 20)

    def_bonus = 0.0 if _has_ability(defender, "flying", tables) else _tile_defense_bonus(def_tile, tables)

    ability_atk_bonus = 0.0
    atk_tile = state["map"]["tiles"][attacker["pos"]["y"]][attacker["pos"]["x"]]
    atk_terrain = _tile_terrain_config(atk_tile, tables)
    terrain_child_bonus = rule_value("terrainChildCombatBonus", 10)
    for ability, key in (("water_child", "water"), ("forest_child", "forest"), ("mountain_child", "mountain")):
        if _has_ability(attacker, ability, tables) and _terrain_has_tag(atk_tile, key, tables):
            ability_atk_bonus += terrain_child_bonus
    ability_def_bonus = 0.0
    for ability, key in (("water_child", "water"), ("forest_child", "forest"), ("mountain_child", "mountain")):
        if _has_ability(defender, ability, tables) and _terrain_has_tag(def_tile, key, tables):
            ability_def_bonus += terrain_child_bonus

    attacker_status = (attacker.get("status") or {}).get("type")
    inspired_bonus = 0.0
    if attacker_status == "inspired":
        inspired_rule = rule_value("inspiredAttackBonus", 10)
        inspired_bonus = math.trunc(inspired_rule / 2) if dist > 1 else inspired_rule

    is_magic = atk_stats["attackType"] == "magic"
    weakened_penalty = math.trunc(rule_value("weakenedDefensePenalty", 10) / 2) if dist > 1 \
        else rule_value("weakenedDefensePenalty", 10)
    weakened_adjust = 10 - weakened_penalty if defender_status == "weakened" else 0
    actual_def = (eff_def["magicDefense"] if is_magic else eff_def["physicalDefense"]) + weakened_adjust

    raw_damage = max(
        0.0,
        (eff_atk["attack"] + ability_atk_bonus + extra_attack + inspired_bonus)
        - (actual_def + def_bonus + ability_def_bonus),
    )
    is_fighting_spirit = _has_ability(attacker, "fighting_spirit", tables)
    hp_for_scaling = attacker["hp"] if attacker_hp_override is None else attacker_hp_override
    final_damage = raw_damage if is_fighting_spirit else math.trunc((raw_damage * hp_for_scaling) / eff_atk["maxHp"])

    multiplier = 1.0
    if _has_ability(attacker, "melee_master", tables) and not _has_ability(defender, "melee_master", tables) \
            and dist == 1:
        multiplier *= 1.5
    if _has_ability(defender, "ranged_defense", tables) and dist > 1:
        multiplier *= 0.5
    final_damage = math.floor(final_damage * multiplier)
    return int(max(0, final_damage))


def _in_range(a: dict[str, int], b: dict[str, int], min_range: float, max_range: float) -> bool:
    dist = _distance(a, b)
    return dist >= min_range and dist <= max_range


def can_counter_attack(state: dict[str, Any], attacker_id: str, defender_id: str, tables: TerrainTables) -> bool:
    by_id = {u["id"]: u for u in state["units"]}
    attacker = by_id.get(attacker_id)
    target = by_id.get(defender_id)
    if attacker is None or target is None:
        return False
    if target["hp"] <= 0:
        return False
    target_stats = _effective_stats(target, tables)
    distance = _distance(target["pos"], attacker["pos"])
    is_counter_storm = _has_ability(target, "counter_storm", tables) and distance <= 2
    can_normal = distance == 1 and _in_range(
        target["pos"], attacker["pos"], target_stats["minRange"], target_stats["maxRange"],
    )
    return bool(is_counter_storm or can_normal)


def estimate_counter_damage(state: dict[str, Any], attacker_id: str, defender_id: str,
                            tables: TerrainTables, project_exp: bool = False) -> int:
    """预计反击伤害。

    `project_exp=False` 复现 **V14 历史口径**（不投影攻击者本次攻击获得的经验/升级）。
    `project_exp=True` 复现 **V15/V19 当前口径**：引擎在 attack 分支里先给攻击者 addExp，
    然后才结算反击，因此反击伤害必须在「已升级」的攻击者身上计算。

    中文（本轮实测发现）：Python 侧长期只实现了 V14 口径，于是 V19 的 53 维动作语义在
    槽 15/17 上与 TS 差 1.0 量级。这不是「容差问题」，而是**语义版本不一致**，
    必须显式区分，不能靠放宽容差掩盖。
    """
    by_id = {u["id"]: u for u in state["units"]}
    attacker = by_id.get(attacker_id)
    target = by_id.get(defender_id)
    if attacker is None or target is None:
        return 0
    incoming = calculate_damage(state, attacker_id, defender_id, tables)
    target_hp_after = target["hp"] - incoming
    if target_hp_after <= 0:
        return 0
    # 与 TS 端一致：引擎在反击判定之前就施加本次攻击的状态效果，致盲会把目标射程归零，
    # 从而阻止普通反击。这里在投影副本上重放同一套状态附加规则，再判定反击资格。
    import copy as _copy
    projected = _copy.deepcopy(state)
    projected_attacker = next((u for u in projected["units"] if u["id"] == attacker_id), None)
    projected_target = next((u for u in projected["units"] if u["id"] == defender_id), None)
    if projected_target is None or projected_attacker is None:
        return 0
    projected_target["hp"] = target_hp_after
    _apply_combat_status_effects(attacker, projected_target, tables)

    if project_exp:
        # V15/T15-02：把攻击者本次攻击获得的经验投影上去（普攻 30 / 击杀 60），
        # 与 src/game/abilities.ts 的 addExp + projectExpOutcome 同一口径。
        outgoing_exp = KILL_EXP if target_hp_after <= 0 else ATTACK_EXP
        _project_exp_outcome(projected_attacker, outgoing_exp, tables)

    if not can_counter_attack(projected, attacker_id, defender_id, tables):
        return 0
    return calculate_damage(projected, defender_id, attacker_id, tables, attacker_hp_override=target_hp_after)


def _exp_threshold_for_level(level: int) -> int:
    """对齐 TS `getExpThresholdForLevel`：1→100、2→300、3→600、9→4500。"""
    if level <= 0:
        return 0
    return ((level + 1) * 100 * level) // 2


def _project_exp_outcome(unit: dict[str, Any], amount: int, tables: TerrainTables,
                         level_cap: int = 3) -> None:
    """就地投影一次 addExp 的结果（等级、经验、HP、最大 HP），对齐 TS `projectExpOutcome`。"""
    unit["level"] = unit.get("level") or 0
    unit["exp"] = min(99999, max(0, (unit.get("exp") or 0) + amount))
    levels_gained = 0
    while unit["level"] < level_cap:
        next_level = unit["level"] + 1
        if unit["exp"] >= _exp_threshold_for_level(next_level):
            unit["level"] = next_level
            levels_gained += 1
        else:
            break
    if levels_gained > 0:
        base = tables.unit_configs[unit["unitClass"]]
        hp_gain = base["maxHpGrowth"] * levels_gained
        if hp_gain != 0:
            unit["hp"] = max(1, min(9999, unit["hp"] + hp_gain))
        unit["maxHp"] = (unit.get("maxHp") if unit.get("maxHp") is not None else 100) + hp_gain


def _apply_combat_status_effects(source: dict[str, Any], target: dict[str, Any], tables: TerrainTables) -> None:
    """对齐 src/game/engine.ts:applyCombatStatusEffects 中与反击判定相关的部分。"""
    if target["hp"] <= 0:
        return
    if _has_ability(source, "poisoner", tables) and not _has_ability(target, "poisoner", tables):
        status = target.get("status")
        if not status or status.get("type") == "poisoned":
            target["status"] = {"type": "poisoned", "remainingTicks": 2}
    if _has_ability(source, "blinder", tables) and not _has_ability(target, "blinder", tables):
        status = target.get("status")
        if not status or status.get("type") == "blinded":
            target["status"] = {"type": "blinded", "remainingTurns": 1}


def encode_candidate_action_spatial(
    state: dict[str, Any],
    player_id: int,
    action: dict[str, Any],
    tables: TerrainTables,
    semantics_variant: str = "v14_no_exp_projection",
) -> dict[str, Any]:
    """对齐 TS encodeCandidateActionSpatial。

    `semantics_variant` 决定攻击语义槽 15/17 的口径，必须由权重声明的 schema 显式分派
    （与 TS `actionSemanticsVariantForSchema` 同一原则）：
    - `v14_no_exp_projection`（**本函数默认值，保持历史调用方行为不变**）：
      不投影攻击者本次攻击获得的经验/升级；
    - `v15_current`：投影经验/升级，与引擎结算顺序一致，V15/V19 schema 必须用这个。
    """
    units_by_id = {u["id"]: u for u in state["units"] if u["hp"] > 0}
    actor_coord, landing_coord, target_coord = action_coords(action, units_by_id)
    semantics = [0.0] * ACTION_SEMANTIC_DIM_V3
    action_type = action["type"]
    if action_type in ACTION_TYPE_LIST:
        semantics[ACTION_TYPE_LIST.index(action_type)] = 1.0

    if action_type == "attack":
        attacker = next((u for u in state["units"] if u["id"] == action["attackerId"]), None)
        defender = next((u for u in state["units"] if u["id"] == action["targetId"]), None)
        if attacker is not None and defender is not None:
            est_dmg = calculate_damage(state, attacker["id"], defender["id"], tables)
            est_counter = estimate_counter_damage(
                state, attacker["id"], defender["id"], tables,
                project_exp=(semantics_variant == "v15_current"),
            )
            semantics[14] = min(1.0, est_dmg / 100.0)
            semantics[15] = min(1.0, est_counter / 100.0)
            semantics[16] = 1.0 if est_dmg >= defender["hp"] else 0.0
            semantics[17] = 1.0 if est_counter >= attacker["hp"] else 0.0
            semantics[18] = 1.0 if _is_commander_unit(state, defender) else 0.0
            semantics[22] = 1.0 if _is_commander_unit(state, attacker) else 0.0
            semantics[23] = attacker["hp"] / max(1, attacker["maxHp"])
    elif action_type == "capture":
        semantics[19] = 1.0
    elif action_type == "destroy_town":
        semantics[19] = 0.5

    if target_coord is not None:
        tx, ty = target_coord["x"], target_coord["y"]
        if 0 <= ty < state["map"]["height"] and 0 <= tx < state["map"]["width"]:
            tile = state["map"]["tiles"][ty][tx]
            semantics[20] = float(_tile_terrain_config(tile, tables).get("defenseBonus") or 0) / 40.0

    if actor_coord is not None and landing_coord is not None:
        dist = abs(actor_coord["x"] - landing_coord["x"]) + abs(actor_coord["y"] - landing_coord["y"])
        semantics[21] = min(1.0, dist / 10.0)

    if action_type in ("recruit_to_castle", "recruit_and_deploy"):
        # 与 TS 端 encodeUnitClassOneHot 对齐：招募候选必须有兵种 one-hot，
        # 否则同一粗分类内的兵种（archer / wolf_archer 等）在输入上不可区分。
        unit_class = action["unitClass"]
        if unit_class in ACTION_UNIT_CLASS_LIST:
            semantics[ACTION_UNIT_CLASS_SLOT_START + ACTION_UNIT_CLASS_LIST.index(unit_class)] = 1.0


    own_player = next((p for p in state["players"] if p["id"] == player_id), None)
    own_gold = (own_player or {}).get("gold", 0)
    is_recruit = action_type in ("recruit_to_castle", "recruit_and_deploy")
    is_comm_recruit = is_recruit and action["unitClass"] == "commander"
    cost = 0.0
    if is_recruit:
        value = _get_unit_cost(state, player_id, action["unitClass"], tables)
        cost = float(value) if value is not None else 0.0
    comm_alive = any(
        u["hp"] > 0 and u["ownerId"] == player_id and _is_commander_unit(state, u) for u in state["units"]
    )
    semantics[24] = _categorize_unit_class(action["unitClass"]) / 7.0 if is_recruit else 0.0
    semantics[25] = 1.0 if is_comm_recruit else 0.0
    semantics[26] = min(1.0, cost / 1000.0)
    semantics[27] = max(0.0, (own_gold - cost) / 1000.0)
    semantics[28] = 1.0 if comm_alive else 0.0
    semantics[29] = ((own_player or {}).get("commanderReserveLevel") or 0) / 3.0 if is_comm_recruit else 0.0
    semantics[30] = ((own_player or {}).get("commanderReserveExp") or 0) / 100.0 if is_comm_recruit else 0.0
    semantics[31] = 1.0 if (action_type == "recruit_and_deploy" or state.get("pendingUnitId")) else 0.0

    return {
        "actorCoord": actor_coord,
        "landingCoord": landing_coord,
        "targetCoord": target_coord,
        "semantics": semantics,
    }


def load_fixture(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)
