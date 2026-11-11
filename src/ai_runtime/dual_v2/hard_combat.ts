import { getDefenseBonus, getEffectiveStats, hasAbility } from '../../game/abilities';
import { calculateDamage, estimateCounterDamage, getLegalActions } from '../../game/rules';
import { areAlliedPlayers, isCommanderUnit } from '../../game/rule_config';
import { getTileDefenseBonus, getTileTerrainKey } from '../../game/terrain_rules';
import type { GameState, Unit } from '../../game/types';
import { UNIT_CONFIGS } from '../../game/constants';
import { distance, positionKey, unitValue, type HardTacticalContext } from './hard_tactics';

/** 困难版集火三系数；真实伤害、反击和防御修正均读取公共规则。 */
export function hardAttackValue(state: GameState, u: Unit, target: Unit, hard: HardTacticalContext): number {
    const damage = Math.min(target.hp, calculateDamage(state, u.id, target.id));
    const mean = (units: Unit[]) => units.reduce((s, v) => s + distance(v.pos, target.pos), 0) / Math.max(1, units.length);
    const range = 1 + Math.max(-2, Math.min(2, mean(hard.enemies.filter(v => v.id !== target.id)) - mean(hard.own))) / 10;
    const hp = 1 + Math.max(100 - target.hp, -50) / 100;
    const stats = getEffectiveStats(target), realDefense = UNIT_CONFIGS[u.unitClass].attackType === 'magic' ? stats.magicDefense : stats.physicalDefense;
    const defense = 1 + (realDefense + getDefenseBonus(state, u, target) + getTileDefenseBonus(state.map.tiles[target.pos.y][target.pos.x])) / 100;
    let score = damage / 100 * Math.max(.4, unitValue(state, target) / 400) * range * hp * defense * 3;
    if (damage >= target.hp) score += isCommanderUnit(state, target) ? 32 : 7;
    if (damage < target.hp && !target.status) {
        if (hasAbility(u, 'blinder')) score += 2 + unitValue(state, target) / 300;
        if (hasAbility(u, 'poisoner')) score += 2 + unitValue(state, target) / 600;
    }
    if (hasAbility(u, 'summoner') && damage < target.hp) score -= 2;
    score -= estimateCounterDamage(state, u.id, target.id) / Math.max(25, u.hp) * (isCommanderUnit(state, u) ? 6 : 2);
    return score * (hard.threatSourcePositions.has(positionKey(target.pos)) ? 1.9 : 1);
}

export function hardHealValue(state: GameState, target: Unit, hard: HardTacticalContext) {
    const maximum = Math.max(1, getEffectiveStats(target).maxHp), missing = Math.max(0, maximum - target.hp) / maximum;
    const key = positionKey(target.pos), critical = isCommanderUnit(state, target) && target.hp < maximum / 2 || hard.threatenedOwnCastles.has(key);
    return missing * (3 + unitValue(state, target) / 100) * (critical ? 2.5 : 1);
}

/** 支援只展开受援者的一次移动和即时行动，禁止递归支援造成评分环。 */
export function hardSupportValue(state: GameState, target: Unit, hard: HardTacticalContext) {
    const restored = { ...target, hasMoved: false, hasActed: false, hasBeenSupportedThisTurn: true, hasPostAttackMoved: false, movementRemaining: undefined };
    const base = { ...state, pendingUnitId: undefined, units: state.units.map(u => u.id === target.id ? restored : u) };
    const first = getLegalActions(base, state.currentPlayer, { unitId: target.id, skipRecruitment: true });
    let best = 0;
    const immediate = (view: GameState, actor: Unit) => {
        for (const a of getLegalActions(view, state.currentPlayer, { unitId: actor.id, skipMovement: true, skipRecruitment: true })) {
            if (a.type === 'attack') best = Math.max(best, hardAttackValue(view, actor, view.units.find(u => u.id === a.targetId)!, hard));
            if (a.type === 'capture') best = Math.max(best, getTileTerrainKey(view.map.tiles[actor.pos.y][actor.pos.x]) === 'castle' ? 120 : 14);
            if (a.type === 'repair') best = Math.max(best, 8);
        }
    };
    immediate(base, restored);
    for (const a of first) if (a.type === 'move') {
        const moved = { ...restored, pos: a.to, hasMoved: true };
        immediate({ ...base, units: base.units.map(u => u.id === target.id ? moved : u) }, moved);
    }
    return best > 0 ? best * .9 + 1 : 0;
}

export function auraPositionValue(state: GameState, u: Unit) {
    if (!['attack_aura', 'cleansing_aura', 'weakness_aura'].some(a => hasAbility(u, a as 'attack_aura'))) return 0;
    return state.units.filter(v => v.id !== u.id && distance(u.pos, v.pos) <= 2).reduce((s, v) => {
        const allied = areAlliedPlayers(state, u.ownerId, v.ownerId);
        return s + (allied && (hasAbility(u, 'attack_aura') || hasAbility(u, 'cleansing_aura')) || !allied && hasAbility(u, 'weakness_aura') ? 1 + unitValue(state, v) / 800 : 0);
    }, 0);
}
