import { getMoveCostForUnit, isFlying } from '../../game/abilities';
import { TacticalPathfinder } from '../../game/ai/tactical_pathfinding';
import { areAlliedPlayers } from '../../game/rule_config';
import type { GameState, Position, Unit } from '../../game/types';

/** 同一不可变反扑局面按目标反向建表，避免每个移动落点重算全图。 */
export class RetaliationGoalPaths extends TacticalPathfinder {
    private readonly tables = new Map<string, Float64Array>();
    private readonly profiles = new Map<string, { terrain: Float64Array; blocked: Uint8Array; maximum: number }>();
    constructor(private readonly snapshot: GameState) { super(snapshot); }
    override cost(unit: Unit, from: Position, target: Position): number | null {
        if (from.x === target.x && from.y === target.y) return 0;
        const state = this.snapshot, { width, height } = state.map;
        if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
        const key = JSON.stringify([unit.unitClass, unit.apkMoveOverrides ?? null, unit.ownerId, isFlying(unit)]);
        let profile = this.profiles.get(key);
        if (!profile) {
            const terrain = Float64Array.from(state.map.tiles.flat(), tile => getMoveCostForUnit(state, unit, tile));
            const blocked = new Uint8Array(width * height), occupants = new Set<number>();
            for (const other of state.units) if (other.hp > 0) {
                const index = other.pos.y * width + other.pos.x;
                if (occupants.has(index)) continue;
                occupants.add(index);
                if (!areAlliedPlayers(state, unit.ownerId, other.ownerId) && !(isFlying(unit) && !isFlying(other))) blocked[index] = 1;
            }
            let maximum = 0;
            for (const value of terrain) {
                if (!Number.isInteger(value) || value < 0 || value > 32) { maximum = -1; break; }
                maximum = Math.max(maximum, value);
            }
            profile = { terrain, blocked, maximum }; this.profiles.set(key, profile);
        }
        // 非整数或极端地形严格回退既有通用实现，不改动共享数值管线。
        if (profile.maximum < 0) return super.cost(unit, from, target);
        const end = target.y * width + target.x, tableKey = `${key}:${end}`;
        let distances = this.tables.get(tableKey);
        if (!distances) {
            distances = new Float64Array(width * height).fill(Infinity); distances[end] = 0;
            const buckets: number[][] = Array.from({ length: profile.maximum + 1 }, () => []);
            buckets[0].push(end);
            let pending = 1, distance = 0;
            while (pending > 0) {
                const bucket = buckets[distance % buckets.length];
                if (!bucket.length) { distance++; continue; }
                const index = bucket.pop()!; pending--;
                // 原正向查询可到敌占终点、可从敌占起点离开，但不得穿过敌占中间格。
                if (distances[index] !== distance || index !== end && profile.blocked[index]) continue;
                const x = index % width, nextCost = distance + profile.terrain[index];
                for (let direction = 0; direction < 4; direction++) {
                    if (direction === 0 && index + width >= distances.length || direction === 1 && index < width || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
                    const previous = index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
                    if (nextCost < distances[previous]) { distances[previous] = nextCost; buckets[nextCost % buckets.length].push(previous); pending++; }
                }
            }
            this.tables.set(tableKey, distances);
        }
        const value = distances[from.y * width + from.x];
        return Number.isFinite(value) ? value : null;
    }
}
