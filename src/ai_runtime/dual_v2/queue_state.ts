import type { GameState } from '../../game/types';

// 同步序列化期间复用扁平缓冲；返回字符串独立，不持有后续会变化的缓冲。
let tiles: unknown[] = [];

/** 队列只省略不参与规则的来源描述；地形可信度、脚本、规则和全部可变字段均保留。 */
export function queueStateKey(state: GameState): string {
    const { map, metadata, ...mutable } = state;
    const length = map.width * map.height * 8 + 2;
    if (tiles.length !== length) tiles = new Array(length);
    tiles[0] = map.width; tiles[1] = map.height;
    let i = 2;
    for (const row of map.tiles) for (const t of row) {
        tiles[i++] = t.terrainId; tiles[i++] = t.ownerId; tiles[i++] = t.apkTerrainId;
        tiles[i++] = t.apkTerrainRaw; tiles[i++] = t.apkOwnerCode; tiles[i++] = t.apkTerrainKind;
        tiles[i++] = t.apkTerrainIsLand; tiles[i++] = t.apkMoveCost;
    }
    return JSON.stringify({ ...mutable, map: tiles });
}
