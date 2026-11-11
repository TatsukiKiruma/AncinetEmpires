import type { GameState, Action, Unit } from '../../../src/game/types';
import { getTileTerrainConfig } from '../../../src/game/terrain_rules';
import { areAlliedPlayers } from '../../../src/game/rule_config';
import { encodeAction } from '../../../src/game/env';
import { FEATURE_SCHEMA_R6, FeatureSchema } from './feature_schema';
import { computeStateHash } from './state_hash';

export interface EncodedStateFeatures {
    schemaVersion: string;
    rulesRevision: string;
    observerPlayerId: number;
    stateHash: string;
    // 张量数据
    spatialShape: [number, number, number]; // [10, 20, 20]
    spatialBuffer: number[];
    entityShape: [number, number]; // [64, 16]
    entityBuffer: number[];
    globalShape: [number]; // [12]
    globalBuffer: number[];
    // 动作与候选
    actionCount: number;
    actionFeatureDim: number;
    actionShape: [number, number]; // [A, 20]
    actionBuffer: number[];
    candidateCodes: string[];
    // 四种掩码
    legalMask: boolean[];
    eligibleMask: boolean[];
    searchCompletedMask: boolean[];
    paddingMask: boolean[];
}

const UNIT_CLASS_VOCAB = [
    'soldier', 'ghost', 'mermaid', 'archer', 'slime', 'water_elemental',
    'dark_mage', 'witch', 'paladin', 'elf', 'berserker', 'wolf',
    'golem', 'ice_elemental', 'druid', 'catapult', 'wolf_archer', 'dragon',
    'commander', 'skeleton', 'crystal'
];

/**
 * 编码空间特征：[10, 20, 20]
 */
export function encodeSpatial(state: GameState, observerPlayerId: number): number[] {
    const { height: H, width: W, channels: C } = FEATURE_SCHEMA_R6.spatial;
    const buf = new Array(C * H * W).fill(0);
    const map = state.map;

    const setVal = (c: number, y: number, x: number, val: number) => {
        if (x >= 0 && x < W && y >= 0 && y < H) {
            buf[c * (H * W) + y * W + x] = val;
        }
    };

    for (let y = 0; y < map.height && y < H; y++) {
        for (let x = 0; x < map.width && x < W; x++) {
            const tile = map.tiles[y][x];
            const cfg = getTileTerrainConfig(tile);

            // Channel 0: valid_tile_mask
            setVal(0, y, x, 1.0);
            // Channel 1: defense_bonus_norm (0..100 -> 0..1.0)
            setVal(1, y, x, (cfg.defenseBonus || 0) / 100.0);
            // Channel 2: heal_rate_norm (0..30 -> 0..1.0)
            setVal(2, y, x, (cfg.healPerTurn || 0) / 30.0);
            // Channel 3: move_cost_base_norm
            setVal(3, y, x, (cfg.moveCost || 1) / 10.0);

            // Owner channels (4: friendly, 5: enemy, 6: neutral)
            if (tile.ownerId === null || tile.ownerId === undefined) {
                setVal(6, y, x, 1.0);
            } else if (areAlliedPlayers(state, tile.ownerId, observerPlayerId)) {
                setVal(4, y, x, 1.0);
            } else {
                setVal(5, y, x, 1.0);
            }

            // Channel 7: is_castle
            if (cfg.key === 'castle') setVal(7, y, x, 1.0);
            // Channel 8: is_town / damaged_town
            if (cfg.key === 'town' || cfg.key === 'damaged_town') setVal(8, y, x, 1.0);
            // Channel 9: hp_or_durability_norm
            setVal(9, y, x, (tile.hp ?? 100) / 100.0);
        }
    }

    return buf;
}

/**
 * 编码实体表特征：[64, 16]
 * 核心保证：容量扩充至 64；若超出容量显式抛出 Fatal 异常，绝不静默丢弃！
 */
export function encodeEntities(
    state: GameState,
    observerPlayerId: number
): { entityBuffer: number[]; entityIdMap: Map<string, number> } {
    const { maxEntities, featuresPerEntity } = FEATURE_SCHEMA_R6.entities;
    const buf = new Array(maxEntities * featuresPerEntity).fill(0);
    const entityIdMap = new Map<string, number>();

    const allUnits: Unit[] = [...state.units];
    if (allUnits.length > maxEntities) {
        throw new Error(`[EntityOverflowError] 实体数量 (${allUnits.length}) 超过特征表最大容量 (${maxEntities})，严禁静默丢弃！`);
    }

    const pendingId = state.pendingUnitId;
    const count = allUnits.length;
    for (let i = 0; i < count; i++) {
        const u = allUnits[i];
        entityIdMap.set(u.id, i);
        const offset = i * featuresPerEntity;

        // 0: valid_entity
        buf[offset + 0] = 1.0;
        // 1: norm_pos_x
        buf[offset + 1] = u.pos.x / FEATURE_SCHEMA_R6.constants.maxCoord;
        // 2: norm_pos_y
        buf[offset + 2] = u.pos.y / FEATURE_SCHEMA_R6.constants.maxCoord;

        // 3: is_friendly, 4: is_enemy
        const isFriend = areAlliedPlayers(state, u.ownerId, observerPlayerId);
        buf[offset + 3] = isFriend ? 1.0 : 0.0;
        buf[offset + 4] = isFriend ? 0.0 : 1.0;

        // 5: hp_norm (支持超额生命，缩放到 200)
        buf[offset + 5] = u.hp / FEATURE_SCHEMA_R6.constants.maxHpScale;
        // 6: max_hp_norm
        buf[offset + 6] = u.maxHp / FEATURE_SCHEMA_R6.constants.maxHpScale;
        // 7: level_norm (0..3 -> 0..1.0)
        buf[offset + 7] = (u.level ?? 0) / 3.0;
        // 8: exp_norm (0..600 -> 0..1.0)
        buf[offset + 8] = (u.exp ?? 0) / 600.0;
        // 9: has_acted
        buf[offset + 9] = u.hasActed ? 1.0 : 0.0;
        // 10: has_moved
        buf[offset + 10] = u.hasMoved ? 1.0 : 0.0;
        // 11: is_commander
        buf[offset + 11] = u.unitClass === 'commander' ? 1.0 : 0.0;
        // 12: is_pending_recruit
        buf[offset + 12] = u.id === pendingId ? 1.0 : 0.0;
        // 13: status_blinded
        buf[offset + 13] = u.status?.type === 'blinded' ? 1.0 : 0.0;
        // 14: status_poisoned
        buf[offset + 14] = u.status?.type === 'poisoned' ? 1.0 : 0.0;

        // 15: unit_class_index_norm
        const classIdx = UNIT_CLASS_VOCAB.indexOf(u.unitClass);
        buf[offset + 15] = classIdx >= 0 ? classIdx / (UNIT_CLASS_VOCAB.length - 1) : 0.0;
    }

    return { entityBuffer: buf, entityIdMap };
}

/**
 * 编码全局标量：[12]
 */
export function encodeGlobal(state: GameState, observerPlayerId: number): number[] {
    const buf = new Array(FEATURE_SCHEMA_R6.global.featureDim).fill(0);

    const me = state.players.find(p => p.id === observerPlayerId);
    const enemies = state.players.filter(p => !areAlliedPlayers(state, p.id, observerPlayerId));

    const friendlyGold = me ? me.gold : 0;
    const enemyGold = enemies.reduce((acc, p) => acc + p.gold, 0);

    const friendlyUnits = state.units.filter(u => areAlliedPlayers(state, u.ownerId, observerPlayerId)).length;
    const enemyUnits = state.units.filter(u => !areAlliedPlayers(state, u.ownerId, observerPlayerId)).length;

    let friendlyTowns = 0;
    let enemyTowns = 0;
    let friendlyCastles = 0;
    let enemyCastles = 0;

    for (const row of state.map.tiles) {
        for (const t of row) {
            const cfg = getTileTerrainConfig(t);
            if (cfg.key === 'town' || cfg.key === 'damaged_town') {
                if (t.ownerId !== null && t.ownerId !== undefined) {
                    if (areAlliedPlayers(state, t.ownerId, observerPlayerId)) friendlyTowns++;
                    else enemyTowns++;
                }
            } else if (cfg.key === 'castle') {
                if (t.ownerId !== null && t.ownerId !== undefined) {
                    if (areAlliedPlayers(state, t.ownerId, observerPlayerId)) friendlyCastles++;
                    else enemyCastles++;
                }
            }
        }
    }

    buf[0] = friendlyGold / FEATURE_SCHEMA_R6.constants.maxGoldScale;
    buf[1] = enemyGold / FEATURE_SCHEMA_R6.constants.maxGoldScale;
    buf[2] = friendlyUnits / 30.0;
    buf[3] = enemyUnits / 30.0;
    buf[4] = friendlyTowns / 20.0;
    buf[5] = enemyTowns / 20.0;
    buf[6] = friendlyCastles / 10.0;
    buf[7] = enemyCastles / 10.0;
    buf[8] = state.turnNumber / FEATURE_SCHEMA_R6.constants.maxTurnsScale;
    buf[9] = state.currentPlayer === 0 ? 1.0 : 0.0;
    buf[10] = state.pendingUnitId ? 1.0 : 0.0;
    buf[11] = (me?.unitCount ?? 0) / (state.settings?.unitLimit ?? 30);

    return buf;
}

/**
 * 编码完整状态与动作候选
 */
export function encodeFullState(
    state: GameState,
    observerPlayerId: number,
    legalActions: Action[]
): EncodedStateFeatures {
    const spatialBuffer = encodeSpatial(state, observerPlayerId);
    const { entityBuffer } = encodeEntities(state, observerPlayerId);
    const globalBuffer = encodeGlobal(state, observerPlayerId);

    const actionCodes = legalActions.map(a => encodeAction(a));
    const A = actionCodes.length;
    const actionBuffer = new Array(A * FEATURE_SCHEMA_R6.action.actionFeatureDim).fill(0);

    return {
        schemaVersion: FEATURE_SCHEMA_R6.schemaVersion,
        rulesRevision: FEATURE_SCHEMA_R6.rulesRevision,
        observerPlayerId,
        stateHash: computeStateHash(state),
        spatialShape: [FEATURE_SCHEMA_R6.spatial.channels, FEATURE_SCHEMA_R6.spatial.height, FEATURE_SCHEMA_R6.spatial.width],
        spatialBuffer,
        entityShape: [FEATURE_SCHEMA_R6.entities.maxEntities, FEATURE_SCHEMA_R6.entities.featuresPerEntity],
        entityBuffer,
        globalShape: [FEATURE_SCHEMA_R6.global.featureDim],
        globalBuffer,
        actionCount: A,
        actionFeatureDim: FEATURE_SCHEMA_R6.action.actionFeatureDim,
        actionShape: [A, FEATURE_SCHEMA_R6.action.actionFeatureDim],
        actionBuffer,
        candidateCodes: actionCodes,
        legalMask: new Array(A).fill(true),
        eligibleMask: new Array(A).fill(true),
        searchCompletedMask: new Array(A).fill(true),
        paddingMask: new Array(A).fill(false)
    };
}
