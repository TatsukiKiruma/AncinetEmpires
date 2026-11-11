import type { Action, GameState, Unit } from '../../src/game/types';

/** 采样器预登记的互斥目标槽位；同一状态可以同时命中多个特殊类别。 */
export type WindowCategory =
    | 'attack_combo'
    | 'commander_risk'
    | 'economy'
    | 'endgame'
    | 'ordinary';

/**
 * 收官阶段的公开定义。只看根状态的公开回合号，不使用对局结果或搜索结果。
 * 采用较保守的第 20 回合阈值，避免小地图开局单位少时被误标为收官。
 */
export const ENDGAME_TURN_MIN = 20;

export interface WindowFeatures {
    eligible: boolean;
    legalActionCount: number;
    attackCount: number;
    recruitToCastleCount: number;
    recruitAndDeployCount: number;
    captureCount: number;
    multiAttackerTargetCount: number;
    commanderAttackCount: number;
    lowHpOwnCommanderAttackCount: number;
    hasAttackCombo: boolean;
    hasCommanderRisk: boolean;
    hasRecruit: boolean;
    hasCapture: boolean;
    hasEconomy: boolean;
    isEndgame: boolean;
    isOrdinary: boolean;
    categories: WindowCategory[];
}

/**
 * 每个开发/封存四家族使用相同槽位：前三槽固定为攻击组合、指挥官风险、经济；
 * 第四槽按地图预登记为收官或普通。五图合计每组目标数为 5/5/5/3/2。
 */
export function targetCategoryForFamily(s: number, mapIndex = 0): WindowCategory {
    const slot = ((s % 4) + 4) % 4;
    if (slot === 0) return 'attack_combo';
    if (slot === 1) return 'commander_risk';
    if (slot === 2) return 'economy';
    return mapIndex === 1 || mapIndex === 3 ? 'ordinary' : 'endgame';
}

/**
 * 各目标的固定降级顺序。该顺序在跑对局前只由 s 决定，不查看搜索胜负或终局胜负。
 */
export function categoryPriority(target: WindowCategory): readonly WindowCategory[] {
    switch (target) {
        case 'attack_combo':
            return ['attack_combo', 'commander_risk', 'economy', 'endgame', 'ordinary'];
        case 'commander_risk':
            return ['commander_risk', 'attack_combo', 'economy', 'endgame', 'ordinary'];
        case 'economy':
            return ['economy', 'attack_combo', 'commander_risk', 'endgame', 'ordinary'];
        case 'endgame':
            return ['endgame', 'ordinary', 'economy', 'attack_combo', 'commander_risk'];
        case 'ordinary':
            return ['ordinary', 'endgame', 'economy', 'attack_combo', 'commander_risk'];
    }
}

function isCommander(state: GameState, unit: Unit): boolean {
    const configured = state.rules?.commanderUnitIds?.[unit.ownerId];
    return unit.unitClass === 'commander' || configured === unit.id;
}

/**
 * 从真实结构化合法动作识别窗口特征。
 *
 * - 攻击组合：至少两个不同攻击者可以攻击同一目标。
 * - 指挥官风险（保守口径）：本步可直接攻击任一指挥官；或己方半血及以下指挥官
 *   本步亲自参与攻击。这里只识别即时、可证实的交战风险，不推断未来路径。
 * - 经济：存在两种真实招募动作之一，或存在占城动作。
 * - 收官：回合号 >= 20。
 * - 普通：合法动作至少 2 个，且不命中上述任一特殊类别。
 */
export function identifyWindowFeatures(state: GameState, legalActions: readonly Action[]): WindowFeatures {
    const actions = legalActions.filter((action) => action.type !== 'surrender');
    const units = new Map(state.units.map((unit) => [unit.id, unit]));
    const attackersByTarget = new Map<string, Set<string>>();
    let attackCount = 0;
    let recruitToCastleCount = 0;
    let recruitAndDeployCount = 0;
    let captureCount = 0;
    let commanderAttackCount = 0;
    let lowHpOwnCommanderAttackCount = 0;

    for (const action of actions) {
        if (action.type === 'attack') {
            attackCount += 1;
            const attackers = attackersByTarget.get(action.targetId) ?? new Set<string>();
            attackers.add(action.attackerId);
            attackersByTarget.set(action.targetId, attackers);

            const target = units.get(action.targetId);
            if (target && isCommander(state, target)) commanderAttackCount += 1;
            const attacker = units.get(action.attackerId);
            if (
                attacker
                && attacker.ownerId === state.currentPlayer
                && isCommander(state, attacker)
                && attacker.hp * 2 <= attacker.maxHp
            ) {
                lowHpOwnCommanderAttackCount += 1;
            }
        } else if (action.type === 'recruit_to_castle') {
            recruitToCastleCount += 1;
        } else if (action.type === 'recruit_and_deploy') {
            recruitAndDeployCount += 1;
        } else if (action.type === 'capture') {
            captureCount += 1;
        }
    }

    const eligible = state.winner === null && actions.length >= 2;
    const multiAttackerTargetCount = [...attackersByTarget.values()]
        .filter((attackers) => attackers.size >= 2).length;
    const hasAttackCombo = eligible && multiAttackerTargetCount > 0;
    const hasCommanderRisk = eligible && (commanderAttackCount > 0 || lowHpOwnCommanderAttackCount > 0);
    const hasRecruit = recruitToCastleCount > 0 || recruitAndDeployCount > 0;
    const hasCapture = captureCount > 0;
    const hasEconomy = eligible && (hasRecruit || hasCapture);
    const isEndgame = eligible && state.turn >= ENDGAME_TURN_MIN;
    const isOrdinary = eligible && !hasAttackCombo && !hasCommanderRisk && !hasEconomy && !isEndgame;
    const categories: WindowCategory[] = [];
    if (hasAttackCombo) categories.push('attack_combo');
    if (hasCommanderRisk) categories.push('commander_risk');
    if (hasEconomy) categories.push('economy');
    if (isEndgame) categories.push('endgame');
    if (isOrdinary) categories.push('ordinary');

    return {
        eligible,
        legalActionCount: actions.length,
        attackCount,
        recruitToCastleCount,
        recruitAndDeployCount,
        captureCount,
        multiAttackerTargetCount,
        commanderAttackCount,
        lowHpOwnCommanderAttackCount,
        hasAttackCombo,
        hasCommanderRisk,
        hasRecruit,
        hasCapture,
        hasEconomy,
        isEndgame,
        isOrdinary,
        categories,
    };
}
