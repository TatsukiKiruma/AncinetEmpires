import { GameState, Position, Unit } from '../env/src/game/types';
import { getAllianceId } from '../env/src/game/rule_config';
import { calculateArmyValue } from '../env/src/game/env';
import { getTileTerrainConfig } from '../env/src/game/terrain_rules';
import { TacticalPathfinder } from '../env/src/game/ai/tactical_pathfinding';

export interface EvaluatorWeightsV2 {
    materialWeight: number;
    goldWeight: number;
    castleWeight: number;
    townWeight: number;
    pushWeight: number;         // 目标推进势能权重
    territoryWeight: number;    // 控图区域权重
    tanhScale: number;
    maxNonTerminalBound: number;
}

export const DEFAULT_EVALUATOR_WEIGHTS_V2: EvaluatorWeightsV2 = {
    materialWeight: 1.0,
    goldWeight: 0.25,
    castleWeight: 150.0,
    townWeight: 75.0,
    pushWeight: 25.0,
    territoryWeight: 10.0,
    tanhScale: 2000.0,
    maxNonTerminalBound: 0.90
};

// 消融变体配置
export const ABLATION_CONFIGS_EVALUATOR: Record<string, EvaluatorWeightsV2> = {
    // 纯基础 v1 权重（无推进、无控图）
    v1_baseline: {
        materialWeight: 1.0,
        goldWeight: 0.25,
        castleWeight: 150.0,
        townWeight: 75.0,
        pushWeight: 0.0,
        territoryWeight: 0.0,
        tanhScale: 2000.0,
        maxNonTerminalBound: 0.95
    },
    // 单变量 B: 仅增加目标推进势场
    b_push_only: {
        materialWeight: 1.0,
        goldWeight: 0.25,
        castleWeight: 150.0,
        townWeight: 75.0,
        pushWeight: 25.0,
        territoryWeight: 0.0,
        tanhScale: 2000.0,
        maxNonTerminalBound: 0.90
    },
    // 单变量 C: 仅增加控图估值
    c_territory_only: {
        materialWeight: 1.0,
        goldWeight: 0.25,
        castleWeight: 150.0,
        townWeight: 75.0,
        pushWeight: 0.0,
        territoryWeight: 15.0,
        tanhScale: 2000.0,
        maxNonTerminalBound: 0.90
    },
    // 组合版 B + C
    combined_push_territory: {
        materialWeight: 1.0,
        goldWeight: 0.25,
        castleWeight: 150.0,
        townWeight: 75.0,
        pushWeight: 25.0,
        territoryWeight: 10.0,
        tanhScale: 2000.0,
        maxNonTerminalBound: 0.90
    }
};

/**
 * 状态叶值评估器 v2 (支持真实地形通行成本推进势场与控图激励)
 * 严格保证：
 * 1. 自然终局绝对支配 (±1.0)；
 * 2. 非终局严格限制在 [-0.90, 0.90] 内；
 * 3. 推进距离基于 TacticalPathfinder 真实兵种移动力与地形成本，结合暴露风险控制；
 * 4. 固定 root 观察者联盟视角。
 */
export function evaluateStateValueV2(
    state: GameState,
    rootObserverAllianceId: number,
    weights: EvaluatorWeightsV2 = DEFAULT_EVALUATOR_WEIGHTS_V2
): number {
    // 1. 自然终局绝对支配
    const winner = state.winner;
    if (winner !== null) {
        if (winner === -1) return 0.0;
        if (winner === rootObserverAllianceId) return 1.0;
        return -1.0;
    }

    // 2. 双方军力
    let friendArmy = 0;
    let enemyArmy = 0;
    const friendUnits: Unit[] = [];
    const enemyUnits: Unit[] = [];

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

    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const uAlliance = getAllianceId(state, u.ownerId);
        if (uAlliance === rootObserverAllianceId) {
            friendUnits.push(u);
        } else {
            enemyUnits.push(u);
        }
    }
    const materialDiff = friendArmy - enemyArmy;

    // 3. 双方金币
    let friendGold = 0;
    let enemyGold = 0;
    for (const p of state.players) {
        if (!p.isAlive) continue;
        const pAlliance = getAllianceId(state, p.id);
        if (pAlliance === rootObserverAllianceId) friendGold += p.gold;
        else enemyGold += p.gold;
    }
    const goldDiff = friendGold - enemyGold;

    // 4. 双方建筑 (城堡与城镇)
    let friendCastles = 0;
    let enemyCastles = 0;
    let friendTowns = 0;
    let enemyTowns = 0;
    const enemyTargetPositions: Position[] = [];

    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            const cfg = getTileTerrainConfig(tile);
            if (tile.ownerId !== null && tile.ownerId !== undefined) {
                const tAlliance = getAllianceId(state, tile.ownerId);
                const isFriend = tAlliance === rootObserverAllianceId;

                if (cfg.key === 'castle') {
                    if (isFriend) friendCastles++;
                    else {
                        enemyCastles++;
                        enemyTargetPositions.push({ x, y });
                    }
                } else if (cfg.key === 'town' || cfg.key === 'damaged_town') {
                    if (isFriend) friendTowns++;
                    else {
                        enemyTowns++;
                        enemyTargetPositions.push({ x, y });
                    }
                }
            } else if (cfg.key === 'town' || cfg.key === 'damaged_town') {
                // 中立城镇也是推进争夺目标
                enemyTargetPositions.push({ x, y });
            }
        }
    }

    // 敌方指挥官也是核心推进斩首目标
    for (const eu of enemyUnits) {
        if (eu.unitClass === 'commander') {
            enemyTargetPositions.push(eu.pos);
        }
    }

    const castleDiff = friendCastles - enemyCastles;
    const townDiff = friendTowns - enemyTowns;

    // 5. 目标推进估值 (真实地形通行成本 + 暴露风险惩罚)
    let netPushScore = 0;
    if (weights.pushWeight > 0 && enemyTargetPositions.length > 0 && friendUnits.length > 0) {
        const pathfinder = new TacticalPathfinder(state);
        let totalPush = 0;
        let count = 0;

        for (const fu of friendUnits) {
            if (fu.hp < 25) continue; // 濒死单位不承担推进

            let minCost = Infinity;
            for (const tgt of enemyTargetPositions) {
                const c = pathfinder.cost(fu, fu.pos, tgt);
                if (c !== null && c < minCost) {
                    minCost = c;
                }
            }

            if (minCost < Infinity) {
                // 距离越近，推进势能越高；真实移动成本上限按 20 截断
                const pushPotential = Math.max(0, 20 - minCost);
                const hpWeight = fu.hp / 100;

                // 暴露风险惩罚：若深入敌阵且附近无友军掩护
                let nearbyFriends = 0;
                let nearbyEnemies = 0;
                for (const otherF of friendUnits) {
                    if (otherF.id !== fu.id && Math.abs(otherF.pos.x - fu.pos.x) + Math.abs(otherF.pos.y - fu.pos.y) <= 2) {
                        nearbyFriends++;
                    }
                }
                for (const otherE of enemyUnits) {
                    if (Math.abs(otherE.pos.x - fu.pos.x) + Math.abs(otherE.pos.y - fu.pos.y) <= 2) {
                        nearbyEnemies++;
                    }
                }

                // 孤立送兵风险
                const isolatedDanger = (nearbyEnemies > nearbyFriends + 1) ? 5.0 : 0.0;
                const unitPush = Math.max(0, pushPotential * hpWeight - isolatedDanger);

                totalPush += unitPush;
                count++;
            }
        }

        if (count > 0) {
            netPushScore = totalPush / count;
        }
    }

    // 6. 控图估值 (领地面积对比)
    let territoryDiff = 0;
    if (weights.territoryWeight > 0 && (friendUnits.length > 0 || enemyUnits.length > 0)) {
        let friendControlled = 0;
        let enemyControlled = 0;

        // 采样地图格子归属
        const step = 2; // 降采样步长提升计算吞吐
        for (let y = 0; y < state.map.height; y += step) {
            for (let x = 0; x < state.map.width; x += step) {
                let minFriendDist = Infinity;
                let minEnemyDist = Infinity;

                for (const fu of friendUnits) {
                    const d = Math.abs(fu.pos.x - x) + Math.abs(fu.pos.y - y);
                    if (d < minFriendDist) minFriendDist = d;
                }
                for (const eu of enemyUnits) {
                    const d = Math.abs(eu.pos.x - x) + Math.abs(eu.pos.y - y);
                    if (d < minEnemyDist) minEnemyDist = d;
                }

                if (minFriendDist < minEnemyDist) friendControlled++;
                else if (minEnemyDist < minFriendDist) enemyControlled++;
            }
        }
        territoryDiff = friendControlled - enemyControlled;
    }

    // 7. 综合加权
    const rawScore =
        materialDiff * weights.materialWeight +
        goldDiff * weights.goldWeight +
        castleDiff * weights.castleWeight +
        townDiff * weights.townWeight +
        netPushScore * weights.pushWeight +
        territoryDiff * weights.territoryWeight;

    // 8. 双曲正切平滑并严格限制上限
    const normalized = Math.tanh(rawScore / weights.tanhScale) * weights.maxNonTerminalBound;
    return normalized;
}
