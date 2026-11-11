import { getMoveCostForUnit, isFlying } from '../abilities';
import { areAlliedPlayers } from '../rule_config';
import type { GameState, Position, Unit } from '../types';
import { getReachablePositions } from '../map';

interface QueueEntry { index: number; cost: number }

/** 数值最小堆，避免每取出一个格子就重新排序整个队列。 */
class MinHeap {
    private items: QueueEntry[] = [];

    push(entry: QueueEntry) {
        let index = this.items.length;
        this.items.push(entry);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.items[parent].cost <= entry.cost) break;
            this.items[index] = this.items[parent];
            index = parent;
        }
        this.items[index] = entry;
    }

    pop(): QueueEntry | undefined {
        const first = this.items[0];
        const last = this.items.pop();
        if (!last || this.items.length === 0) return first;
        let index = 0;
        while (index * 2 + 1 < this.items.length) {
            let child = index * 2 + 1;
            if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child += 1;
            if (this.items[child].cost >= last.cost) break;
            this.items[index] = this.items[child];
            index = child;
        }
        this.items[index] = last;
        return first;
    }
}

/** 仅供一个不可变局面的战术评分使用；不能跨引擎 step 复用。 */
export class TacticalPathfinder {
    private readonly occupants = new Map<number, Unit>();
    private readonly distances = new Map<string, Float64Array>();
    private readonly targetDistances = new Map<string, Float64Array>();
    private readonly terrainCosts = new Map<string, Float64Array>();
    private readonly needsMovementFallback: boolean;

    constructor(private readonly state: GameState) {
        this.needsMovementFallback = state.units.some(u => u.hp <= 0) || new Set(state.units.map(u => this.index(u.pos))).size !== state.units.length;
        for (const unit of state.units) {
            const index = this.index(unit.pos);
            // 与原先 units.find 一致，堆叠格保留第一个存活单位。
            if (unit.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit);
        }
    }

    /** 共享最短路表的可停留格查询；复杂堆叠仍使用原权威查询保留最后占位语义。 */
    reachablePositions(unit: Unit, maxMove: number): Position[] {
        if (this.needsMovementFallback) return getReachablePositions(this.state, unit.id, maxMove);
        const key = `${unit.id}:${unit.pos.x},${unit.pos.y}`;
        let costs = this.distances.get(key);
        if (!costs) { costs = this.buildDistances(unit, unit.pos); this.distances.set(key, costs); }
        const result: Position[] = [], start = this.index(unit.pos), width = this.state.map.width;
        for (let idx = 0; idx < costs.length; idx++) if (costs[idx] <= maxMove && (idx === start || !this.occupants.has(idx))) result.push({ x: idx % width, y: Math.floor(idx / width) });
        return result;
    }

    private index(pos: Position) { return pos.y * this.state.map.width + pos.x; }

    cost(unit: Unit, from: Position, target: Position): number | null {
        if (from.x === target.x && from.y === target.y) return 0;
        const { width, height } = this.state.map;
        if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
        const key = `${unit.id}:${from.x},${from.y}`;
        let costs = this.distances.get(key);
        if (!costs) {
            costs = this.buildDistances(unit, from);
            this.distances.set(key, costs);
        }
        const cost = costs[this.index(target)];
        return Number.isFinite(cost) ? cost : null;
    }

    /** 多个候选落点查询同一目标时反向展开一次；进入格代价和占位边界与cost完全相同。 */
    costToTarget(unit: Unit, from: Position, target: Position): number | null {
        if (from.x === target.x && from.y === target.y) return 0;
        const { width, height, tiles } = this.state.map;
        if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
        const key = `${unit.id}:${target.x},${target.y}`;
        let costs = this.targetDistances.get(key);
        if (!costs) {
            costs = new Float64Array(width * height).fill(Infinity);
            const targetIndex = this.index(target), flying = isFlying(unit), queue = new MinHeap();
            costs[targetIndex] = 0;
            queue.push({ index: targetIndex, cost: 0 });
            let current: QueueEntry | undefined;
            while ((current = queue.pop())) {
                if (current.cost > costs[current.index]) continue;
                const occupying = this.occupants.get(current.index);
                // 被阻挡格可作查询起点或终点，但不可成为中间穿行格。
                if (current.index !== targetIndex && occupying && !areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId)
                    && !(flying && !isFlying(occupying))) continue;
                const x = current.index % width, y = Math.floor(current.index / width);
                const stepCost = getMoveCostForUnit(this.state, unit, tiles[y][x]);
                if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
                for (let direction = 0; direction < 4; direction++) {
                    if (direction === 0 && y + 1 >= height || direction === 1 && y === 0 || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
                    const next = current.index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
                    const cost = current.cost + stepCost;
                    if (cost < costs[next]) { costs[next] = cost; queue.push({ index: next, cost }); }
                }
            }
            this.targetDistances.set(key, costs);
        }
        const cost = costs[this.index(from)];
        return Number.isFinite(cost) ? cost : null;
    }

    private buildDistances(unit: Unit, from: Position): Float64Array {
        const { width, height, tiles } = this.state.map;
        const costs = new Float64Array(width * height).fill(Infinity);
        const start = this.index(from);
        costs[start] = 0;
        const queue = new MinHeap();
        queue.push({ index: start, cost: 0 });
        const flying = isFlying(unit);
        // 移动规则只读取兵种、移动覆盖和目标地形；同局同类单位共享静态代价表。
        const terrainKey = JSON.stringify([unit.unitClass, unit.apkMoveOverrides ?? null]);
        let terrainCosts = this.terrainCosts.get(terrainKey);
        if (!terrainCosts) {
            terrainCosts = new Float64Array(width * height);
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) terrainCosts[y * width + x] = getMoveCostForUnit(this.state, unit, tiles[y][x]);
            this.terrainCosts.set(terrainKey, terrainCosts);
        }
        let maxStep = 0;
        for (const cost of terrainCosts) {
            if (!Number.isInteger(cost) || cost < 0 || cost > 32) { maxStep = -1; break; }
            maxStep = Math.max(maxStep, cost);
        }
        // 官方整数地形使用Dial桶队列；小数或极端脚本代价仍走通用最小堆。
        if (maxStep >= 0) {
            const buckets: number[][] = Array.from({ length: maxStep + 1 }, () => []);
            const blocked = new Uint8Array(width * height);
            for (const [index, occupying] of this.occupants) if (!areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId) && !(flying && !isFlying(occupying))) blocked[index] = 1;
            buckets[0].push(start);
            let pending = 1, distance = 0;
            while (pending > 0) {
                const bucket = buckets[distance % buckets.length];
                if (!bucket.length) { distance++; continue; }
                const index = bucket.pop()!; pending--;
                if (costs[index] !== distance || index !== start && blocked[index]) continue;
                const x = index % width;
                for (let direction = 0; direction < 4; direction++) {
                    if (direction === 0 && index + width >= costs.length || direction === 1 && index < width || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
                    const next = index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
                    const nextCost = distance + terrainCosts[next];
                    if (nextCost < costs[next]) { costs[next] = nextCost; buckets[nextCost % buckets.length].push(next); pending++; }
                }
            }
            return costs;
        }
        let current: QueueEntry | undefined;
        while ((current = queue.pop())) {
            if (current.cost > costs[current.index]) continue;
            const occupying = this.occupants.get(current.index);
            // 敌军占位可以作为目标到达，但不能继续穿过；起点必须允许离开。
            // 这与旧实现“仅对当前查询的终点豁免占位阻挡”等价。
            if (current.index !== start && occupying
                && !areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId)
                && !(flying && !isFlying(occupying))) continue;
            const x = current.index % width;
            const y = Math.floor(current.index / width);
            for (let direction = 0; direction < 4; direction++) {
                if (direction === 0 && y + 1 >= height || direction === 1 && y === 0 || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
                const next = current.index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
                const stepCost = terrainCosts[next];
                if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
                const nextCost = current.cost + stepCost;
                if (nextCost < costs[next]) {
                    costs[next] = nextCost;
                    queue.push({ index: next, cost: nextCost });
                }
            }
        }
        return costs;
    }
}
