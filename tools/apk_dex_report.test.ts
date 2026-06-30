import { describe, expect, it } from 'vitest';
import { parseDexStrings, readDexString, readUleb128 } from './apk_dex_report';

function encodeUleb128(value: number): number[] {
    const bytes: number[] = [];
    let remaining = value >>> 0;

    do {
        let byte = remaining & 0x7f;
        remaining >>>= 7;
        if (remaining !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (remaining !== 0);

    return bytes;
}

function createDexString(value: string): Buffer {
    return Buffer.from([
        ...encodeUleb128(value.length),
        ...Buffer.from(value, 'utf8'),
        0
    ]);
}

function createMinimalDex(strings: readonly string[]): Buffer {
    const headerSize = 0x70;
    const stringIdsOffset = headerSize;
    const stringDataOffset = stringIdsOffset + strings.length * 4;
    const stringDataItems = strings.map(createDexString);
    const totalSize = stringDataOffset + stringDataItems.reduce((sum, item) => sum + item.length, 0);
    const buffer = Buffer.alloc(totalSize);

    buffer.write('dex\n035\0', 0, 'ascii');
    buffer.writeUInt32LE(strings.length, 0x38);
    buffer.writeUInt32LE(stringIdsOffset, 0x3c);

    let currentOffset = stringDataOffset;
    for (let i = 0; i < strings.length; i += 1) {
        buffer.writeUInt32LE(currentOffset, stringIdsOffset + i * 4);
        stringDataItems[i].copy(buffer, currentOffset);
        currentOffset += stringDataItems[i].length;
    }

    return buffer;
}

describe('APK DEX 复核工具', () => {
    it('读取 ULEB128 数值', () => {
        expect(readUleb128(Buffer.from([0x7f]), 0)).toEqual({ value: 127, nextOffset: 1 });
        expect(readUleb128(Buffer.from([0x80, 0x01]), 0)).toEqual({ value: 128, nextOffset: 2 });
        expect(readUleb128(Buffer.from([0xe5, 0x8e, 0x26]), 0)).toEqual({ value: 624485, nextOffset: 3 });
    });

    it('读取 DEX MUTF-8 字符串', () => {
        expect(readDexString(createDexString('CheckCommander'), 0).value).toBe('CheckCommander');
        expect(readDexString(createDexString('指挥官'), 0).value).toBe('指挥官');
    });

    it('解析最小 DEX 字符串表', () => {
        const dex = createMinimalDex(['CheckCommander', 'SyncSetRecruitUnits', 'SetPrices']);
        expect(parseDexStrings(dex)).toEqual(['CheckCommander', 'SyncSetRecruitUnits', 'SetPrices']);
    });
});
