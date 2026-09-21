/**
 * 空间网格多通道张量编码器 (Path B - Spatial Tensor Encoder)
 *
 * 核心升级：
 * 1. 彻底摒弃 4×4 粗粒度分箱，采用 24 通道精确 2D 空间张量 (C x H x W，支持最大 20x20 并零填充)；
 * 2. 保留完整的局部几何拓扑、地形加成、ZOC 与单位攻击射程威胁分布；
 * 3. 提取动作在网格上的精确空间三元组坐标 (actorPos, landingPos, targetPos)；
 * 4. 提取 24 维精确动作语义特征 (伤害/反击/斩杀/自保/占领/距离/兵种)。
 */

import type { Action, GameState, Position, Unit, UnitClass } from '../types';
import { areEnemyPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { getEffectiveStats } from '../abilities';
import { getTileTerrainConfig, getTileTerrainKey } from '../terrain_rules';
import { getDistance } from '../map';
import { calculateArmyValue } from '../env';
import { calculateDamage } from '../rules';
import { getActionSemantics } from '../../../tools/skirmish_action_semantics';

export const SPATIAL_TENSOR_CHANNELS = 24;
export const SPATIAL_TENSOR_MAX_H = 20;
export const SPATIAL_TENSOR_MAX_W = 20;
export const GLOBAL_FEATURE_DIM_V1 = 16;
export const GLOBAL_FEATURE_DIM_V2 = 20;
export const GLOBAL_FEATURE_DIM = GLOBAL_FEATURE_DIM_V2;

export const ACTION_SEMANTIC_DIM_V1 = 24;
export const ACTION_SEMANTIC_DIM_V2 = 32;
export const ACTION_SEMANTIC_DIM = ACTION_SEMANTIC_DIM_V2;

export interface SpatialEncodedState {
    /** 形状为 [24, 20, 20] 的扁平化 Float32Array (共 9600 个元素) */
    spatialTensor: Float32Array;
    /** 全局经济与战局标量 (20 维 in v2, 16 维 in v1) */
    globalFeatures: Float32Array;
    mapWidth: number;
    mapHeight: number;
    subjectPlayerId: number;
    version?: 'v1' | 'v2';
}

export interface SpatialActionFeatures {
    /** 动作在网格上的起点 (行动者) 坐标，范围 [0..19]，若无则置 -1 */
    actorCoord: Position | null;
    /** 动作在网格上的落点 (移动/部署) 坐标，范围 [0..19]，若无则置 -1 */
    landingCoord: Position | null;
    /** 动作在网格上的目标 (攻击/治疗/破坏) 坐标，范围 [0..19]，若无则置 -1 */
    targetCoord: Position | null;
    /** 动作的战术语义特征向量 (24 维 in v1, 32 维 in v2) */
    semantics: Float32Array | number[];
}

export const ACTION_TYPE_LIST = [
    'move', 'attack', 'capture', 'repair', 'wait',
    'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon',
    'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn'
] as const;

export function categorizeUnitClass(cls: UnitClass): number {
    switch (cls) {
        case 'soldier':
        case 'skeleton':
            return 1; // 步兵
        case 'archer':
        case 'wolf_archer':
            return 2; // 弓手/远程
        case 'ghost':
        case 'dragon':
            return 3; // 飞行
        case 'wolf':
        case 'berserker':
            return 4; // 骑兵/野兽
        case 'dark_mage':
        case 'witch':
        case 'druid':
            return 5; // 施法者
        case 'catapult':
        case 'golem':
            return 6; // 重装/攻城
        case 'commander':
            return 7; // 指挥官
        default:
            return 1;
    }
}

/**
 * 将 GameState 编码为 [24, 20, 20] 空间网格张量与全局标量 (V2: 20维, V1: 16维)。
 */
export function encodeGameStateSpatial(
    state: GameState,
    playerId: number,
    version: 'v1' | 'v2' = 'v2'
): SpatialEncodedState {
    const H = SPATIAL_TENSOR_MAX_H;
    const W = SPATIAL_TENSOR_MAX_W;
    const C = SPATIAL_TENSOR_CHANNELS;
    const tensor = new Float32Array(C * H * W);
    const mapW = state.map.width;
    const mapH = state.map.height;
    const alliance = getAllianceId(state, playerId);

    // 辅助函数：在 (ch, y, x) 写入标量
    const setChannel = (ch: number, y: number, x: number, val: number) => {
        if (y < 0 || y >= H || x < 0 || x >= W) return;
        tensor[ch * (H * W) + y * W + x] = val;
    };

    // 1. 地形与建筑通道
    for (let y = 0; y < mapH && y < H; y += 1) {
        for (let x = 0; x < mapW && x < W; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            if (!tile) continue;

            // Ch 23: 有效地图格标记
            setChannel(23, y, x, 1.0);

            const cfg = getTileTerrainConfig(tile);
            const key = getTileTerrainKey(tile);
            const defBonus = (cfg?.defenseBonus ?? 0) / 40.0;
            // Ch 7: 地形防御加成
            setChannel(7, y, x, defBonus);

            // 地形分类
            if (key === 'road' || key === 'bridge' || key === 'snow') {
                setChannel(0, y, x, 1.0);
            } else if (key === 'forest') {
                setChannel(1, y, x, 1.0);
            } else if (key === 'mountain' || key === 'hill') {
                setChannel(2, y, x, 1.0);
            } else if (key === 'deep_water' || key === 'water_temple') {
                setChannel(3, y, x, 1.0);
            } else if (key === 'castle') {
                setChannel(4, y, x, 1.0);
            } else if (key === 'town' || key === 'damaged_town') {
                setChannel(5, y, x, 1.0);
            } else {
                setChannel(6, y, x, 1.0);
            }

            // 归属判断
            if (tile.ownerId !== null) {
                if (getAllianceId(state, tile.ownerId) === alliance) {
                    setChannel(8, y, x, 1.0); // 己方领地
                } else if (areEnemyPlayers(state, playerId, tile.ownerId)) {
                    setChannel(9, y, x, 1.0); // 敌方领地
                }
            } else if (key === 'town' || key === 'castle' || key === 'damaged_town') {
                setChannel(10, y, x, 1.0); // 中立建筑
            }
        }
    }

    // 2. 单位通道
    const aliveUnits = state.units.filter(u => u.hp > 0);
    const ownUnits = aliveUnits.filter(u => getAllianceId(state, u.ownerId) === alliance);
    const enemyUnits = aliveUnits.filter(u => areEnemyPlayers(state, playerId, u.ownerId));

    // 己方单位: Ch 11..17
    for (const u of ownUnits) {
        const x = u.pos.x;
        const y = u.pos.y;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;

        setChannel(11, y, x, 1.0); // 己方存在
        setChannel(12, y, x, Math.max(0, Math.min(1.0, u.hp / Math.max(1, u.maxHp)))); // HP
        setChannel(13, y, x, (!u.hasActed) ? 1.0 : 0.0); // 未行动
        setChannel(14, y, x, categorizeUnitClass(u.unitClass) / 7.0); // 兵种类别

        const stats = getEffectiveStats(u);
        setChannel(15, y, x, (stats.minRange ?? 1) / 5.0);
        setChannel(16, y, x, (stats.maxRange ?? 1) / 5.0);
        setChannel(17, y, x, isCommanderUnit(state, u) ? 1.0 : 0.0);
    }

    // 敌方单位: Ch 18..22
    for (const u of enemyUnits) {
        const x = u.pos.x;
        const y = u.pos.y;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;

        setChannel(18, y, x, 1.0); // 敌方存在
        setChannel(19, y, x, Math.max(0, Math.min(1.0, u.hp / Math.max(1, u.maxHp)))); // HP
        setChannel(20, y, x, categorizeUnitClass(u.unitClass) / 7.0); // 兵种类别
        setChannel(22, y, x, isCommanderUnit(state, u) ? 1.0 : 0.0);

        // 简易攻击射程覆盖 (Threat Zone) -> 标记在 Ch 21
        const stats = getEffectiveStats(u);
        const maxR = stats.maxRange ?? 1;
        const minR = stats.minRange ?? 1;
        const move = u.hasMoved ? 0 : (stats.move ?? 4);
        const threatDist = move + maxR;

        // 在威胁半径内的格子涂布威胁信号
        for (let dy = -threatDist; dy <= threatDist; dy += 1) {
            for (let dx = -threatDist; dx <= threatDist; dx += 1) {
                const tx = x + dx;
                const ty = y + dy;
                const dist = Math.abs(dx) + Math.abs(dy);
                if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && dist <= threatDist) {
                    setChannel(21, ty, tx, 1.0);
                }
            }
        }
    }

    // 3. 全局标量特征 (V2: 20 维, V1: 16 维)
    const dim = version === 'v1' ? GLOBAL_FEATURE_DIM_V1 : GLOBAL_FEATURE_DIM_V2;
    const globals = new Float32Array(dim);
    const enemies = state.players.filter(p => p.id !== playerId && areEnemyPlayers(state, playerId, p.id));
    const ownPlayer = state.players.find(p => p.id === playerId);
    const ownGold = ownPlayer?.gold ?? 0;
    const bestEnemyGold = enemies.length ? Math.max(...enemies.map(p => p.gold)) : 0;
    const ownArmy = calculateArmyValue(state, playerId);
    const enemyArmy = enemies.length ? Math.max(...enemies.map(p => calculateArmyValue(state, p.id))) : 0;

    const allTiles = state.map.tiles.flat();
    const townCount = (filterFn: (t: import('../terrain').Tile) => boolean) =>
        allTiles.filter(t => {
            const k = getTileTerrainKey(t);
            return (k === 'town' || k === 'castle') && filterFn(t);
        }).length;

    const ownTowns = townCount(t => t.ownerId !== null && getAllianceId(state, t.ownerId) === alliance);
    const enemyTowns = townCount(t => t.ownerId !== null && areEnemyPlayers(state, playerId, t.ownerId));
    const neutralTowns = townCount(t => t.ownerId === null);

    globals[0] = state.turn / 50.0;
    globals[1] = ownGold / 1000.0;
    globals[2] = bestEnemyGold / 1000.0;
    globals[3] = (ownGold - bestEnemyGold) / 1000.0;
    globals[4] = ownUnits.length / 10.0;
    globals[5] = enemyUnits.length / 10.0;
    globals[6] = ownArmy / 1000.0;
    globals[7] = enemyArmy / 1000.0;
    globals[8] = ownTowns / 10.0;
    globals[9] = enemyTowns / 10.0;
    globals[10] = neutralTowns / 10.0;
    globals[11] = ownUnits.some(u => isCommanderUnit(state, u)) ? 1.0 : 0.0;
    globals[12] = enemyUnits.some(u => isCommanderUnit(state, u)) ? 1.0 : 0.0;
    globals[13] = state.pendingUnitId ? 1.0 : 0.0;
    globals[14] = mapW / 20.0;
    globals[15] = mapH / 20.0;

    if (version === 'v2') {
        const commCost = getUnitCost(state, playerId, 'commander');
        const deathCount = ownPlayer?.commanderDeathCount ?? 0;
        globals[16] = Math.min(1.0, deathCount / 5.0);
        globals[17] = commCost !== null ? Math.min(1.0, commCost / 1000.0) : 0.0;
        globals[18] = commCost !== null ? Math.min(1.0, Math.max(0, commCost - ownGold) / 1000.0) : 0.0;

        let unoccupiedCastles = 0;
        for (let y = 0; y < mapH; y += 1) {
            for (let x = 0; x < mapW; x += 1) {
                const tile = state.map.tiles[y]?.[x];
                if (tile && getTileTerrainKey(tile) === 'castle') {
                    if (tile.ownerId !== null && getAllianceId(state, tile.ownerId) === alliance) {
                        const isOccupied = state.units.some(u => u.hp > 0 && u.pos.x === x && u.pos.y === y);
                        if (!isOccupied) {
                            unoccupiedCastles += 1;
                        }
                    }
                }
            }
        }
        globals[19] = Math.min(1.0, unoccupiedCastles / 5.0);
    }

    return {
        spatialTensor: tensor,
        globalFeatures: globals,
        mapWidth: mapW,
        mapHeight: mapH,
        subjectPlayerId: playerId,
        version
    };
}

/**
 * 提取候选动作的空间落点坐标与战术语义向量 (V2: 32 维, V1: 24 维)。
 */
export function encodeCandidateActionSpatial(
    state: GameState,
    playerId: number,
    action: Action,
    version: 'v1' | 'v2' = 'v2'
): SpatialActionFeatures {
    const unitsMap = new Map(state.units.map(u => [u.id, { id: u.id, x: u.pos.x, y: u.pos.y }]));
    const sem = getActionSemantics(action, unitsMap);

    const semDim = version === 'v1' ? ACTION_SEMANTIC_DIM_V1 : ACTION_SEMANTIC_DIM_V2;
    const semantics = new Float32Array(semDim);

    // 0..13: ActionType One-hot
    const typeIdx = ACTION_TYPE_LIST.indexOf(action.type as any);
    if (typeIdx !== -1) semantics[typeIdx] = 1.0;

    let actorCoord: Position | null = sem.actorPos;
    let landingCoord: Position | null = sem.landingPos;
    let targetCoord: Position | null = sem.targetPos;

    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        actorCoord = action.castlePos;
        landingCoord = (action.type === 'recruit_and_deploy') ? action.to : action.castlePos;
    }

    // 战术攻防预测计算 (若为攻击动作)
    if (action.type === 'attack') {
        const attacker = state.units.find(u => u.id === action.attackerId);
        const defender = state.units.find(u => u.id === action.targetId);
        if (attacker && defender) {
            const estDmg = calculateDamage(state, attacker.id, defender.id);
            const estCounter = (defender.hp - estDmg > 0) ? calculateDamage(state, defender.id, attacker.id) : 0;

            semantics[14] = Math.min(1.0, estDmg / 100.0);
            semantics[15] = Math.min(1.0, estCounter / 100.0);
            semantics[16] = estDmg >= defender.hp ? 1.0 : 0.0; // 斩杀
            semantics[17] = estCounter >= attacker.hp ? 1.0 : 0.0; // 自杀风险
            semantics[18] = isCommanderUnit(state, defender) ? 1.0 : 0.0; // 目标为指挥官
            semantics[22] = isCommanderUnit(state, attacker) ? 1.0 : 0.0;
            semantics[23] = attacker.hp / Math.max(1, attacker.maxHp);
        }
    } else if (action.type === 'capture') {
        semantics[19] = 1.0; // 占领城镇
    } else if (action.type === 'destroy_town') {
        semantics[19] = 0.5;
    }

    // 目标地形防御加成
    if (targetCoord && targetCoord.y >= 0 && targetCoord.y < state.map.height &&
        targetCoord.x >= 0 && targetCoord.x < state.map.width) {
        const tile = state.map.tiles[targetCoord.y]?.[targetCoord.x];
        if (tile) {
            const cfg = getTileTerrainConfig(tile);
            semantics[20] = (cfg?.defenseBonus ?? 0) / 40.0;
        }
    }

    // 移动距离
    if (actorCoord && landingCoord) {
        const dist = Math.abs(actorCoord.x - landingCoord.x) + Math.abs(actorCoord.y - landingCoord.y);
        semantics[21] = Math.min(1.0, dist / 10.0);
    }

    // V2 候选动作语义扩展 (24..31 维)
    if (version === 'v2') {
        const ownPlayer = state.players.find(p => p.id === playerId);
        const ownGold = ownPlayer?.gold ?? 0;
        const isRecruit = action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy';
        const isCommRecruit = isRecruit && action.unitClass === 'commander';
        const cost = isRecruit ? (getUnitCost(state, playerId, action.unitClass) ?? 0) : 0;
        const commAlive = state.units.some(u => u.hp > 0 && u.ownerId === playerId && isCommanderUnit(state, u));

        // 24: 招募兵种类别 (1..7 / 7.0)
        semantics[24] = isRecruit ? categorizeUnitClass(action.unitClass) / 7.0 : 0.0;
        // 25: 是否为指挥官招募
        semantics[25] = isCommRecruit ? 1.0 : 0.0;
        // 26: 动作花费 / 1000
        semantics[26] = Math.min(1.0, cost / 1000.0);
        // 27: 动作后剩余金币 / 1000
        semantics[27] = Math.max(0.0, (ownGold - cost) / 1000.0);
        // 28: 己方指挥官当前是否存活
        semantics[28] = commAlive ? 1.0 : 0.0;
        // 29: 指挥官保留等级
        semantics[29] = isCommRecruit ? (ownPlayer?.commanderReserveLevel ?? 0) / 3.0 : 0.0;
        // 30: 指挥官保留经验
        semantics[30] = isCommRecruit ? (ownPlayer?.commanderReserveExp ?? 0) / 100.0 : 0.0;
        // 31: 是否处于部署阶段或 pending 处理
        semantics[31] = (action.type === 'recruit_and_deploy' || Boolean(state.pendingUnitId)) ? 1.0 : 0.0;
    }

    return {
        actorCoord,
        landingCoord,
        targetCoord,
        semantics
    };
}
