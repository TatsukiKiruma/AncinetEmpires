import { GameState, Position, UnitClass } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { isFlying, getMoveCostForUnit, getEffectiveStats } from './abilities';
import { areEnemyPlayers } from './rule_config';

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

    const stats = getEffectiveStats(unit);
    let maxMove = customMaxMove !== undefined ? customMaxMove : stats.move;
    if (unit.status && unit.status.type === 'weakened') {
        maxMove = Math.min(maxMove, 1);
    }

    const reachable = new Map<string, number>(); // 'x,y' => cost
    const queue: { pos: Position; cost: number }[] = [];

    const startKey = `${unit.pos.x},${unit.pos.y}`;
    reachable.set(startKey, 0);
    queue.push({ pos: unit.pos, cost: 0 });

    // 记录场上其他单位的位置；敌对单位阻挡，同盟单位可穿过但不可停留。
    const unitsMap = new Map<string, typeof state.units[number]>();
    for (const u of state.units) {
        unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
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
            const occupyingUnit = unitsMap.get(nKey);
            if (occupyingUnit && areEnemyPlayers(state, unit.ownerId, occupyingUnit.ownerId)) {
                if (isFlying(unit) && !isFlying(occupyingUnit)) {
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

    const stats = getEffectiveStats(unit);
    let maxMove = stats.move;
    if (unit.status && unit.status.type === 'weakened') {
        maxMove = 1;
    }

    const reachable = new Map<string, number>();
    const queue: { pos: Position; cost: number }[] = [];

    const startKey = `${unit.pos.x},${unit.pos.y}`;
    reachable.set(startKey, 0);
    queue.push({ pos: unit.pos, cost: 0 });

    const unitsMap = new Map<string, typeof state.units[number]>();
    for (const u of state.units) {
        unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
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

            const occupyingUnit = unitsMap.get(nKey);
            if (occupyingUnit && areEnemyPlayers(state, unit.ownerId, occupyingUnit.ownerId)) {
                if (isFlying(unit) && !isFlying(occupyingUnit)) {
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

export function getRecruitDeployPositions(
    state: GameState,
    ownerId: number,
    unitClass: UnitClass,
    castlePos: Position
): Position[] {
    const stats = UNIT_CONFIGS[unitClass];
    let maxMove = stats.move;

    // Create a virtual unit to use with generic functions like isFlying and getMoveCostForUnit
    const virtualUnit = {
        id: 'virtual_recruit',
        ownerId: ownerId,
        unitClass: unitClass,
        pos: { ...castlePos },
        hp: 100,
        maxHp: 100,
        hasMoved: false,
        hasActed: false
    };

    const reachable = new Map<string, number>();
    const queue: { pos: Position; cost: number }[] = [];

    const startKey = `${castlePos.x},${castlePos.y}`;
    reachable.set(startKey, 0);
    queue.push({ pos: castlePos, cost: 0 });

    const unitsMap = new Map<string, typeof state.units[number]>();
    for (const u of state.units) {
        unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
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

            const occupyingUnit = unitsMap.get(nKey);
            if (occupyingUnit && areEnemyPlayers(state, ownerId, occupyingUnit.ownerId)) {
                if (isFlying(virtualUnit as any) && !isFlying(occupyingUnit)) {
                    // 飞越
                } else {
                    continue;
                }
            }

            const tile = state.map.tiles[ny][nx];
            const terrainCost = getMoveCostForUnit(state, virtualUnit as any, tile);
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

    const validPositions: Position[] = [];
    for (const key of reachable.keys()) {
        const [x, y] = key.split(',').map(Number);
        
        // Cannot deploy to the starting castle itself
        if (x === castlePos.x && y === castlePos.y) {
            continue;
        }

        // Cannot deploy to occupied tiles
        if (unitsMap.has(key)) {
            continue;
        }
        
        validPositions.push({ x, y });
    }

    return validPositions;
}
