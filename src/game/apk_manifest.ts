import { getApkAemTerrainUsage, type ApkAemMap, type ApkAemTailTemplate } from './apk_map';
import { getSkirmishApkTerrainMappingInfo, mapSkirmishApkTerrainId, type ApkTerrainMappingConfidence } from './apk_terrain';
import { APK_SKIRMISH_TILE_USAGE, type ApkSkirmishTileUsage } from './apk_skirmish_tile_usage';

export const APK_RELEASE_VERSION = 'aer-release-4.2.5.1';
export const APK_RELEASE_SHA256 = '51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B';

export interface ApkSkirmishInitialUnit {
    apkUnitId: number;
    teamId: number;
    extra: number;
    x: number;
    y: number;
}

export type ApkSkirmishOwnerCounts = Partial<Record<'0' | '1' | '2' | '3' | 'N', number>>;

export interface ApkSkirmishTerrainConfidenceReport {
    tileCount: number;
    byConfidence: Record<ApkTerrainMappingConfidence, number>;
    approximateTerrainIds: number[];
    approximateTileCount: number;
    unmappedTerrainIds: number[];
    unmappedTileCount: number;
}

export interface ApkSkirmishMapManifestEntry {
    name: string;
    resourcePath: string;
    width: number;
    height: number;
    author: string | null;
    playerIds: number[];
    initialUnitCount: number;
    initialUnits: ApkSkirmishInitialUnit[];
    castleOwnerCounts: ApkSkirmishOwnerCounts;
    villageOwnerCounts: ApkSkirmishOwnerCounts;
    tileUsage: ApkSkirmishTileUsage;
    terrainConfidence: ApkSkirmishTerrainConfidenceReport;
    unmappedTerrainIds: number[];
    recommendedGold: number | null;
    tailTemplate: ApkAemTailTemplate;
}

// 来自 aer-release-4.2.5.1 的 assets/maps/_list.json 与 20 张根目录 skirmish AEM 解析结果。
const APK_SKIRMISH_MAP_DATA = [
    {
        name: '(4) Crossroads.aem',
        width: 11,
        height: 19,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 1, x: 1, y: 3, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 9, y: 3, apkUnitId: 9, extra: 0 },
            { teamId: 3, x: 1, y: 15, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 9, y: 15, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        recommendedGold: 200
    },
    {
        name: '(3) Frozen fields.aem',
        width: 15,
        height: 12,
        author: null,
        playerIds: [0, 1, 2],
        initialUnits: [
            { teamId: 0, x: 2, y: 1, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 7, y: 10, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 13, y: 1, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1 },
        villageOwnerCounts: { N: 6 },
        recommendedGold: null
    },
    {
        name: '(2) Icy Paths.aem',
        width: 15,
        height: 15,
        author: null,
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 13, y: 13, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 1, y: 1, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, N: 2 },
        villageOwnerCounts: { '0': 2, '1': 2, N: 6 },
        recommendedGold: null
    },
    {
        name: '(2) Liberty Port.aem',
        width: 13,
        height: 13,
        author: null,
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 1, y: 1, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 11, y: 1, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, N: 1 },
        villageOwnerCounts: { N: 9 },
        recommendedGold: null
    },
    {
        name: '(2) Mourningstar.aem',
        width: 11,
        height: 11,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 2, y: 8, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 8, y: 2, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1 },
        villageOwnerCounts: { '0': 1, '1': 2, N: 5 },
        recommendedGold: 250
    },
    {
        name: '(2) Peak Island.aem',
        width: 15,
        height: 15,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 7, y: 3, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 7, y: 11, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1 },
        villageOwnerCounts: { '1': 2, N: 6 },
        recommendedGold: 300
    },
    {
        name: '(4) Shadowlands.aem',
        width: 19,
        height: 19,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 3, x: 16, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 9, y: 1, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 9, y: 15, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 2, y: 7, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1, N: 6 },
        villageOwnerCounts: { N: 12 },
        recommendedGold: 150
    },
    {
        name: '(4) Solitude.aem',
        width: 15,
        height: 15,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 0, x: 7, y: 2, apkUnitId: 9, extra: 0 },
            { teamId: 3, x: 12, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 2, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 7, y: 12, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { N: 12 },
        recommendedGold: 50
    },
    {
        name: '(2) The Crossing.aem',
        width: 15,
        height: 10,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 4, y: 5, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 12, y: 3, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, N: 2 },
        villageOwnerCounts: { '1': 3, N: 3 },
        recommendedGold: 150
    },
    {
        name: '(4) The Crucible.aem',
        width: 19,
        height: 19,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 0, x: 3, y: 6, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 6, y: 15, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 12, y: 3, apkUnitId: 9, extra: 0 },
            { teamId: 3, x: 15, y: 12, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1, N: 4 },
        villageOwnerCounts: { N: 12 },
        recommendedGold: 300
    },
    {
        name: '(4) Waterways.aem',
        width: 15,
        height: 15,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 0, x: 3, y: 2, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 11, y: 2, apkUnitId: 9, extra: 0 },
            { teamId: 3, x: 12, y: 12, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 2, y: 12, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { N: 8 },
        recommendedGold: 150
    },
    {
        name: '(4) Winterstorm.aem',
        width: 13,
        height: 13,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 3, x: 6, y: 0, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 6, y: 12, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 12, y: 6, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 0, y: 6, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { N: 12 },
        recommendedGold: 150
    },
    {
        name: '(4) classic 1.aem',
        width: 16,
        height: 15,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 3, x: 3, y: 13, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 1, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 14, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 12, y: 1, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { '0': 2, '1': 2, '2': 2, '3': 2, N: 8 },
        recommendedGold: 50
    },
    {
        name: '(3) classic 2.aem',
        width: 17,
        height: 12,
        author: null,
        playerIds: [0, 2, 3],
        initialUnits: [
            { teamId: 0, x: 15, y: 9, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 1, y: 9, apkUnitId: 9, extra: 0 },
            { teamId: 3, x: 8, y: 2, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { '0': 2, '2': 2, '3': 3, N: 2 },
        recommendedGold: null
    },
    {
        name: '(2) Duel.aem',
        width: 13,
        height: 13,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 1, x: 9, y: 6, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 4, y: 4, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1 },
        villageOwnerCounts: { '1': 1, N: 4 },
        recommendedGold: 200
    },
    {
        name: '(2) Crossed swords.aem',
        width: 11,
        height: 18,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 1, x: 4, y: 12, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 5, y: 2, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, N: 2 },
        villageOwnerCounts: { '0': 2, '1': 4, N: 4 },
        recommendedGold: 50
    },
    {
        name: '(4) Critical mass.aem',
        width: 15,
        height: 15,
        author: 'youxing',
        playerIds: [0, 1, 2, 3],
        initialUnits: [
            { teamId: 3, x: 7, y: 2, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 12, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 2, y: 7, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 7, y: 12, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, '3': 1 },
        villageOwnerCounts: { '0': 2, '1': 2, '2': 2, '3': 2, N: 12 },
        recommendedGold: 50
    },
    {
        name: '(3) Midway.aem',
        width: 17,
        height: 12,
        author: null,
        playerIds: [0, 1, 2],
        initialUnits: [
            { teamId: 1, x: 15, y: 10, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 1, y: 10, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 8, y: 1, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, N: 3 },
        villageOwnerCounts: { N: 15 },
        recommendedGold: null
    },
    {
        name: '(2) Swamplands.aem',
        width: 10,
        height: 10,
        author: 'youxing',
        playerIds: [0, 1],
        initialUnits: [
            { teamId: 0, x: 3, y: 9, apkUnitId: 0, extra: 0 },
            { teamId: 1, x: 6, y: 0, apkUnitId: 0, extra: 0 },
            { teamId: 1, x: 9, y: 0, apkUnitId: 0, extra: 0 },
            { teamId: 0, x: 2, y: 6, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 5, y: 5, apkUnitId: 9, extra: 0 },
            { teamId: 0, x: 0, y: 9, apkUnitId: 0, extra: 0 }
        ],
        castleOwnerCounts: { N: 2 },
        villageOwnerCounts: { '1': 2, N: 11 },
        recommendedGold: 50
    },
    {
        name: '(3) Glu.aem',
        width: 13,
        height: 19,
        author: null,
        playerIds: [0, 1, 2],
        initialUnits: [
            { teamId: 0, x: 3, y: 4, apkUnitId: 9, extra: 0 },
            { teamId: 2, x: 3, y: 14, apkUnitId: 9, extra: 0 },
            { teamId: 1, x: 9, y: 8, apkUnitId: 9, extra: 0 }
        ],
        castleOwnerCounts: { '0': 1, '1': 1, '2': 1, N: 1 },
        villageOwnerCounts: { N: 6 },
        recommendedGold: null
    }
] satisfies readonly Omit<ApkSkirmishMapManifestEntry, 'resourcePath' | 'tailTemplate' | 'initialUnitCount' | 'tileUsage' | 'terrainConfidence' | 'unmappedTerrainIds'>[];

function getRequiredTileUsage(name: string): ApkSkirmishTileUsage {
    const usage = APK_SKIRMISH_TILE_USAGE[name];
    if (usage === undefined) {
        throw new Error(`缺少 APK skirmish 地图 tile 使用量: ${name}`);
    }
    return usage;
}

export function getUnmappedApkTerrainIdsFromUsage(usage: ApkSkirmishTileUsage): number[] {
    return Object.keys(usage)
        .map(Number)
        .filter(apkTerrainId => mapSkirmishApkTerrainId(apkTerrainId) === null)
        .sort((a, b) => a - b);
}

export function getApkTerrainConfidenceReportFromUsage(usage: ApkSkirmishTileUsage): ApkSkirmishTerrainConfidenceReport {
    const byConfidence: Record<ApkTerrainMappingConfidence, number> = {
        confirmed: 0,
        atlas: 0,
        approximate: 0,
        unmapped: 0
    };
    const approximateTerrainIds = new Set<number>();
    const unmappedTerrainIds = new Set<number>();
    let tileCount = 0;
    let approximateTileCount = 0;
    let unmappedTileCount = 0;

    for (const [apkTerrainIdText, count = 0] of Object.entries(usage)) {
        const apkTerrainId = Number(apkTerrainIdText);
        const mappingInfo = getSkirmishApkTerrainMappingInfo(apkTerrainId);
        byConfidence[mappingInfo.confidence] += count;
        tileCount += count;

        if (mappingInfo.confidence === 'approximate') {
            approximateTerrainIds.add(apkTerrainId);
            approximateTileCount += count;
        } else if (mappingInfo.confidence === 'unmapped') {
            unmappedTerrainIds.add(apkTerrainId);
            unmappedTileCount += count;
        }
    }

    return {
        tileCount,
        byConfidence,
        approximateTerrainIds: [...approximateTerrainIds].sort((a, b) => a - b),
        approximateTileCount,
        unmappedTerrainIds: [...unmappedTerrainIds].sort((a, b) => a - b),
        unmappedTileCount
    };
}

export const APK_SKIRMISH_MAP_MANIFEST = APK_SKIRMISH_MAP_DATA.map(entry => {
    const tileUsage = getRequiredTileUsage(entry.name);
    const terrainConfidence = getApkTerrainConfidenceReportFromUsage(tileUsage);
    return {
        ...entry,
        initialUnitCount: entry.initialUnits.length,
        tileUsage,
        terrainConfidence,
        unmappedTerrainIds: terrainConfidence.unmappedTerrainIds,
        resourcePath: `assets/maps/${entry.name}`,
        tailTemplate: 'zero_suffix_58' as const
    };
}) satisfies readonly ApkSkirmishMapManifestEntry[];

export function getApkSkirmishMapManifestEntry(name: string): ApkSkirmishMapManifestEntry | null {
    return APK_SKIRMISH_MAP_MANIFEST.find(entry => entry.name === name) ?? null;
}

function sameNumberArray(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function compareInitialUnit(left: ApkSkirmishInitialUnit, right: ApkSkirmishInitialUnit): number {
    return left.teamId - right.teamId
        || left.x - right.x
        || left.y - right.y
        || left.apkUnitId - right.apkUnitId
        || left.extra - right.extra;
}

function normalizeInitialUnits(units: readonly ApkSkirmishInitialUnit[]): ApkSkirmishInitialUnit[] {
    return units.map(unit => ({
        apkUnitId: unit.apkUnitId,
        teamId: unit.teamId,
        extra: unit.extra,
        x: unit.x,
        y: unit.y
    })).sort(compareInitialUnit);
}

function sameInitialUnits(left: readonly ApkSkirmishInitialUnit[], right: readonly ApkSkirmishInitialUnit[]): boolean {
    const normalizedLeft = normalizeInitialUnits(left);
    const normalizedRight = normalizeInitialUnits(right);

    if (normalizedLeft.length !== normalizedRight.length) return false;

    return normalizedLeft.every((unit, index) => {
        const other = normalizedRight[index];
        return unit.apkUnitId === other.apkUnitId
            && unit.teamId === other.teamId
            && unit.extra === other.extra
            && unit.x === other.x
            && unit.y === other.y;
    });
}

function countApkTerrainOwners(map: ApkAemMap, apkTerrainId: number): ApkSkirmishOwnerCounts {
    const counts: Record<string, number> = {};

    for (const row of map.terrain) {
        for (const cell of row) {
            if (cell.apkTerrainId !== apkTerrainId) continue;

            const key = cell.ownerId === null ? 'N' : String(cell.ownerId);
            counts[key] = (counts[key] ?? 0) + 1;
        }
    }

    return counts as ApkSkirmishOwnerCounts;
}

function sameOwnerCounts(left: ApkSkirmishOwnerCounts, right: ApkSkirmishOwnerCounts): boolean {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        if ((left[key as keyof ApkSkirmishOwnerCounts] ?? 0) !== (right[key as keyof ApkSkirmishOwnerCounts] ?? 0)) {
            return false;
        }
    }

    return true;
}

function sameTileUsage(left: Record<number, number>, right: ApkSkirmishTileUsage): boolean {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        const apkTerrainId = Number(key);
        if ((left[apkTerrainId] ?? 0) !== (right[apkTerrainId] ?? 0)) {
            return false;
        }
    }

    return true;
}

export function matchesApkSkirmishMapManifest(map: ApkAemMap, entry: ApkSkirmishMapManifestEntry): boolean {
    const playerIds = [...map.playerIds].sort((a, b) => a - b);
    const manifestPlayerIds = [...entry.playerIds].sort((a, b) => a - b);

    return map.width === entry.width
        && map.height === entry.height
        && map.author === entry.author
        && sameNumberArray(playerIds, manifestPlayerIds)
        && map.units.length === entry.initialUnitCount
        && sameInitialUnits(map.units, entry.initialUnits)
        && sameOwnerCounts(countApkTerrainOwners(map, 37), entry.castleOwnerCounts)
        && sameOwnerCounts(countApkTerrainOwners(map, 36), entry.villageOwnerCounts)
        && sameTileUsage(getApkAemTerrainUsage(map), entry.tileUsage)
        && map.recommendedGold === entry.recommendedGold
        && map.tail.template === entry.tailTemplate;
}
