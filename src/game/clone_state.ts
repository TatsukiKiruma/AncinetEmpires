import type { GameState } from './types';

/** 配置和脚本允许嵌套结构；保留原 JSON 快照的字段顺序及空值约定。 */
function cloneJson<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return (typeof value === 'number' && !Number.isFinite(value) ? null : value) as T;
    }
    if (Array.isArray(value)) return value.map(item => item === undefined ? null : cloneJson(item)) as T;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) {
            // JSON对象的特殊键也是普通数据，不能触发原型赋值语义。
            if (key === '__proto__') Object.defineProperty(result, key, { value: cloneJson(item), enumerable: true, writable: true, configurable: true });
            else result[key] = cloneJson(item);
        }
    }
    return result as T;
}

/** 热路径直接复制实体与网格；所有可变子对象均与输入隔离。 */
export function cloneGameState(state: GameState): GameState {
    const copy = { ...state };
    copy.players = state.players.map(player => ({ ...player }));
    copy.units = state.units.map(unit => {
        const cloned = { ...unit, pos: { ...unit.pos } };
        if (unit.status) cloned.status = { ...unit.status };
        if (unit.apkMoveOverrides) cloned.apkMoveOverrides = { ...unit.apkMoveOverrides };
        return cloned;
    });
    copy.map = { ...state.map, tiles: state.map.tiles.map(row => row.map(tile => ({ ...tile }))) };
    if (state.graves) copy.graves = state.graves.map(grave => ({ ...grave, pos: { ...grave.pos } }));
    if (state.rules) copy.rules = cloneJson(state.rules);
    if (state.metadata) copy.metadata = cloneJson(state.metadata);
    if (state.apkScriptState) copy.apkScriptState = cloneJson(state.apkScriptState);
    return copy;
}
