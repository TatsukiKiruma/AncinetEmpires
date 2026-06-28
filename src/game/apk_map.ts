import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { mapKnownApkTerrainId } from './apk_terrain';
import { TerrainId } from './terrain';
import { UnitClass } from './types';

export const APK_AEM_MAGIC = 365703;
export const APK_AEM_TERRAIN_RECORD_SIZE = 4;

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

export function parseApkAemMap(data: Uint8Array): ApkAemMap {
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
    const tailStart = offset + terrainCount * APK_AEM_TERRAIN_RECORD_SIZE;
    const unitBlock = parseUnits(data, tailStart, width, height);

    return {
        magic,
        width,
        height,
        author,
        playerIds,
        terrainRecordOffset: offset,
        terrainCount,
        terrain,
        ...unitBlock
    };
}

export function getApkAemTerrainUsage(map: ApkAemMap): Record<number, number> {
    const usage: Record<number, number> = {};
    for (const row of map.terrain) {
        for (const cell of row) {
            usage[cell.apkTerrainId] = (usage[cell.apkTerrainId] ?? 0) + 1;
        }
    }
    return usage;
}
