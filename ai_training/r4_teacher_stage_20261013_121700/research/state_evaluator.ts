import { GameState } from '../env/src/game/types';
import { areAlliedPlayers, getAllianceId } from '../env/src/game/rule_config';
import { calculateArmyValue } from '../env/src/game/env';
import { getTileTerrainConfig } from '../env/src/game/terrain_rules';

export interface EvaluatorWeights {
    materialWeight: number;
    goldWeight: number;
    castleWeight: number;
    townWeight: number;
    tanhScale: number;
    maxNonTerminalBound: number;
}

export const DEFAULT_EVALUATOR_WEIGHTS: EvaluatorWeights = {
    materialWeight: 1.0,
    goldWeight: 0.25,
    castleWeight: 150.0,
    townWeight: 75.0,
    tanhScale: 2000.0,
    maxNonTerminalBound: 0.95
};

// 消融选项：仅军力与金币估值（不含建筑）
export const ABLATION_MATERIAL_ONLY_WEIGHTS: EvaluatorWeights = {
    materialWeight: 1.0,
    goldWeight: 0.25,
    castleWeight: 0.0,
    townWeight: 0.0,
    tanhScale: 2000.0,
    maxNonTerminalBound: 0.95
};

/**
 * 状态叶值评估器
 * 核心保证：
 * 1. 自然终局严格支配（胜 +1.0，平 0.0，负 -1.0）；
 * 2. 非终局严格限制在 [-0.95, 0.95]，绝对不声称手工分是真实胜率；
 * 3. 固定 root 观察者联盟视角，始终以观察者为正方向！
 */
export function evaluateStateValue(
    state: GameState,
    rootObserverAllianceId: number,
    weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS
): number {
    // 1. 自然终局判定
    const winner = state.winner;
    if (winner !== null) {
        if (winner === -1) return 0.0;
        if (winner === rootObserverAllianceId) return 1.0;
        return -1.0;
    }

    // 2. 统计双方军力
    let friendArmy = 0;
    let enemyArmy = 0;
    for (const p of state.players) {
        if (!p.isAlive) continue;
        const pAlliance = getAllianceId(state, p.id);
        const val = calculateArmyValue(state, p.id);
        if (pAlliance === rootObserverAllianceId) {
            friendArmy += val;
        } else {
            enemyArmy += val;
        }
    }
    const materialDiff = friendArmy - enemyArmy;

    // 3. 统计双方金币
    let friendGold = 0;
    let enemyGold = 0;
    for (const p of state.players) {
        if (!p.isAlive) continue;
        const pAlliance = getAllianceId(state, p.id);
        if (pAlliance === rootObserverAllianceId) {
            friendGold += p.gold;
        } else {
            enemyGold += p.gold;
        }
    }
    const goldDiff = friendGold - enemyGold;

    // 4. 统计双方建筑（城堡与城镇）
    let friendCastles = 0;
    let enemyCastles = 0;
    let friendTowns = 0;
    let enemyTowns = 0;

    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            const cfg = getTileTerrainConfig(tile);
            if (tile.ownerId !== null && tile.ownerId !== undefined) {
                const tAlliance = getAllianceId(state, tile.ownerId);
                const isFriend = tAlliance === rootObserverAllianceId;

                if (cfg.key === 'castle') {
                    if (isFriend) friendCastles++;
                    else enemyCastles++;
                } else if (cfg.key === 'town' || cfg.key === 'damaged_town') {
                    if (isFriend) friendTowns++;
                    else enemyTowns++;
                }
            }
        }
    }

    const castleDiff = friendCastles - enemyCastles;
    const townDiff = friendTowns - enemyTowns;

    // 5. 综合加权得分
    const rawScore =
        materialDiff * weights.materialWeight +
        goldDiff * weights.goldWeight +
        castleDiff * weights.castleWeight +
        townDiff * weights.townWeight;

    // 6. tanh 压缩到 [-bound, bound]
    const normalized = Math.tanh(rawScore / weights.tanhScale) * weights.maxNonTerminalBound;
    return normalized;
}
