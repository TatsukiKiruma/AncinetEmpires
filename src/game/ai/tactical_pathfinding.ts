import { getMoveCostForUnit, isFlying } from '../abilities';
import { areAlliedPlayers } from '../rule_config';
import type { GameState, Position, Unit } from '../types';

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

    constructor(private readonly state: GameState) {
        for (const unit of state.units) {
            const index = this.index(unit.pos);
            // 与原先 units.find 一致，堆叠格保留第一个存活单位。
            if (unit.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit);
        }
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

    private buildDistances(unit: Unit, from: Position): Float64Array {
        const { width, height, tiles } = this.state.map;
        const costs = new Float64Array(width * height).fill(Infinity);
        const start = this.index(from);
        costs[start] = 0;
        const queue = new MinHeap();
        queue.push({ index: start, cost: 0 });
        const flying = isFlying(unit);
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
            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const stepCost = getMoveCostForUnit(this.state, { ...unit, pos: { x, y } }, tiles[ny][nx]);
                if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
                const nextCost = current.cost + stepCost;
                const next = ny * width + nx;
                if (nextCost < costs[next]) {
                    costs[next] = nextCost;
                    queue.push({ index: next, cost: nextCost });
                }
            }
        }
        return costs;
    }
}
