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
        const terrainKey = getTileTerrainKey(tile);
        // APK data.bin 的 kind 不能完整表达神庙净化语义；t31 已由实机确认会清除负面状态。
        return terrainKey === 'temple' || terrainKey === 'water_temple';
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

export function setTileOwnerAfterRepairForRules(tile: Tile): void {
    tile.ownerId = null;
    if (tile.apkTerrainId === undefined) return;

    // APK REPAIR 会把可归属修复地形写成中立队伍 4094；项目内保留低字节 0xfe 表示。
    tile.apkOwnerCode = getApkTerrainConfig(tile.apkTerrainId)?.flagB !== 0 ? 0xfe : 0xff;
    rewriteApkTerrainRaw(tile);
}

export function isTileDestroyableForRules(tile: Tile): boolean {
    if (tile.apkTerrainId !== undefined) {
        return (getApkTerrainConfig(tile.apkTerrainId)?.linkedB ?? -1) >= 0;
    }
    return getTileTerrainKey(tile) === 'town';
}

export function destroyTileForRules(tile: Tile): void {
    if (tile.apkTerrainId !== undefined) {
        const destroyedApkTerrainId = getApkTerrainConfig(tile.apkTerrainId)?.linkedB ?? -1;
        if (destroyedApkTerrainId >= 0) {
            tile.apkTerrainId = destroyedApkTerrainId;
            tile.terrainId = mapSkirmishApkTerrainId(destroyedApkTerrainId) ?? tile.terrainId;
            tile.ownerId = null;
            tile.apkOwnerCode = 0xff;
            rewriteApkTerrainRaw(tile);
            return;
        }
    }

    setTileTerrainForRules(tile, 8);
    setTileOwnerForRules(tile, null);
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
    if (tile.apkTerrainId === 0 || tile.apkTerrainId === 1) {
        // t0/t1 是 APK 水面边界特殊 tile；回放显示单位可站立时不触发 data.bin 中的 3 点普通回血。
        return 0;
    }
    return getApkTerrainValue(tile, 'healPerTurn')
        ?? getTileTerrainConfig(tile)?.healPerTurn
        ?? 0;
}

export function tileHealingRequiresFriendlyOwner(tile: Tile): boolean {
    if (tile.apkTerrainId !== undefined) {
        // APK C0600q.m4342b：f1374g 为可占领/归属敏感地形时，只有同盟归属才给地形回血。
        return getApkTerrainConfig(tile.apkTerrainId)?.flagB !== 0;
    }
    return getTileTerrainConfig(tile).tags.includes('capturable');
}

export function getTileMoveCost(tile: Tile): number {
    return getApkTerrainValue(tile, 'moveCost')
        ?? getTileTerrainConfig(tile)?.moveCost
        ?? 1;
}
