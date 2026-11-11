import { getMoveCostForUnit, isFlying } from '../../src/game/abilities';
import { areAlliedPlayers } from '../../src/game/rule_config';
import { TacticalPathfinder } from '../../src/game/ai/tactical_pathfinding';
import type { GameState, Unit, Position } from '../../src/game/types';

/** 对固定目标集合做反向多源最短路；敌占格只允许作为终点。 */
class ReverseFinder {
    private distances = new Map<string, Float64Array>();
    constructor(private state: GameState, private unit: Unit) {}
    nearest(unit: Unit, targets: Position[]): number | null {
        const { width: w, height: h, tiles } = this.state.map;
        const key = targets.map(p => p.y * w + p.x).join(',');
        let distances = this.distances.get(key);
        if (!distances) {
            distances = new Float64Array(w * h).fill(Infinity);
            const blocked = new Set<number>(), occupants = new Set<number>();
            for (const other of this.state.units) {
                const index = other.pos.y * w + other.pos.x;
                if (other.hp <= 0 || occupants.has(index)) continue;
                occupants.add(index);
                if (!areAlliedPlayers(this.state, unit.ownerId, other.ownerId) && !(isFlying(unit) && !isFlying(other))) blocked.add(index);
            }
            const queue: number[] = [];
            for (const p of targets) if (p.x >= 0 && p.y >= 0 && p.x < w && p.y < h) {
                const index = p.y * w + p.x;
                if (distances[index] !== 0) { distances[index] = 0; queue.push(index); }
            }
            // 小地图使用无重复松弛队列，边权始终调用公共移动代价函数。
            const pending = new Set(queue);
            for (let offset = 0; offset < queue.length; offset++) {
                const index = queue[offset]; pending.delete(index);
                const x = index % w, y = Math.floor(index / w);
                const step = getMoveCostForUnit(this.state, this.unit, tiles[y][x]);
                if (!Number.isFinite(step) || step >= 999999) continue;
                for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                    const nx = x + dx, ny = y + dy, next = ny * w + nx;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked.has(next)) continue;
                    const value = distances[index] + step;
                    if (value < distances[next]) {
                        distances[next] = value;
                        if (!pending.has(next)) { pending.add(next); queue.push(next); }
                    }
                }
            }
            this.distances.set(key, distances);
        }
        const value = distances[unit.pos.y * w + unit.pos.x];
        return Number.isFinite(value) ? value : null;
    }
}

/** 缓存仅存活一个候选集合；状态签名覆盖地形、阻挡及兵种移动属性。 */
export class PathCache {
    private cache = new Map<string, ReverseFinder>();
    finder(state: GameState, unit: Unit) {
        const positions = new Set(state.units.filter(u => u.hp > 0).map(u => `${u.pos.x},${u.pos.y}`));
        if (positions.size !== state.units.filter(u => u.hp > 0).length) {
            const fallback = new TacticalPathfinder(state);
            return { nearest: (actor: Unit, targets: Position[]) => {
                const costs = targets.map(p => fallback.cost(actor, actor.pos, p)).filter(v => v !== null);
                return costs.length ? Math.min(...costs) : null;
            } };
        }
        const key = JSON.stringify([state.map, state.rules, unit.ownerId, unit.unitClass, unit.apkMoveOverrides,
            state.units.filter(u => u.id !== unit.id && u.hp > 0).map(u => [u.pos, u.ownerId, isFlying(u)])]);
        let finder = this.cache.get(key);
        if (!finder) { finder = new ReverseFinder(state, unit); this.cache.set(key, finder); }
        return finder;
    }
}
