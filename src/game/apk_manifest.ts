import type { ApkAemMap, ApkAemTailTemplate } from './apk_map';

export const APK_RELEASE_VERSION = 'aer-release-4.2.5.1';
export const APK_RELEASE_SHA256 = '51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B';

export interface ApkSkirmishMapManifestEntry {
    name: string;
    resourcePath: string;
    width: number;
    height: number;
    playerIds: number[];
    initialUnitCount: number;
    recommendedGold: number | null;
    tailTemplate: ApkAemTailTemplate;
}

// 来自 aer-release-4.2.5.1 的 assets/maps/_list.json 与 20 张根目录 skirmish AEM 解析结果。
export const APK_SKIRMISH_MAP_MANIFEST = [
    { name: '(4) Crossroads.aem', width: 11, height: 19, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 200 },
    { name: '(3) Frozen fields.aem', width: 15, height: 12, playerIds: [0, 1, 2], initialUnitCount: 3, recommendedGold: null },
    { name: '(2) Icy Paths.aem', width: 15, height: 15, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: null },
    { name: '(2) Liberty Port.aem', width: 13, height: 13, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: null },
    { name: '(2) Mourningstar.aem', width: 11, height: 11, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: 250 },
    { name: '(2) Peak Island.aem', width: 15, height: 15, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: 300 },
    { name: '(4) Shadowlands.aem', width: 19, height: 19, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 150 },
    { name: '(4) Solitude.aem', width: 15, height: 15, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 50 },
    { name: '(2) The Crossing.aem', width: 15, height: 10, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: 150 },
    { name: '(4) The Crucible.aem', width: 19, height: 19, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 300 },
    { name: '(4) Waterways.aem', width: 15, height: 15, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 150 },
    { name: '(4) Winterstorm.aem', width: 13, height: 13, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 150 },
    { name: '(4) classic 1.aem', width: 16, height: 15, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 50 },
    { name: '(3) classic 2.aem', width: 17, height: 12, playerIds: [0, 2, 3], initialUnitCount: 3, recommendedGold: null },
    { name: '(2) Duel.aem', width: 13, height: 13, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: 200 },
    { name: '(2) Crossed swords.aem', width: 11, height: 18, playerIds: [0, 1], initialUnitCount: 2, recommendedGold: 50 },
    { name: '(4) Critical mass.aem', width: 15, height: 15, playerIds: [0, 1, 2, 3], initialUnitCount: 4, recommendedGold: 50 },
    { name: '(3) Midway.aem', width: 17, height: 12, playerIds: [0, 1, 2], initialUnitCount: 3, recommendedGold: null },
    { name: '(2) Swamplands.aem', width: 10, height: 10, playerIds: [0, 1], initialUnitCount: 6, recommendedGold: 50 },
    { name: '(3) Glu.aem', width: 13, height: 19, playerIds: [0, 1, 2], initialUnitCount: 3, recommendedGold: null },
].map(entry => ({
    ...entry,
    resourcePath: `assets/maps/${entry.name}`,
    tailTemplate: 'zero_suffix_58' as const
})) satisfies readonly ApkSkirmishMapManifestEntry[];

export function getApkSkirmishMapManifestEntry(name: string): ApkSkirmishMapManifestEntry | null {
    return APK_SKIRMISH_MAP_MANIFEST.find(entry => entry.name === name) ?? null;
}

function sameNumberArray(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

export function matchesApkSkirmishMapManifest(map: ApkAemMap, entry: ApkSkirmishMapManifestEntry): boolean {
    const playerIds = [...map.playerIds].sort((a, b) => a - b);
    const manifestPlayerIds = [...entry.playerIds].sort((a, b) => a - b);

    return map.width === entry.width
        && map.height === entry.height
        && sameNumberArray(playerIds, manifestPlayerIds)
        && map.units.length === entry.initialUnitCount
        && map.recommendedGold === entry.recommendedGold
        && map.tail.template === entry.tailTemplate;
}
