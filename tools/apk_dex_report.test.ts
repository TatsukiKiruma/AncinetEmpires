import { describe, expect, it } from 'vitest';
import {
    buildKeywordReports,
    parseDexMethodSignatures,
    parseDexStrings,
    readDexString,
    readUleb128
} from './apk_dex_report';

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

function alignToFour(value: number): number {
    return (value + 3) & ~3;
}

function createTypeList(typeIndexes: readonly number[]): Buffer {
    const rawLength = 4 + typeIndexes.length * 2;
    const buffer = Buffer.alloc(alignToFour(rawLength));
    buffer.writeUInt32LE(typeIndexes.length, 0);
    for (let i = 0; i < typeIndexes.length; i += 1) {
        buffer.writeUInt16LE(typeIndexes[i], 4 + i * 2);
    }
    return buffer;
}

function createMinimalMethodDex(): Buffer {
    const strings = [
        'Lc/a/b/a/o;',
        'V',
        'I',
        'Ljava/lang/String;',
        'Z',
        'SyncSetCommander',
        'CheckCommander',
        'ignored'
    ];
    const typeStringIndexes = [0, 1, 2, 3, 4];
    const protos = [
        { returnTypeIndex: 1, parameterTypeIndexes: [2, 2] },
        { returnTypeIndex: 4, parameterTypeIndexes: [3] }
    ];
    const methods = [
        { classIndex: 0, protoIndex: 0, nameStringIndex: 5 },
        { classIndex: 0, protoIndex: 1, nameStringIndex: 6 },
        { classIndex: 0, protoIndex: 0, nameStringIndex: 7 }
    ];
    const typeLists = protos.map(proto => createTypeList(proto.parameterTypeIndexes));
    const headerSize = 0x70;
    const stringIdsOffset = headerSize;
    const typeIdsOffset = stringIdsOffset + strings.length * 4;
    const protoIdsOffset = typeIdsOffset + typeStringIndexes.length * 4;
    const methodIdsOffset = protoIdsOffset + protos.length * 12;
    const typeListsOffset = methodIdsOffset + methods.length * 8;
    const stringDataOffset = typeListsOffset + typeLists.reduce((sum, item) => sum + item.length, 0);
    const stringDataItems = strings.map(createDexString);
    const totalSize = stringDataOffset + stringDataItems.reduce((sum, item) => sum + item.length, 0);
    const buffer = Buffer.alloc(totalSize);

    buffer.write('dex\n035\0', 0, 'ascii');
    buffer.writeUInt32LE(strings.length, 0x38);
    buffer.writeUInt32LE(stringIdsOffset, 0x3c);
    buffer.writeUInt32LE(typeStringIndexes.length, 0x40);
    buffer.writeUInt32LE(typeIdsOffset, 0x44);
    buffer.writeUInt32LE(protos.length, 0x48);
    buffer.writeUInt32LE(protoIdsOffset, 0x4c);
    buffer.writeUInt32LE(methods.length, 0x58);
    buffer.writeUInt32LE(methodIdsOffset, 0x5c);

    let currentOffset = stringDataOffset;
    for (let i = 0; i < strings.length; i += 1) {
        buffer.writeUInt32LE(currentOffset, stringIdsOffset + i * 4);
        stringDataItems[i].copy(buffer, currentOffset);
        currentOffset += stringDataItems[i].length;
    }

    for (let i = 0; i < typeStringIndexes.length; i += 1) {
        buffer.writeUInt32LE(typeStringIndexes[i], typeIdsOffset + i * 4);
    }

    currentOffset = typeListsOffset;
    for (let i = 0; i < protos.length; i += 1) {
        const protoOffset = protoIdsOffset + i * 12;
        buffer.writeUInt32LE(0, protoOffset);
        buffer.writeUInt32LE(protos[i].returnTypeIndex, protoOffset + 4);
        buffer.writeUInt32LE(currentOffset, protoOffset + 8);
        typeLists[i].copy(buffer, currentOffset);
        currentOffset += typeLists[i].length;
    }

    for (let i = 0; i < methods.length; i += 1) {
        const methodOffset = methodIdsOffset + i * 8;
        buffer.writeUInt16LE(methods[i].classIndex, methodOffset);
        buffer.writeUInt16LE(methods[i].protoIndex, methodOffset + 2);
        buffer.writeUInt32LE(methods[i].nameStringIndex, methodOffset + 4);
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

    it('解析 DEX 方法签名', () => {
        const dex = createMinimalMethodDex();
        expect(parseDexMethodSignatures(dex, ['SyncSetCommander', 'CheckCommander'])).toEqual([
            {
                classDescriptor: 'Lc/a/b/a/o;',
                name: 'CheckCommander',
                returnType: 'Z',
                parameterTypes: ['Ljava/lang/String;']
            },
            {
                classDescriptor: 'Lc/a/b/a/o;',
                name: 'SyncSetCommander',
                returnType: 'V',
                parameterTypes: ['I', 'I']
            }
        ]);
    });

    it('按规则关键词分组输出战斗、支援和状态证据', () => {
        const reports = buildKeywordReports([
            'Cannot attack from (',
            'Cannot attack in state [',
            'Cannot support from (',
            'Cannot support in state [',
            'android.support.v4.app.Fragment',
            'SyncSetUnitStatus',
            '[Stage.SyncSetUnitStatus] No unit at (',
            '[Stage.SyncSetUnitStatus] Invalid status: ',
            '[Stage.SyncSetUnitStatus] Invalid rounds: ',
            'AsyncAttack',
            '[Stage.AsyncAttack] Invalid position: ('
        ]);
        const byGroup = Object.fromEntries(reports.map(report => [report.group, report]));

        expect(byGroup.combat_action.matches).toEqual([
            '[Stage.AsyncAttack] Invalid position: (',
            'AsyncAttack',
            'Cannot attack from (',
            'Cannot attack in state ['
        ]);
        expect(byGroup.support_action.matches).toEqual([
            'Cannot support from (',
            'Cannot support in state ['
        ]);
        expect(byGroup.support_action.matches).not.toContain('android.support.v4.app.Fragment');
        expect(byGroup.status_stage.matches).toEqual([
            '[Stage.SyncSetUnitStatus] Invalid rounds: ',
            '[Stage.SyncSetUnitStatus] Invalid status: ',
            '[Stage.SyncSetUnitStatus] No unit at (',
            'SyncSetUnitStatus'
        ]);
    });
});
