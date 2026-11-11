import type { GameState } from '../../game/types';
import type { Tile } from '../../game/terrain';

export interface AerMapTile {
    base: 0 | 1;
    object: number;
    team: number | null;
}

const water = (object = -1) => [0, object] as const;
const land = (object = -1) => [1, object] as const;

// APK 的单一地形编号对应网页版的底色与地物两层。
const originalTiles: Readonly<Record<number, readonly [0 | 1, number]>> = {
    1: water(0), 2: water(1), 15: land(2), 16: land(3), 17: land(4), 18: land(), 19: land(5),
    20: land(12), 21: land(13), 22: land(14), 23: land(15), 24: land(16), 25: land(17), 26: land(18),
    27: land(6), 28: water(34), 29: water(35), 30: land(9), 31: land(10),
    32: land(27), 33: land(28), 34: land(29), 35: land(30), 36: land(7), 37: land(8),
    72: land(19), 73: land(20), 74: land(21), 75: land(22), 76: land(23), 77: land(24),
    78: land(25), 79: land(26), 80: land(11), 81: water(31), 82: water(32), 83: water(33)
};

const defaultTiles: Readonly<Record<Tile['terrainId'], readonly [0 | 1, number]>> = {
    1: land(), 2: water(), 3: land(4), 4: land(5), 5: water(31), 6: land(12),
    7: land(2), 8: land(6), 9: land(7), 10: land(8), 11: land(9), 12: land(10),
    13: land(27), 14: land(28), 15: land(30), 16: water(33), 17: water(34)
};

const roads: Readonly<Record<string, number>> = {
    RL: 12, UD: 13, URDL: 14, DL: 15, UL: 16, UR: 17, RD: 18, URD: 19,
    URL: 20, RDL: 21, UDL: 22, U: 23, D: 24, R: 25, L: 26
};
const directions = [['U', 0, -1], ['R', 1, 0], ['D', 0, 1], ['L', -1, 0]] as const;

function tilePair(tile: Tile): readonly [0 | 1, number] {
    if (tile.apkTerrainId === 0 || (tile.apkTerrainId !== undefined &&
        ((tile.apkTerrainId >= 3 && tile.apkTerrainId <= 14) || (tile.apkTerrainId >= 38 && tile.apkTerrainId <= 71)))) {
        return water();
    }
    return originalTiles[tile.apkTerrainId ?? -1] ?? defaultTiles[tile.terrainId];
}

export function createAerTileGrid(map: GameState['map'], chooseDecorations = false): AerMapTile[][] {
    return map.tiles.map((row, y) => row.map((tile, x) => {
        let [base, object] = tilePair(tile);
        if (chooseDecorations) {
            const flat = y * map.width + x;
            const variation = Math.min(flat, map.width * map.height - 1 - flat);
            if (tile.apkTerrainId === 0 && variation % 5 === 2) object = 0;
            if (tile.apkTerrainId === 15 && variation % 3 === 1) object = 3;
            if (tile.apkTerrainId === 20) {
                const links = directions.filter(([, dx, dy]) => {
                    const next = map.tiles[y + dy]?.[x + dx]?.apkTerrainId;
                    return next === 20 || next === 27 || next === 36 || next === 37
                        || (next === 28 && dy === 0) || (next === 29 && dx === 0);
                }).map(([d]) => d).join('');
                object = roads[links] ?? 12;
            }
        }
        return { base, object, team: object === 7 || object === 8 ? tile.ownerId : null };
    }));
}

export function aerBorderFrame(grid: AerMapTile[][], x: number, y: number, patterns: number[][]): number {
    const nearby = [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => grid[y + dy]?.[x + dx]?.base ?? 0));
    return patterns.findIndex(pattern => pattern.every((rule, index) => rule < 0 || rule === nearby[index])) + 1;
}
