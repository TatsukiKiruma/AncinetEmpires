import { GameState, Position, UnitClass } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { isFlying, getMoveCostForUnit } from './abilities';

// 计算曼哈顿距离
export function getDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// 检查是否在地图范围内
export function isWithinBounds(state: GameState, pos: Position): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < state.map.width && pos.y < state.map.height;
}

// 获取可移动返回。返回一个位置数组
export function getReachablePositions(state: GameState, unitId: string, customMaxMove?: number): Position[] {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return [];

    const stats = UNIT_CONFIGS[unit.unitClass];
    let maxMove = customMaxMove !== undefined ? customMaxMove : stats.move;
    if (unit.status && unit.status.type === 'weakened') {
        maxMove = Math.min(maxMove, 1);
    }

    const reachable = new Map<string, number>(); // 'x,y' => cost
    const queue: { pos: Position; cost: number }[] = [];

    const startKey = `${unit.pos.x},${unit.pos.y}`;
    reachable.set(startKey, 0);
    queue.push({ pos: unit.pos, cost: 0 });

    // 记录场上其他单位的位置及其归属
    // 我们假设不能穿过敌方单位，可以穿过友方单位但不能停留
    const unitsMap = new Map<string, number>();
    for (const u of state.units) {
        unitsMap.set(`${u.pos.x},${u.pos.y}`, u.ownerId);
    }

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const cur = queue.shift()!;

        if (cur.cost > reachable.get(`${cur.pos.x},${cur.pos.y}`)!) continue;

        for (const [dx, dy] of dirs) {
            const nx = cur.pos.x + dx;
            const ny = cur.pos.y + dy;
            const nPos = { x: nx, y: ny };
            const nKey = `${nx},${ny}`;

            if (!isWithinBounds(state, nPos)) continue;

            // 检查是否有敌方单位阻挡
            const occupyOwner = unitsMap.get(nKey);
            if (occupyOwner !== undefined && occupyOwner !== unit.ownerId) {
                const enemyUnit = state.units.find(u => u.pos.x === nx && u.pos.y === ny);
                if (isFlying(unit) && enemyUnit && !isFlying(enemyUnit)) {
                    // 可以飞越
                } else {
                    continue; // 遇到敌人阻挡，不能通行
                }
            }

            const tile = state.map.tiles[ny][nx];
            const terrainCost = getMoveCostForUnit(state, unit, tile);
            const nextCost = cur.cost + terrainCost;

            if (nextCost <= maxMove) {
                const existingCost = reachable.get(nKey);
                if (existingCost === undefined || nextCost < existingCost) {
                    reachable.set(nKey, nextCost);
                    queue.push({ pos: nPos, cost: nextCost });
                }
            }
        }
    }

    // 过滤掉当前有其他单位停留的格子（包括友军，不能重叠）
    const validPositions: Position[] = [];
    for (const key of reachable.keys()) {
        const [x, y] = key.split(',').map(Number);
        const pos = { x, y };

        // 如果是原位置可以算为可达（即不移动，直接待机或攻击）
        if (x === unit.pos.x && y === unit.pos.y) {
            validPositions.push(pos);
            continue;
        }

        if (unitsMap.has(key)) {
            continue; // 不能停在有单位的格子上
        }
        validPositions.push(pos);
    }

    return validPositions;
}

export function getMoveCostTo(state: GameState, unitId: string, to: Position): number {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return 999;
    if (unit.pos.x === to.x && unit.pos.y === to.y) return 0;

    const stats = UNIT_CONFIGS[unit.unitClass];
    let maxMove = stats.move;
    if (unit.status && unit.status.type === 'weakened') {
        maxMove = 1;
    }

    const reachable = new Map<string, number>();
    const queue: { pos: Position; cost: number }[] = [];

    const startKey = `${unit.pos.x},${unit.pos.y}`;
    reachable.set(startKey, 0);
    queue.push({ pos: unit.pos, cost: 0 });

    const unitsMap = new Map<string, number>();
    for (const u of state.units) {
        unitsMap.set(`${u.pos.x},${u.pos.y}`, u.ownerId);
    }

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const cur = queue.shift()!;

        if (cur.cost > reachable.get(`${cur.pos.x},${cur.pos.y}`)!) continue;

        for (const [dx, dy] of dirs) {
            const nx = cur.pos.x + dx;
            const ny = cur.pos.y + dy;
            const nPos = { x: nx, y: ny };
            const nKey = `${nx},${ny}`;

            if (!isWithinBounds(state, nPos)) continue;

            const occupyOwner = unitsMap.get(nKey);
            if (occupyOwner !== undefined && occupyOwner !== unit.ownerId) {
                const enemyUnit = state.units.find(u => u.pos.x === nx && u.pos.y === ny);
                if (isFlying(unit) && enemyUnit && !isFlying(enemyUnit)) {
                    // 飞越
                } else {
                    continue;
                }
            }

            const tile = state.map.tiles[ny][nx];
            const terrainCost = getMoveCostForUnit(state, unit, tile);
            const nextCost = cur.cost + terrainCost;

            if (nextCost <= maxMove) {
                const existingCost = reachable.get(nKey);
                if (existingCost === undefined || nextCost < existingCost) {
                    reachable.set(nKey, nextCost);
                    queue.push({ pos: nPos, cost: nextCost });
                }
            }
        }
    }
    const cost = reachable.get(`${to.x},${to.y}`);
    return cost !== undefined ? cost : 999;
}
