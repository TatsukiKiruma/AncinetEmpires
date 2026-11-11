import type { GameState } from './types';

/** 逐字段比较隔离快照，不构造数组、字符串，也不暴露引擎内部状态。 */
export function stateSnapshotEquals(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left)) {
        if (!Array.isArray(right) || left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) if (!stateSnapshotEquals(left[i], right[i])) return false;
        return true;
    }
    if (Array.isArray(right)) return false;
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
    for (const key in a) if (Object.hasOwn(a, key) && (!Object.hasOwn(b, key) || a[key] !== b[key] && !stateSnapshotEquals(a[key], b[key]))) return false;
    for (const key in b) if (Object.hasOwn(b, key) && !Object.hasOwn(a, key)) return false;
    return true;
}

/** 地形采用现行Tile合同的八个标量字段直比，其余状态字段保持通用完整比较。 */
export function gameStateEquals(left: GameState, right: GameState): boolean {
    const a = left.map, b = right.map;
    if (a.width !== b.width || a.height !== b.height || a.tiles.length !== b.tiles.length) return false;
    for (let y = 0; y < a.tiles.length; y++) {
        if (a.tiles[y].length !== b.tiles[y].length) return false;
        for (let x = 0; x < a.tiles[y].length; x++) {
            const u = a.tiles[y][x], v = b.tiles[y][x];
            if (u.terrainId !== v.terrainId || u.ownerId !== v.ownerId || u.apkTerrainId !== v.apkTerrainId || u.apkTerrainRaw !== v.apkTerrainRaw || u.apkOwnerCode !== v.apkOwnerCode || u.apkTerrainKind !== v.apkTerrainKind || u.apkTerrainIsLand !== v.apkTerrainIsLand || u.apkMoveCost !== v.apkMoveCost) return false;
        }
    }
    const first = left as unknown as Record<string, unknown>, second = right as unknown as Record<string, unknown>;
    for (const key in first) if (key !== 'map' && Object.hasOwn(first, key) && (!Object.hasOwn(second, key) || first[key] !== second[key] && !stateSnapshotEquals(first[key], second[key]))) return false;
    for (const key in second) if (key !== 'map' && Object.hasOwn(second, key) && !Object.hasOwn(first, key)) return false;
    return true;
}
