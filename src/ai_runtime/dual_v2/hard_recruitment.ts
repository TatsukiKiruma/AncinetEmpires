import { getEffectiveStats, hasAbility, isWaterTerrain } from '../../game/abilities';
import { UNIT_CONFIGS } from '../../game/constants';
import { canRecruitUnitClass, getUnitCost } from '../../game/rule_config';
import { getLegalActions } from '../../game/rules';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { Action, GameState, Position, Unit } from '../../game/types';
import { TacticalPathfinder } from '../../game/ai/tactical_pathfinding';
import { distance, positionKey, type HardTacticalContext } from './hard_tactics';
import { hardAttackValue } from './hard_combat';

type Recruit = Extract<Action, { type: 'recruit_to_castle' | 'recruit_and_deploy' }>;
export function canStillRecruitAtCastle(state: GameState, pos: Position, legal: readonly Action[]) {
    const resident = state.units.find(u => distance(u.pos, pos) === 0);
    const exit = legal.find(a => a.type === 'move' && a.unitId === resident?.id);
    const view = { ...state, pendingUnitId: undefined, units: state.units.filter(u => u.id !== resident?.id) };
    if (resident && !exit) return false;
    return getLegalActions(view, state.currentPlayer, { skipMovement: true }).some(a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && distance(a.castlePos, pos) === 0 && canRecruitUnitClass(state, state.currentPlayer, a.unitClass));
}

/** 多职能兵种同时进入搜索；按地形、扩张缺口、敌军克制和新兵完整行动估值。 */
export function hardRecruitValue(state: GameState, action: Recruit, hard: HardTacticalContext, cache: Map<string, number>) {
    const key = `${action.unitClass}:${positionKey(action.castlePos)}`, cached = cache.get(key);
    if (cached !== undefined) return cached;
    const own = hard.own.filter(u => u.ownerId === state.currentPlayer), count = own.filter(u => u.unitClass === action.unitClass).length;
    const config = UNIT_CONFIGS[action.unitClass], unit: Unit = { id: '\u0000hard-recruit', unitClass: action.unitClass, ownerId: state.currentPlayer, hp: 100, maxHp: 100, pos: action.castlePos, hasActed: false, hasMoved: false };
    let score = 3 - count * 1.4;
    const water = state.map.tiles.flat().filter(isWaterTerrain).length / (state.map.width * state.map.height);
    const nearbyWater = state.map.tiles.some((row, y) => row.some((tile, x) => distance({ x, y }, action.castlePos) <= 3 && isWaterTerrain(tile) && hard.enemies.some(e => distance(e.pos, { x, y }) <= 4)));
    if (action.unitClass === 'mermaid' && water < .2 && !nearbyWater) score -= 35;
    if (hasAbility(unit, 'water_child') && water >= .3) score += 3;
    const villages = hard.goals.filter(g => g.priority === 1).length, soldiers = own.filter(u => u.unitClass === 'soldier').length;
    if ((state.turn <= 3 || villages > soldiers) && soldiers < Math.min(4, Math.max(2, villages))) {
        if (action.unitClass === 'soldier') score += 9;
        else if (getEffectiveStats(unit).move >= 5 && hasAbility(unit, 'village_capturer')) score += 5;
    }
    for (const enemy of hard.enemies) {
        if (hasAbility(enemy, 'flying') && (action.unitClass === 'archer' || action.unitClass === 'wolf_archer')) score += 4;
        if ((enemy.unitClass === 'golem' || enemy.unitClass === 'paladin') && (action.unitClass === 'water_elemental' || action.unitClass === 'dark_mage')) score += 3;
        if (hasAbility(enemy, 'undead') && (action.unitClass === 'paladin' || action.unitClass === 'witch')) score += 3;
        if ((enemy.unitClass === 'wolf' || enemy.unitClass === 'dark_mage') && (action.unitClass === 'wolf' || action.unitClass === 'dragon')) score += 2;
    }
    if (hard.threatenedOwnCastles.has(positionKey(action.castlePos))) score += 16 + Math.min(config.physicalDefense, config.magicDefense) / 5;
    const view = { ...state, pendingUnitId: undefined, units: [...state.units, unit] }, paths = new TacticalPathfinder(view);
    let complete = 0;
    for (const pos of paths.reachablePositions(unit, config.move)) {
        const moved = { ...unit, pos, hasMoved: true }, projected = { ...view, units: [...state.units, moved] };
        for (const follow of getLegalActions(projected, state.currentPlayer, { unitId: unit.id, skipMovement: true, skipRecruitment: true })) {
            if (follow.type === 'capture') complete = Math.max(complete, getTileTerrainKey(state.map.tiles[pos.y][pos.x]) === 'castle' ? 120 : 12);
            if (follow.type === 'attack') complete = Math.max(complete, hardAttackValue(projected, moved, state.units.find(u => u.id === follow.targetId)!, hard));
        }
    }
    score += complete * .7;
    score -= Math.max(0, (getUnitCost(state, state.currentPlayer, action.unitClass) ?? 0) - 300) / 300;
    cache.set(key, score); return score;
}
