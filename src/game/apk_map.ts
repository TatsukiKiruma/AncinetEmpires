import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { getSkirmishApkTerrainMappingInfo, mapKnownApkTerrainId, mapSkirmishApkTerrainId } from './apk_terrain';
import { applyInitialRuleConfig, mergeRuleConfig } from './rule_config';
import { TerrainId } from './terrain';
import { GameMetadata, GameState, RuleConfig, Unit, UnitClass } from './types';

export const APK_AEM_MAGIC = 365703;
export const APK_AEM_TERRAIN_RECORD_SIZE = 4;
export const APK_AEM_ZERO_SUFFIX_TAIL_HEX = '00 00 00 00 06 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 06 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff 00 00 00 00 00 00 00 00';
export const APK_AEM_FF_SUFFIX_TAIL_HEX = '00 00 00 00 06 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 06 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff';

export type ApkAemTailTemplate = 'none' | 'zero_suffix_58' | 'ff_suffix_58' | 'unknown';

export interface ApkAemTerrainCell {
    x: number;
    y: number;
    raw: number;
    apkTerrainId: number;
    ownerCode: number;
    ownerId: number | null;
    projectTerrainId: TerrainId | null;
}

export interface ApkAemUnit {
    apkUnitId: number;
    teamId: number;
    extra: number;
    x: number;
    y: number;
    unitClass: UnitClass | null;
}

export interface ApkAemTail {
    offset: number;
    length: number;
    hex: string;
    bytes: number[];
    template: ApkAemTailTemplate;
}

export interface ApkAemMap {
    magic: number;
    width: number;
    height: number;
    author: string | null;
    playerIds: number[];
    terrainRecordOffset: number;
    terrainCount: number;
    terrain: ApkAemTerrainCell[][];
    unitRecordOffset: number;
    unitValueCount: number;
    units: ApkAemUnit[];
    recommendedGold: number | null;
    tailOffset: number;
    tail: ApkAemTail;
}

export interface ApkAemTerrainOnly {
    magic: number;
    width: number;
    height: number;
    author: string | null;
    playerIds: number[];
    terrainRecordOffset: number;
    terrainCount: number;
    terrain: ApkAemTerrainCell[][];
    terrainEndOffset: number;
}

export interface CreateGameStateFromApkAemMapOptions {
    initialGold?: number;
    useRecommendedGold?: boolean;
    currentPlayer?: number;
    rules?: RuleConfig;
    strictTerrain?: boolean;
    fallbackTerrainId?: TerrainId;
    apkVersion?: string;
    apkSha256?: string;
    apkResourcePath?: string;
    mapName?: string;
    metadata?: GameMetadata;
}

export interface ApkAemTerrainConfidenceUsage {
    approximateTerrainIds: number[];
    approximateTileCount: number;
    unmappedTerrainIds: number[];
    unmappedTileCount: number;
}

function requireBytes(data: Uint8Array, offset: number, length: number) {
    if (offset < 0 || length < 0 || offset + length > data.length) {
        throw new Error('AEM 数据长度不足');
    }
}

function readUInt32BE(data: Uint8Array, offset: number): number {
    requireBytes(data, offset, 4);
    return (
        data[offset] * 0x1000000
        + data[offset + 1] * 0x10000
        + data[offset + 2] * 0x100
        + data[offset + 3]
    ) >>> 0;
}

function readUInt32LE(data: Uint8Array, offset: number): number {
    requireBytes(data, offset, 4);
    return (
        data[offset]
        + data[offset + 1] * 0x100
        + data[offset + 2] * 0x10000
        + data[offset + 3] * 0x1000000
    ) >>> 0;
}

function readInt32LE(data: Uint8Array, offset: number): number {
    const value = readUInt32LE(data, offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
}

function readInt32BE(data: Uint8Array, offset: number): number {
    const value = readUInt32BE(data, offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
}

function readUIntBE(data: Uint8Array, offset: number, length: number): number {
    requireBytes(data, offset, length);
    let value = 0;
    for (let i = 0; i < length; i += 1) {
        value = value * 0x100 + data[offset + i];
    }
    return value;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
    requireBytes(data, offset, length);
    let value = '';
    for (let i = 0; i < length; i += 1) {
        value += String.fromCharCode(data[offset + i]);
    }
    return value;
}

function toHex(data: Uint8Array): string {
    return Array.from(data)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(' ');
}

function identifyTailTemplate(hex: string, length: number): ApkAemTailTemplate {
    if (length === 0) return 'none';
    if (hex === APK_AEM_ZERO_SUFFIX_TAIL_HEX) return 'zero_suffix_58';
    if (hex === APK_AEM_FF_SUFFIX_TAIL_HEX) return 'ff_suffix_58';
    return 'unknown';
}

function parseTail(data: Uint8Array, offset: number): ApkAemTail {
    requireBytes(data, offset, 0);
    const bytes = data.slice(offset);
    const hex = toHex(bytes);

    return {
        offset,
        length: bytes.length,
        hex,
        bytes: Array.from(bytes),
        template: identifyTailTemplate(hex, bytes.length)
    };
}

function parseNullableAuthor(data: Uint8Array): { author: string | null; nextOffset: number } {
    requireBytes(data, 13, 5);

    if (data[13] === 1 && readUInt32BE(data, 14) === 0) {
        return { author: null, nextOffset: 18 };
    }

    if (data[13] === 0 && data[14] === 0) {
        const authorLength = data[15];
        const authorOffset = 16;
        const nextOffset = authorOffset + authorLength + 4;
        requireBytes(data, authorOffset, authorLength + 4);
        return {
            author: readAscii(data, authorOffset, authorLength),
            nextOffset
        };
    }

    throw new Error('未知 AEM 作者字段格式');
}

function normalizeOwner(ownerCode: number): number | null {
    return ownerCode <= 7 ? ownerCode : null;
}

function parseUnits(data: Uint8Array, offset: number, width: number, height: number): {
    unitRecordOffset: number;
    unitValueCount: number;
    units: ApkAemUnit[];
    recommendedGold: number | null;
    tailOffset: number;
} {
    requireBytes(data, offset, 8);
    const unitBlockMarker = readInt32LE(data, offset);
    if (unitBlockMarker !== 0) {
        throw new Error(`未知 AEM 单位块标记: ${unitBlockMarker}`);
    }

    const unitValueCount = readInt32LE(data, offset + 4);
    if (unitValueCount < 0 || unitValueCount % 5 !== 0) {
        throw new Error(`AEM 单位字段数量无效: ${unitValueCount}`);
    }

    const unitCount = unitValueCount / 5;
    const unitRecordOffset = offset + 8;
    const units: ApkAemUnit[] = [];
    let cursor = unitRecordOffset;

    for (let i = 0; i < unitCount; i += 1) {
        requireBytes(data, cursor, i === unitCount - 1 ? 17 : 20);
        const apkUnitId = readInt32LE(data, cursor);
        const teamId = readInt32LE(data, cursor + 4);
        const extra = readInt32LE(data, cursor + 8);
        const x = readInt32LE(data, cursor + 12);
        const y = i === unitCount - 1 ? data[cursor + 16] : readInt32LE(data, cursor + 16);

        if (apkUnitId < 0 || apkUnitId > 20 || x < 0 || x >= width || y < 0 || y >= height) {
            throw new Error('AEM 单位记录超出已知范围');
        }

        units.push({
            apkUnitId,
            teamId,
            extra,
            x,
            y,
            unitClass: APK_UNIT_ID_TO_CLASS[apkUnitId] ?? null
        });

        cursor += i === unitCount - 1 ? 17 : 20;
    }

    const recommendedGoldRaw = readInt32BE(data, cursor);
    cursor += 4;

    return {
        unitRecordOffset,
        unitValueCount,
        units,
        recommendedGold: recommendedGoldRaw >= 0 ? recommendedGoldRaw : null,
        tailOffset: cursor
    };
}

export function parseApkAemTerrainOnly(data: Uint8Array): ApkAemTerrainOnly {
    const magic = readUInt32BE(data, 0);
    if (magic !== APK_AEM_MAGIC) {
        throw new Error(`未知 AEM magic: ${magic}`);
    }

    const width = readUInt32LE(data, 8);
    const height = data[12];
    if (width <= 0 || height <= 0) {
        throw new Error('AEM 地图尺寸无效');
    }

    const { author, nextOffset } = parseNullableAuthor(data);
    let offset = nextOffset;
    requireBytes(data, offset, 1);
    const playerCount = data[offset];
    offset += 1;

    const playerIds: number[] = [];
    for (let i = 0; i < playerCount; i += 1) {
        playerIds.push(readUInt32BE(data, offset));
        offset += 4;
    }

    const terrainCount = readUIntBE(data, offset, 5);
    offset += 5;
    const expectedTerrainCount = width * height;
    if (terrainCount !== expectedTerrainCount) {
        throw new Error(`AEM 地形数量不匹配: ${terrainCount} != ${expectedTerrainCount}`);
    }

    requireBytes(data, offset, terrainCount * APK_AEM_TERRAIN_RECORD_SIZE);
    const terrain: ApkAemTerrainCell[][] = [];
    for (let y = 0; y < height; y += 1) {
        const row: ApkAemTerrainCell[] = [];
        for (let x = 0; x < width; x += 1) {
            // AEM 地形矩阵按列优先存储：同一 x 的所有 y 先连续出现。
            const recordOffset = offset + (x * height + y) * APK_AEM_TERRAIN_RECORD_SIZE;
            const raw = readUInt32BE(data, recordOffset);
            const apkTerrainId = raw >>> 12;
            const ownerCode = raw & 0xff;
            row.push({
                x,
                y,
                raw,
                apkTerrainId,
                ownerCode,
                ownerId: normalizeOwner(ownerCode),
                projectTerrainId: mapKnownApkTerrainId(apkTerrainId)
            });
        }
        terrain.push(row);
    }
    return {
        magic,
        width,
        height,
        author,
        playerIds,
        terrainRecordOffset: offset,
        terrainCount,
        terrain,
        terrainEndOffset: offset + terrainCount * APK_AEM_TERRAIN_RECORD_SIZE
    };
}

export function parseApkAemMap(data: Uint8Array): ApkAemMap {
    const terrainOnly = parseApkAemTerrainOnly(data);
    const unitBlock = parseUnits(data, terrainOnly.terrainEndOffset, terrainOnly.width, terrainOnly.height);
    const tail = parseTail(data, unitBlock.tailOffset);

    return {
        magic: terrainOnly.magic,
        width: terrainOnly.width,
        height: terrainOnly.height,
        author: terrainOnly.author,
        playerIds: terrainOnly.playerIds,
        terrainRecordOffset: terrainOnly.terrainRecordOffset,
        terrainCount: terrainOnly.terrainCount,
        terrain: terrainOnly.terrain,
        ...unitBlock,
        tail
    };
}

export function getApkAemTerrainUsage(map: { terrain: ApkAemTerrainCell[][] }): Record<number, number> {
    const usage: Record<number, number> = {};
    for (const row of map.terrain) {
        for (const cell of row) {
            usage[cell.apkTerrainId] = (usage[cell.apkTerrainId] ?? 0) + 1;
        }
    }
    return usage;
}

export function getUnmappedSkirmishApkTerrainIds(map: ApkAemMap): number[] {
    return Object.keys(getApkAemTerrainUsage(map))
        .map(Number)
        .filter(apkTerrainId => mapSkirmishApkTerrainId(apkTerrainId) === null)
        .sort((a, b) => a - b);
}

export function getApkAemTerrainConfidenceUsage(map: ApkAemMap): ApkAemTerrainConfidenceUsage {
    const approximateTerrainIds: number[] = [];
    const unmappedTerrainIds: number[] = [];
    let approximateTileCount = 0;
    let unmappedTileCount = 0;

    for (const [terrainIdText, count] of Object.entries(getApkAemTerrainUsage(map))) {
        const apkTerrainId = Number(terrainIdText);
        const confidence = getSkirmishApkTerrainMappingInfo(apkTerrainId).confidence;
        if (confidence === 'approximate') {
            approximateTerrainIds.push(apkTerrainId);
            approximateTileCount += count;
        } else if (confidence === 'unmapped') {
            unmappedTerrainIds.push(apkTerrainId);
            unmappedTileCount += count;
        }
    }

    return {
        approximateTerrainIds: approximateTerrainIds.sort((a, b) => a - b),
        approximateTileCount,
        unmappedTerrainIds: unmappedTerrainIds.sort((a, b) => a - b),
        unmappedTileCount
    };
}

function getInitialGold(map: ApkAemMap, options: CreateGameStateFromApkAemMapOptions): number {
    if (options.initialGold !== undefined) return options.initialGold;
    if (options.useRecommendedGold !== false && map.recommendedGold !== null) return map.recommendedGold;
    return 0;
}

function createUnitsFromApkAemMap(map: ApkAemMap): Unit[] {
    return map.units.map((unit, index) => {
        if (!unit.unitClass) {
            throw new Error(`AEM 单位 ${index} 使用未知 APK 单位 ID: ${unit.apkUnitId}`);
        }

        return {
            id: `apk_u${index}`,
            ownerId: unit.teamId,
            unitClass: unit.unitClass,
            pos: { x: unit.x, y: unit.y },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: 0,
            exp: 0,
            apkUnitId: unit.apkUnitId,
            apkUnitExtra: unit.extra
        };
    });
}

function createMetadataFromApkAemMap(map: ApkAemMap, options: CreateGameStateFromApkAemMapOptions): GameMetadata {
    const confidenceUsage = getApkAemTerrainConfidenceUsage(map);
    const metadata: GameMetadata = {
        ...(options.metadata ?? {}),
        source: 'apk_aem',
        recommendedGold: map.recommendedGold,
        apkTailTemplate: map.tail.template,
        apkApproximateTerrainIds: confidenceUsage.approximateTerrainIds,
        apkApproximateTileCount: confidenceUsage.approximateTileCount,
        apkUnmappedTerrainIds: confidenceUsage.unmappedTerrainIds,
        apkUnmappedTileCount: confidenceUsage.unmappedTileCount
    };

    if (options.mapName !== undefined) {
        metadata.apkMapName = options.mapName;
    }
    if (options.apkVersion !== undefined) {
        metadata.apkVersion = options.apkVersion;
    }
    if (options.apkSha256 !== undefined) {
        metadata.apkSha256 = options.apkSha256;
    }
    if (options.apkResourcePath !== undefined) {
        metadata.apkResourcePath = options.apkResourcePath;
    }

    return metadata;
}

export function createGameStateFromApkAemMap(
    map: ApkAemMap,
    options: CreateGameStateFromApkAemMapOptions = {}
): GameState {
    const unmappedTerrainIds = getUnmappedSkirmishApkTerrainIds(map);
    const strictTerrain = options.strictTerrain ?? true;
    if (strictTerrain && unmappedTerrainIds.length > 0) {
        throw new Error(`AEM 地图存在未映射 APK tile: ${unmappedTerrainIds.join(', ')}`);
    }

    const terrainFallback = options.fallbackTerrainId ?? 6;
    const tiles = map.terrain.map(row => row.map(cell => {
        const terrainId = mapSkirmishApkTerrainId(cell.apkTerrainId) ?? terrainFallback;
        return {
            terrainId,
            ownerId: cell.ownerId,
            apkTerrainId: cell.apkTerrainId,
            apkTerrainRaw: cell.raw,
            apkOwnerCode: cell.ownerCode
        };
    }));

    const teamIds = [...new Set([
        ...map.playerIds,
        ...map.units.map(unit => unit.teamId)
    ])].sort((a, b) => a - b);
    const gold = getInitialGold(map, options);
    const rules = mergeRuleConfig(
        { defeatOnNoUnitsAndNoCastles: true },
        options.rules
    );

    const state: GameState = {
        turn: 1,
        currentPlayer: options.currentPlayer ?? teamIds[0] ?? 0,
        map: {
            width: map.width,
            height: map.height,
            tiles
        },
        units: createUnitsFromApkAemMap(map),
        players: teamIds.map(id => ({
            id,
            gold,
            isAlive: true,
            commanderDeathCount: 0
        })),
        winner: null,
        nextUnitId: map.units.length,
        nextGraveId: 100,
        rules,
        metadata: createMetadataFromApkAemMap(map, options)
    };

    return applyInitialRuleConfig(state);
}
