import { getApkTerrainConfig, mapSkirmishApkTerrainId } from './apk_terrain';
import { TERRAIN_CONFIG, TerrainId, Tile } from './terrain';

export function getTileTerrainIdForRules(tile: Tile): TerrainId {
    if (tile.apkTerrainId !== undefined) {
        return mapSkirmishApkTerrainId(tile.apkTerrainId) ?? tile.terrainId;
    }
    return tile.terrainId;
}

export function getTileTerrainConfig(tile: Tile): typeof TERRAIN_CONFIG[TerrainId] {
    return TERRAIN_CONFIG[getTileTerrainIdForRules(tile)];
}

export function getTileTerrainKey(tile: Tile): string {
    return getTileTerrainConfig(tile).key;
}

export function tileHasTerrainTag(tile: Tile, tag: string): boolean {
    return getTileTerrainConfig(tile).tags.includes(tag);
}

function getApkTerrainValue(tile: Tile, field: 'defenseBonus' | 'healPerTurn' | 'moveCost'): number | null {
    if (tile.apkTerrainId === undefined) return null;
    return getApkTerrainConfig(tile.apkTerrainId)?.[field] ?? null;
}

export function getTileDefenseBonus(tile: Tile): number {
    return getApkTerrainValue(tile, 'defenseBonus')
        ?? getTileTerrainConfig(tile)?.defenseBonus
        ?? 0;
}

export function getTileHealPerTurn(tile: Tile): number {
    return getApkTerrainValue(tile, 'healPerTurn')
        ?? getTileTerrainConfig(tile)?.healPerTurn
        ?? 0;
}

export function getTileMoveCost(tile: Tile): number {
    return getApkTerrainValue(tile, 'moveCost')
        ?? getTileTerrainConfig(tile)?.moveCost
        ?? 1;
}
