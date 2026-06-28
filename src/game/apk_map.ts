import { mapKnownApkTerrainId } from './apk_terrain';
import { TerrainId } from './terrain';

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

export interface ApkAemMap {
    magic: number;
    width: number;
    height: number;
    author: string | null;
    playerIds: number[];
    terrainRecordOffset: number;
    terrainCount: number;
    terrain: ApkAemTerrainCell[][];
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
            const recordOffset = offset + (y * width + x) * APK_AEM_TERRAIN_RECORD_SIZE;
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
        terrain
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
