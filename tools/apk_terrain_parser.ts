import type { ApkTerrainConfig } from '../src/game/apk_terrain';

// C0573c 对象和数组都有空标记，地形记录必须按 C0619b 字段顺序消费。
function readRecord(buffer: Buffer, start: number, id: number): { config: ApkTerrainConfig; end: number } {
    let offset = start;
    function requireBytes(length: number): void {
        if (offset < 0 || offset + length > buffer.length) throw new Error(`APK 地形记录越界: id=${id}, offset=${offset}`);
    }
    function boolean(): boolean { requireBytes(1); return buffer[offset++] !== 0; }
    function int(): number { requireBytes(4); const value = buffer.readInt32BE(offset); offset += 4; return value; }
    if (boolean()) throw new Error(`APK 地形对象为空: id=${id}`);
    const isLand = boolean();
    const kind = int(), linkedA = int(), defenseBonus = int(), healPerTurn = int(), moveCost = int();
    const capturable = boolean(), linkedB = int(), linkedC = int();
    const flagC = Number(boolean());
    let variants: number[] | null = null;
    if (!flagC) {
        const length = int();
        if (length < 0 || length > Math.floor((buffer.length - offset) / 4)) throw new Error(`APK 地形变体数组越界: id=${id}`);
        variants = Array.from({ length }, () => int());
    }
    const graphicsType = int();
    return { config: {
        id, kind, isLand, capturable, flagA: Number(isLand), variant: kind,
        linkedA, defenseBonus, healPerTurn, moveCost, flagB: Number(capturable), linkedB, linkedC,
        flagC, tail: `0x${(graphicsType >>> 0).toString(16).padStart(8, '0')}`, variants, graphicsType
    }, end: offset };
}

export function parseApkTerrainRecord(buffer: Buffer, offset: number, id: number): ApkTerrainConfig {
    return readRecord(buffer, offset, id).config;
}

export function parseApkTerrainSection(decrypted: Buffer): { configs: ApkTerrainConfig[]; endOffset: number } {
    if (decrypted.length < 9) throw new Error('解密后的 data.bin 文件过小');
    if (decrypted.readUInt32BE(0) !== 365703) throw new Error('解密后的 data.bin magic 不匹配');
    if (decrypted[4] !== 0) throw new Error('APK 地形数组为空');
    const count = decrypted.readInt32BE(5);
    if (count < 0 || count > Math.floor((decrypted.length - 9) / 36)) throw new Error('APK 地形数组长度越界');
    let offset = 9;
    const configs: ApkTerrainConfig[] = [];
    for (let id = 0; id < count; id++) {
        const record = readRecord(decrypted, offset, id);
        configs.push(record.config);
        offset = record.end;
    }
    // 单位数组有独立 magic；用后续段边界防止静默错位。
    if (offset + 9 > decrypted.length || decrypted.readUInt32BE(offset) !== 365703
        || decrypted[offset + 4] !== 0 || decrypted.readInt32BE(offset + 5) < 0) {
        throw new Error(`APK 后续单位数组边界不匹配: offset=${offset}`);
    }
    return { configs, endOffset: offset };
}

export function parseApkTerrainConfigsFromDecryptedDataBin(decrypted: Buffer): ApkTerrainConfig[] {
    const section = parseApkTerrainSection(decrypted);
    if (decrypted.readInt32BE(section.endOffset + 5) !== 21) throw new Error('APK 后续单位数组数量不匹配');
    return section.configs;
}
