import type { Action, GameState, Position } from '../../src/game/types';

export const SYMMETRIES = ['id', 'flipH', 'flipV', 'rot180'] as const;
export type Symmetry = typeof SYMMETRIES[number];
export function transformPosition(p: Position, width: number, height: number, kind: Symmetry): Position {
    return { x: kind === 'flipH' || kind === 'rot180' ? width - 1 - p.x : p.x, y: kind === 'flipV' || kind === 'rot180' ? height - 1 - p.y : p.y };
}
export function transformTileIndex(tile: number, width: number, height: number, kind: Symmetry): number {
    if (tile === -1) return -1;
    const p = transformPosition({ x: tile % width, y: Math.floor(tile / width) }, width, height, kind);
    return p.y * width + p.x;
}

// 同步变换战役规则内的坐标选择器、增援、区域和地块事件；不改写脚本变量或资源身份。
function transformGeometry(value: unknown, width: number, height: number, kind: Symmetry): any {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(x => transformGeometry(x, width, height, kind));
    const object = value as Record<string, any>, result = Object.fromEntries(Object.entries(object).map(([k, v]) => [k, transformGeometry(v, width, height, kind)]));
    if (typeof object.x === 'number' && typeof object.y === 'number') Object.assign(result, transformPosition(object as Position, width, height, kind));
    if (['minX', 'maxX', 'minY', 'maxY'].every(k => typeof object[k] === 'number')) {
        const a = transformPosition({ x: object.minX, y: object.minY }, width, height, kind), b = transformPosition({ x: object.maxX, y: object.maxY }, width, height, kind);
        Object.assign(result, { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
    }
    return result;
}
export function transformState(state: GameState, kind: Symmetry): GameState {
    const { width, height } = state.map;
    const result = structuredClone(state);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = transformPosition({ x, y }, width, height, kind);
        result.map.tiles[p.y][p.x] = { ...state.map.tiles[y][x] };
    }
    result.units = state.units.map(u => ({ ...structuredClone(u), pos: transformPosition(u.pos, width, height, kind) }));
    if (state.graves) result.graves = state.graves.map(g => ({ ...g, pos: transformPosition(g.pos, width, height, kind) }));
    if (state.rules?.campaignEvents) result.rules!.campaignEvents = transformGeometry(state.rules.campaignEvents, width, height, kind);
    return result;
}
export function transformAction(action: Action, width: number, height: number, kind: Symmetry): Action {
    return transformGeometry(action, width, height, kind);
}
