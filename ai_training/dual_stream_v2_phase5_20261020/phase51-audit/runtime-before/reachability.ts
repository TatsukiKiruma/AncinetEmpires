import { getAttackBonus, getEffectiveStats } from '../../game/abilities';
import { TacticalPathfinder } from '../../game/ai/tactical_pathfinding';
import { isActivePlayer } from '../../game/rule_config';
import { calculateDamage } from '../../game/rules';
import { getTileDefenseBonus, getTileTerrainKey } from '../../game/terrain_rules';
import { isWaterTerrain } from '../../game/abilities';
import type { GameState, Position, Unit } from '../../game/types';

export interface UnitReach {
    unit: Unit;
    ready: boolean;
    origins: Position[];
    // 每个目标格分别保留近战/远程中地形攻击加成最大的来源格。
    bestOrigins: Int32Array;
    referenceDamage: Float32Array;
}

/** 缓存只属于本次编码；不依赖候选集合，不在可变状态对象上缓存。 */
export class ReachabilityContext {
    readonly units = new Map<string, UnitReach>();
    readonly paths: TacticalPathfinder;
    readonly area: number;
    constructor(readonly state: GameState) {
        this.area = state.map.width * state.map.height;
        this.paths = new TacticalPathfinder(state);
        const categories = new Map<string, number>(), tileCategories = new Int32Array(this.area);
        for (let idx = 0; idx < this.area; idx++) {
            const tile = state.map.tiles[Math.floor(idx / state.map.width)][idx % state.map.width];
            // 参考守军为无地形能力的士兵；伤害仅依赖防御、城镇和水面属性。
            const key = `${getTileDefenseBonus(tile)}:${getTileTerrainKey(tile) === 'town'}:${isWaterTerrain(tile)}`;
            if (!categories.has(key)) categories.set(key, categories.size);
            tileCategories[idx] = categories.get(key)!;
        }
        const pending = state.units.find(u => u.id === state.pendingUnitId);
        for (const unit of state.units) {
            if (unit.hp <= 0) continue;
            const self = unit.ownerId === state.currentPlayer;
            const locked = self && pending && pending.apkPendingRecruitSource !== 'empty_castle' && pending.id !== unit.id;
            const ready = isActivePlayer(state, unit.ownerId) && !unit.apkStatic && !locked && (!self || !unit.hasActed);
            const origins = ready && (!self || !unit.hasMoved) ? this.paths.reachablePositions(unit, getEffectiveStats(unit).move) : [unit.pos];
            const bestOrigins = new Int32Array(this.area * 2).fill(-1);
            const bestBonus = new Float32Array(this.area * 2).fill(-Infinity);
            const referenceDamage = new Float32Array(this.area);
            const reach = { unit, ready: Boolean(ready), origins, bestOrigins, referenceDamage };
            this.units.set(unit.id, reach);
            if (!ready) continue;
            const stats = getEffectiveStats(unit);
            if (stats.maxRange <= 0) continue;
            const attacker = { ...unit, pos: { ...unit.pos } };
            const defender: Unit = { id: '\u0000dual-reference', ownerId: -999, unitClass: 'soldier', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false };
            const view = { ...state, units: [attacker, defender] };
            const damageCache = new Map<number, Float64Array>();
            for (const origin of origins) {
                attacker.pos = origin;
                const bonus = getAttackBonus(view, attacker, defender);
                let cachedDamage = damageCache.get(bonus);
                if (!cachedDamage) { cachedDamage = new Float64Array(categories.size * 2).fill(NaN); damageCache.set(bonus, cachedDamage); }
                const originIdx = origin.y * state.map.width + origin.x;
                for (let dy = -stats.maxRange; dy <= stats.maxRange; dy++) {
                    const y = origin.y + dy;
                    if (y < 0 || y >= state.map.height) continue;
                    const span = stats.maxRange - Math.abs(dy);
                    for (let dx = -span; dx <= span; dx++) {
                        const distance = Math.abs(dx) + Math.abs(dy), x = origin.x + dx;
                        if (distance < stats.minRange || x < 0 || x >= state.map.width) continue;
                        const tileIdx = y * state.map.width + x, group = distance === 1 ? 0 : 1, k = tileIdx * 2 + group;
                        if (bonus <= bestBonus[k]) continue;
                        bestBonus[k] = bonus; bestOrigins[k] = originIdx;
                        defender.pos = { x, y };
                        const key = tileCategories[tileIdx] * 2 + group;
                        let damage = cachedDamage[key];
                        if (Number.isNaN(damage)) { damage = calculateDamage(view, attacker.id, defender.id); cachedDamage[key] = damage; }
                        referenceDamage[tileIdx] = Math.max(referenceDamage[tileIdx], damage / 100);
                    }
                }
            }
        }
    }

    projectedDamage(attacker: Unit, defender: Unit): number {
        const reach = this.units.get(attacker.id);
        if (!reach?.ready) return 0;
        const idx = (defender.pos.y * this.state.map.width + defender.pos.x) * 2;
        let damage = 0;
        for (let group = 0; group < 2; group++) {
            const origin = reach.bestOrigins[idx + group];
            if (origin < 0) continue;
            const projected = { ...attacker, pos: { x: origin % this.state.map.width, y: Math.floor(origin / this.state.map.width) } };
            damage = Math.max(damage, calculateDamage({ ...this.state, units: [projected, defender] }, projected.id, defender.id));
        }
        return damage;
    }
}
