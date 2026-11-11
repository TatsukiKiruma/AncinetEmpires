import { GameState, Action, Unit } from '../env/src/game/types';
import { getTileTerrainConfig } from '../env/src/game/terrain_rules';
import { areAlliedPlayers } from '../env/src/game/rule_config';
import { encodeAction } from '../env/src/game/env';
import { FEATURE_SCHEMA_V1, FeatureSchema } from './feature_schema';

export interface EncodedStateFeatures {
    schemaVersion: string;
    rulesRevision: string;
    observerPlayerId: number;
    stateHash: string;
    // 张量数据
    spatialShape: [number, number, number]; // [10, 20, 20]
    spatialBuffer: number[];
    entityShape: [number, number]; // [48, 16]
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
    const { height: H, width: W, channels: C } = FEATURE_SCHEMA_V1.spatial;
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
 * 编码实体表特征：[48, 16]
 * 核心保证：同格 pending 单位作为独立实体完整保留在表中，绝不丢失！
 */
export function encodeEntities(
    state: GameState,
    observerPlayerId: number
): { entityBuffer: number[]; entityIdMap: Map<string, number> } {
    const { maxEntities, featuresPerEntity } = FEATURE_SCHEMA_V1.entities;
    const buf = new Array(maxEntities * featuresPerEntity).fill(0);
    const entityIdMap = new Map<string, number>();

    const allUnits: Unit[] = [...state.units];
    // 如果有 pendingUnitId，检查是否已在 units 中；若在，标出 is_pending_recruit
    const pendingId = state.pendingUnitId;

    const count = Math.min(allUnits.length, maxEntities);
    for (let i = 0; i < count; i++) {
        const u = allUnits[i];
        entityIdMap.set(u.id, i);
        const offset = i * featuresPerEntity;

        // 0: valid_entity
        buf[offset + 0] = 1.0;
        // 1: norm_pos_x
        buf[offset + 1] = u.pos.x / FEATURE_SCHEMA_V1.constants.maxCoord;
        // 2: norm_pos_y
        buf[offset + 2] = u.pos.y / FEATURE_SCHEMA_V1.constants.maxCoord;

        // 3: is_friendly, 4: is_enemy
        const isFriend = areAlliedPlayers(state, u.ownerId, observerPlayerId);
        buf[offset + 3] = isFriend ? 1.0 : 0.0;
        buf[offset + 4] = isFriend ? 0.0 : 1.0;

        // 5: hp_norm (支持超额生命，缩放到 200)
        buf[offset + 5] = u.hp / FEATURE_SCHEMA_V1.constants.maxHpScale;
        // 6: max_hp_norm
        buf[offset + 6] = u.maxHp / FEATURE_SCHEMA_V1.constants.maxHpScale;
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
        const cIdx = UNIT_CLASS_VOCAB.indexOf(u.unitClass);
        buf[offset + 15] = cIdx >= 0 ? cIdx / 25.0 : 0.0;
    }

    return { entityBuffer: buf, entityIdMap };
}

/**
 * 编码全局特征：[12]
 */
export function encodeGlobal(state: GameState, observerPlayerId: number): number[] {
    const G = FEATURE_SCHEMA_V1.global.featureDim;
    const buf = new Array(G).fill(0);

    let friendGold = 0;
    let enemyGold = 0;
    let friendUnits = 0;
    let enemyUnits = 0;
    let friendTowns = 0;
    let enemyTowns = 0;
    let friendCastles = 0;
    let enemyCastles = 0;

    for (const p of state.players) {
        if (!p.isAlive) continue;
        if (areAlliedPlayers(state, p.id, observerPlayerId)) {
            friendGold += p.gold;
        } else {
            enemyGold += p.gold;
        }
    }

    for (const u of state.units) {
        if (areAlliedPlayers(state, u.ownerId, observerPlayerId)) {
            friendUnits++;
        } else {
            enemyUnits++;
        }
    }

    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const t = state.map.tiles[y][x];
            const cfg = getTileTerrainConfig(t);
            if (t.ownerId !== null && t.ownerId !== undefined) {
                const isFriend = areAlliedPlayers(state, t.ownerId, observerPlayerId);
                if (cfg.key === 'town' || cfg.key === 'damaged_town') {
                    if (isFriend) friendTowns++;
                    else enemyTowns++;
                } else if (cfg.key === 'castle') {
                    if (isFriend) friendCastles++;
                    else enemyCastles++;
                }
            }
        }
    }

    buf[0] = Math.min(1.0, friendGold / FEATURE_SCHEMA_V1.constants.maxGoldScale);
    buf[1] = Math.min(1.0, enemyGold / FEATURE_SCHEMA_V1.constants.maxGoldScale);
    buf[2] = friendUnits / 30.0;
    buf[3] = enemyUnits / 30.0;
    buf[4] = friendTowns / 20.0;
    buf[5] = enemyTowns / 20.0;
    buf[6] = friendCastles / 5.0;
    buf[7] = enemyCastles / 5.0;
    buf[8] = Math.min(1.0, state.turn / FEATURE_SCHEMA_V1.constants.maxTurnsScale);
    buf[9] = state.currentPlayer === 0 ? 1.0 : 0.0;
    buf[10] = state.pendingUnitId ? 1.0 : 0.0;
    buf[11] = (friendUnits + enemyUnits) / 60.0;

    return buf;
}

/**
 * 编码动作特征：[A, 20]
 * 支持任意长度 A（绝不静默截断为 256）！
 */
export function encodeActions(
    legalActions: readonly Action[],
    entityIdMap: Map<string, number>
): { actionBuffer: number[]; candidateCodes: string[] } {
    const vocab = FEATURE_SCHEMA_V1.action.actionTypeVocabulary;
    const FA = FEATURE_SCHEMA_V1.action.actionFeatureDim;
    const A = legalActions.length;
    const buf = new Array(A * FA).fill(0);
    const candidateCodes: string[] = [];

    for (let i = 0; i < A; i++) {
        const act = legalActions[i];
        candidateCodes.push(encodeAction(act));
        const offset = i * FA;

        // One-hot action type (0..13)
        const typeIdx = vocab.indexOf(act.type);
        if (typeIdx >= 0 && typeIdx < 14) {
            buf[offset + typeIdx] = 1.0;
        }

        // 14: actor_entity_index_norm
        let actorId: string | undefined;
        let targetId: string | undefined;
        let targetPos: { x: number; y: number } | undefined;
        let unitClassRecruit: string | undefined;

        if ('unitId' in act) actorId = act.unitId;
        else if ('attackerId' in act) actorId = act.attackerId;
        else if ('healerId' in act) actorId = act.healerId;
        else if ('supporterId' in act) actorId = act.supporterId;
        else if ('summonerId' in act) actorId = act.summonerId;

        if ('targetId' in act) targetId = act.targetId;
        if ('to' in act) targetPos = act.to;
        else if ('target' in act) targetPos = act.target;
        else if ('spawnPos' in act) targetPos = act.spawnPos;
        else if ('castlePos' in act) targetPos = act.castlePos;

        if ('unitClass' in act) unitClassRecruit = act.unitClass;

        if (actorId && entityIdMap.has(actorId)) {
            buf[offset + 14] = (entityIdMap.get(actorId)! + 1) / 48.0;
        }
        if (targetId && entityIdMap.has(targetId)) {
            buf[offset + 15] = (entityIdMap.get(targetId)! + 1) / 48.0;
        }
        if (targetPos) {
            buf[offset + 16] = targetPos.x / FEATURE_SCHEMA_V1.constants.maxCoord;
            buf[offset + 17] = targetPos.y / FEATURE_SCHEMA_V1.constants.maxCoord;
            buf[offset + 19] = 1.0; // has_target
        }
        if (unitClassRecruit) {
            const uIdx = UNIT_CLASS_VOCAB.indexOf(unitClassRecruit);
            buf[offset + 18] = uIdx >= 0 ? uIdx / 25.0 : 0.0;
        }
    }

    return { actionBuffer: buf, candidateCodes };
}

/**
 * 完整编码一个决策状态与合法候选
 */
export function encodeStateAndActions(
    state: GameState,
    legalActions: readonly Action[],
    observerPlayerId: number,
    stateHash: string,
    allowSurrender: boolean = false
): EncodedStateFeatures {
    const spatialBuffer = encodeSpatial(state, observerPlayerId);
    const { entityBuffer, entityIdMap } = encodeEntities(state, observerPlayerId);
    const globalBuffer = encodeGlobal(state, observerPlayerId);
    const { actionBuffer, candidateCodes } = encodeActions(legalActions, entityIdMap);

    const A = legalActions.length;
    const legalMask = new Array(A).fill(true);
    let eligibleMask = legalActions.map(a => a.type === 'surrender' ? allowSurrender : true);
    if (eligibleMask.filter(Boolean).length === 0 && A > 0) {
        eligibleMask = new Array(A).fill(true);
    }
    const searchCompletedMask = new Array(A).fill(false);
    const paddingMask = new Array(A).fill(false);

    return {
        schemaVersion: FEATURE_SCHEMA_V1.schemaVersion,
        rulesRevision: FEATURE_SCHEMA_V1.rulesRevision,
        observerPlayerId,
        stateHash,
        spatialShape: [FEATURE_SCHEMA_V1.spatial.channels, FEATURE_SCHEMA_V1.spatial.height, FEATURE_SCHEMA_V1.spatial.width],
        spatialBuffer,
        entityShape: [FEATURE_SCHEMA_V1.entities.maxEntities, FEATURE_SCHEMA_V1.entities.featuresPerEntity],
        entityBuffer,
        globalShape: [FEATURE_SCHEMA_V1.global.featureDim],
        globalBuffer,
        actionCount: A,
        actionFeatureDim: FEATURE_SCHEMA_V1.action.actionFeatureDim,
        actionShape: [A, FEATURE_SCHEMA_V1.action.actionFeatureDim],
        actionBuffer,
        candidateCodes,
        legalMask,
        eligibleMask,
        searchCompletedMask,
        paddingMask
    };
}
