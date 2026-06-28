import { getApkTerrainConfig } from './apk_terrain';
import { TERRAIN_CONFIG, Tile } from './terrain';

function getApkTerrainValue(tile: Tile, field: 'defenseBonus' | 'healPerTurn' | 'moveCost'): number | null {
    if (tile.apkTerrainId === undefined) return null;
    return getApkTerrainConfig(tile.apkTerrainId)?.[field] ?? null;
}

export function getTileDefenseBonus(tile: Tile): number {
    return getApkTerrainValue(tile, 'defenseBonus')
        ?? TERRAIN_CONFIG[tile.terrainId]?.defenseBonus
        ?? 0;
}

export function getTileHealPerTurn(tile: Tile): number {
    return getApkTerrainValue(tile, 'healPerTurn')
        ?? TERRAIN_CONFIG[tile.terrainId]?.healPerTurn
        ?? 0;
}

export function getTileMoveCost(tile: Tile): number {
    return getApkTerrainValue(tile, 'moveCost')
        ?? TERRAIN_CONFIG[tile.terrainId]?.moveCost
        ?? 1;
}
