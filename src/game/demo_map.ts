import { GameState } from './types';

export function createDemoState(): GameState {
    const width = 8;
    const height = 8;
    
    // 1: snow, 2: deep_water, 3: mountain, 4: hill, 5: island, 6: road, 7: forest
    // 9: town, 10: castle, 11: camp, 12: temple, 13: special_1, 16: water_temple

    // Highly polished 8x8 diagonal-symmetric board containing various terrains
    // P0 Castle at 0,0, P1 Castle at 7,7
    // Free of any pre-damaged towns (no 8s); towns are initialized clean.
    const tilesData = [
        [10,  6,  4,  7,  2, 16,  2,  3],  
        [ 6,  6,  7,  9,  6,  1,  1,  2],
        [ 4,  7, 12,  6,  4,  3,  1, 16],  
        [ 7,  9,  6, 11, 13,  4,  6,  2],  
        [ 2,  6,  4, 13, 11,  6,  9,  7],  
        [16,  1,  3,  4,  6, 12,  7,  4],
        [ 2,  1,  1,  6,  9,  7,  6,  6],
        [ 3,  2, 16,  2,  7,  4,  6, 10]   
    ];

    const tiles = tilesData.map((row, y) => row.map((terrainId, x) => {
        let ownerId: number | null = null;
        if (x === 0 && y === 0) ownerId = 0; // P0 castle
        if (x === 7 && y === 7) ownerId = 1; // P1 castle
        return { terrainId: terrainId as any, ownerId } as import('./terrain').Tile;
    }));

    return {
        turn: 1,
        currentPlayer: 0,
        map: {
            width,
            height,
            tiles: tiles
        },
        units: [
            { id: 'u1', ownerId: 0, unitClass: 'commander', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'u2', ownerId: 1, unitClass: 'commander', pos: { x: 7, y: 7 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'u3', ownerId: 0, unitClass: 'soldier', pos: { x: 1, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'u4', ownerId: 1, unitClass: 'soldier', pos: { x: 6, y: 7 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        ],
        players: [
            { id: 0, gold: 500, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 500, isAlive: true, commanderDeathCount: 0 }
        ],
        winner: null,
        nextUnitId: 100,
        nextGraveId: 100
    };
}
