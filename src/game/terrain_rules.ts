import { getApkTerrainConfig, mapSkirmishApkTerrainId } from './apk_terrain';
import { TERRAIN_CONFIG, TerrainId, Tile } from './terrain';

function rewriteApkTerrainRaw(tile: Tile): void {
    if (tile.apkTerrainId === undefined) return;
    const ownerCode = tile.apkOwnerCode ?? (tile.ownerId ?? 0xff);
    tile.apkTerrainRaw = (tile.apkTerrainId << 12) | ownerCode;
}

function getLinkedApkTerrainIdForProjectTerrain(apkTerrainId: number, terrainId: TerrainId): number | null {
    const config = getApkTerrainConfig(apkTerrainId);
    if (!config) return null;

    const candidates = [config.linkedB, config.linkedC, config.linkedA];
    for (const candidate of candidates) {
        if (candidate < 0) continue;
        if (mapSkirmishApkTerrainId(candidate) === terrainId) {
            return candidate;
        }
    }
    return null;
}

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

export function tileClearsNegativeStatusAtTurnStart(tile: Tile): boolean {
    if (tile.apkTerrainId !== undefined) {
        return getApkTerrainConfig(tile.apkTerrainId)?.kind === 5;
    }
    return tileHasTerrainTag(tile, 'cleanse');
}

export function setTileTerrainForRules(tile: Tile, terrainId: TerrainId): void {
    tile.terrainId = terrainId;

    if (tile.apkTerrainId === undefined) return;
    if (mapSkirmishApkTerrainId(tile.apkTerrainId) === terrainId) {
        rewriteApkTerrainRaw(tile);
        return;
    }

    const linkedApkTerrainId = getLinkedApkTerrainIdForProjectTerrain(tile.apkTerrainId, terrainId);
    if (linkedApkTerrainId !== null) {
        tile.apkTerrainId = linkedApkTerrainId;
        rewriteApkTerrainRaw(tile);
        return;
    }

    // APK 没有可证明的 linked tile 时，移除过期 APK 语义，避免后续规则继续按旧 tile 判定。
    delete tile.apkTerrainId;
    delete tile.apkTerrainRaw;
    delete tile.apkOwnerCode;
}

export function setTileOwnerForRules(tile: Tile, ownerId: number | null): void {
    tile.ownerId = ownerId;
    if (tile.apkTerrainId === undefined) return;

    tile.apkOwnerCode = ownerId ?? 0xff;
    rewriteApkTerrainRaw(tile);
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
