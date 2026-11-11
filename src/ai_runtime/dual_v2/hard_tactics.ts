import { getEffectiveStats, hasAbility } from '../../game/abilities';
import { areAlliedPlayers, getNumericRule, getTileIncome, getUnitCost, isCommanderUnit } from '../../game/rule_config';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { GameState, Position, Unit } from '../../game/types';
import { ReachabilityContext } from './reachability';

export const positionKey = (p: Position) => `${p.x},${p.y}`;
export const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const unitValue = (state: GameState, u: Unit) => (getUnitCost(state, u.ownerId, u.unitClass) ?? 300) * (1 + (u.level ?? 0) * .15) + (isCommanderUnit(state, u) ? 500 : 0);
export interface BuildingGoal extends Position { priority: number; turns?: number }

/** 路径允许以有守军的建筑为终点；不把守军暂时占位误当作永久安全。 */
export function hardTacticalContext(state: GameState, context: ReachabilityContext) {
    const self = state.currentPlayer, own = state.units.filter(u => u.hp > 0 && areAlliedPlayers(state, self, u.ownerId));
    const enemies = state.units.filter(u => u.hp > 0 && !areAlliedPlayers(state, self, u.ownerId));
    const ownCastles: Position[] = [], ownBuildings: { pos: Position; castle: boolean }[] = [], goals: BuildingGoal[] = [];
    let allyIncome = 0, enemyIncome = 0;
    const friendlyCastles: Position[] = [], enemyCastles: Position[] = [];
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x], key = getTileTerrainKey(tile), pos = { x, y };
        const friendly = tile.ownerId !== null && areAlliedPlayers(state, self, tile.ownerId);
        if (friendly) allyIncome += getTileIncome(state, tile); else if (tile.ownerId !== null) enemyIncome += getTileIncome(state, tile);
        if (key === 'castle') (friendly ? friendlyCastles : tile.ownerId !== null ? enemyCastles : []).push(pos);
        if (friendly && (key === 'castle' || key === 'town')) {
            ownBuildings.push({ pos, castle: key === 'castle' });
            if (key === 'castle') ownCastles.push(pos);
        } else if (!friendly && (key === 'castle' || key === 'town' || key === 'damaged_town')) {
            goals.push({ ...pos, priority: key === 'castle' ? tile.ownerId === null ? 0 : 3 : key === 'town' ? 1 : 2 });
        }
    }
    for (const u of [...own, ...enemies]) if (isCommanderUnit(state, u)) {
        const income = getNumericRule(state, 'incomeCommanderBase') + (u.level ?? 0) * getNumericRule(state, 'incomeCommanderGrowth');
        if (areAlliedPlayers(state, self, u.ownerId)) allyIncome += income; else enemyIncome += income;
    }
    const gold = (allied: boolean) => state.players.filter(p => p.isAlive && areAlliedPlayers(state, self, p.id) === allied).reduce((s, p) => s + p.gold, 0);
    const situation = (own.reduce((s, u) => s + unitValue(state, u), 0) + gold(true)) / Math.max(1, enemies.reduce((s, u) => s + unitValue(state, u), 0) + gold(false) + enemyIncome / 2);
    const threatenedOwnCastles = new Set<string>(), immediateCastles = new Set<string>(), threatSourcePositions = new Set<string>();
    for (const enemy of enemies) {
        if (enemy.apkStatic) continue;
        const move = getEffectiveStats(enemy).move;
        for (const { pos, castle } of ownBuildings) {
            const cost = context.paths.cost(enemy, enemy.pos, pos);
            const defender = own.find(u => distance(u.pos, pos) === 0);
            if (defender && context.projectedDamage(enemy, defender) > 0) threatSourcePositions.add(positionKey(enemy.pos));
            if (cost === null || cost > move * 2 || !(castle ? hasAbility(enemy, 'castle_capturer') : hasAbility(enemy, 'village_capturer'))) continue;
            threatSourcePositions.add(positionKey(enemy.pos));
            if (castle) {
                threatenedOwnCastles.add(positionKey(pos));
                if (cost <= move) immediateCastles.add(positionKey(pos));
            }
        }
    }
    const assignments = new Map<string, BuildingGoal>(), used = new Set<string>();
    // 已在目标上的友方占领者预留建筑，避免其它单位反复赶往同一目标。
    for (const u of own) if (hasAbility(u, 'village_capturer') || hasAbility(u, 'castle_capturer') || hasAbility(u, 'repairer')) {
        const goal = goals.find(g => distance(u.pos, g) === 0);
        if (goal) { assignments.set(u.id, goal); used.add(positionKey(goal)); }
    }
    const expansion = situation < 1.3 ? 0 : 1 + Math.floor((situation - 1.3) / .2);
    const castleDistance = (positions: Position[], pos: Position) => Math.min(Infinity, ...positions.map(p => distance(p, pos)));
    const capturers = own.filter(u => u.ownerId === self && !u.hasActed && !u.apkStatic && (hasAbility(u, 'castle_capturer') || hasAbility(u, 'village_capturer') || hasAbility(u, 'repairer')))
        .sort((a, b) => Number(hasAbility(b, 'castle_capturer')) - Number(hasAbility(a, 'castle_capturer')) || a.id.localeCompare(b.id));
    for (const u of capturers) {
        if (assignments.has(u.id)) continue;
        const candidates = goals.filter(g => !used.has(positionKey(g)) && (g.priority === 0 || g.priority === 3 ? hasAbility(u, 'castle_capturer') : g.priority === 2 ? hasAbility(u, 'repairer') : hasAbility(u, 'village_capturer')))
            .map(g => ({ ...g, cost: context.paths.cost(u, u.pos, g), safe: castleDistance(enemyCastles, g) + expansion >= castleDistance(friendlyCastles, g) }))
            .filter(g => g.cost !== null).sort((a, b) => Number(b.safe) - Number(a.safe) || a.priority - b.priority || a.cost! / getEffectiveStats(u).move - b.cost! / getEffectiveStats(u).move);
        if (candidates[0]) { assignments.set(u.id, candidates[0]); used.add(positionKey(candidates[0])); }
    }
    const reservedVillages = new Set<string>();
    for (const goal of goals.filter(g => g.priority === 1)) {
        if (state.units.some(u => distance(u.pos, goal) === 0)) continue;
        if (capturers.some(u => hasAbility(u, 'village_capturer') && context.units.get(u.id)?.ready && context.units.get(u.id)!.origins.some(p => distance(p, goal) === 0))) reservedVillages.add(positionKey(goal));
    }
    return { own, enemies, ownCastles, goals, situation, allyIncome, enemyIncome, assignments, threatenedOwnCastles, immediateCastles, threatSourcePositions, reservedVillages };
}
export type HardTacticalContext = ReturnType<typeof hardTacticalContext>;
