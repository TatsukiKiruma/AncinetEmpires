import { describe, expect, it } from 'vitest';
import {
    buildKeywordReports,
    parseDexKeyRuleMethodEvidence,
    parseDexMethodSignatures,
    parseDexRuleDefaultIncomeEvidence,
    parseDexStringReferenceMethods,
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

function createCodeItem(registersSize: number, insSize: number, instructions: readonly number[]): Buffer {
    const buffer = Buffer.alloc(16 + instructions.length * 2);
    buffer.writeUInt16LE(registersSize, 0);
    buffer.writeUInt16LE(insSize, 2);
    buffer.writeUInt32LE(instructions.length, 12);
    for (let i = 0; i < instructions.length; i += 1) {
        buffer.writeUInt16LE(instructions[i], 16 + i * 2);
    }
    return buffer;
}

function concatBuffers(buffers: readonly Buffer[]): Buffer {
    return Buffer.concat(buffers);
}

function createMinimalRuleIncomeDex(): Buffer {
    const strings = [
        'Lc/a/b/a/x/e;',
        'Lc/a/b/a/t/d;',
        'I',
        'V',
        '<init>',
        'SetIncomeCommanderBase',
        'SetIncomeCommanderGrowth',
        's',
        't'
    ];
    const typeStringIndexes = [0, 1, 2, 3];
    const protos = [
        { returnTypeIndex: 3, parameterTypeIndexes: [] },
        { returnTypeIndex: 3, parameterTypeIndexes: [2] }
    ];
    const fields = [
        { classIndex: 1, typeIndex: 2, nameStringIndex: 7 },
        { classIndex: 1, typeIndex: 2, nameStringIndex: 8 }
    ];
    const methods = [
        { classIndex: 1, protoIndex: 0, nameStringIndex: 4 },
        { classIndex: 0, protoIndex: 1, nameStringIndex: 5 },
        { classIndex: 0, protoIndex: 1, nameStringIndex: 6 }
    ];
    const typeListInt = createTypeList([2]);
    const stringDataItems = strings.map(createDexString);
    const headerSize = 0x70;
    const stringIdsOffset = headerSize;
    const typeIdsOffset = stringIdsOffset + strings.length * 4;
    const protoIdsOffset = typeIdsOffset + typeStringIndexes.length * 4;
    const fieldIdsOffset = protoIdsOffset + protos.length * 12;
    const methodIdsOffset = fieldIdsOffset + fields.length * 8;
    const classDefsOffset = methodIdsOffset + methods.length * 8;
    const typeListOffset = classDefsOffset + 2 * 32;
    const stringDataOffset = typeListOffset + typeListInt.length;
    const rawStringDataEnd = stringDataOffset + stringDataItems.reduce((sum, item) => sum + item.length, 0);
    const constructorCodeOffset = alignToFour(rawStringDataEnd);
    const constructorCode = createCodeItem(2, 1, [
        0x0013, 50,
        0x1059, 0,
        0x0013, 25,
        0x1059, 1,
        0x000e
    ]);
    const baseSetterCodeOffset = alignToFour(constructorCodeOffset + constructorCode.length);
    const baseSetterCode = createCodeItem(3, 2, [
        0x0259, 0,
        0x000e
    ]);
    const growthSetterCodeOffset = alignToFour(baseSetterCodeOffset + baseSetterCode.length);
    const growthSetterCode = createCodeItem(3, 2, [
        0x0259, 1,
        0x000e
    ]);
    const dataClassData = Buffer.from([
        ...encodeUleb128(0),
        ...encodeUleb128(2),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(constructorCodeOffset)
    ]);
    const dataClassDataOffset = alignToFour(growthSetterCodeOffset + growthSetterCode.length);
    const ruleClassData = Buffer.from([
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(2),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(baseSetterCodeOffset),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(growthSetterCodeOffset)
    ]);
    const ruleClassDataOffset = dataClassDataOffset + dataClassData.length;
    const totalSize = ruleClassDataOffset + ruleClassData.length;
    const buffer = Buffer.alloc(totalSize);

    buffer.write('dex\n035\0', 0, 'ascii');
    buffer.writeUInt32LE(strings.length, 0x38);
    buffer.writeUInt32LE(stringIdsOffset, 0x3c);
    buffer.writeUInt32LE(typeStringIndexes.length, 0x40);
    buffer.writeUInt32LE(typeIdsOffset, 0x44);
    buffer.writeUInt32LE(protos.length, 0x48);
    buffer.writeUInt32LE(protoIdsOffset, 0x4c);
    buffer.writeUInt32LE(fields.length, 0x50);
    buffer.writeUInt32LE(fieldIdsOffset, 0x54);
    buffer.writeUInt32LE(methods.length, 0x58);
    buffer.writeUInt32LE(methodIdsOffset, 0x5c);
    buffer.writeUInt32LE(2, 0x60);
    buffer.writeUInt32LE(classDefsOffset, 0x64);

    let currentOffset = stringDataOffset;
    for (let i = 0; i < strings.length; i += 1) {
        buffer.writeUInt32LE(currentOffset, stringIdsOffset + i * 4);
        stringDataItems[i].copy(buffer, currentOffset);
        currentOffset += stringDataItems[i].length;
    }

    for (let i = 0; i < typeStringIndexes.length; i += 1) {
        buffer.writeUInt32LE(typeStringIndexes[i], typeIdsOffset + i * 4);
    }

    for (let i = 0; i < protos.length; i += 1) {
        const protoOffset = protoIdsOffset + i * 12;
        buffer.writeUInt32LE(3, protoOffset);
        buffer.writeUInt32LE(protos[i].returnTypeIndex, protoOffset + 4);
        buffer.writeUInt32LE(protos[i].parameterTypeIndexes.length > 0 ? typeListOffset : 0, protoOffset + 8);
    }

    for (let i = 0; i < fields.length; i += 1) {
        const fieldOffset = fieldIdsOffset + i * 8;
        buffer.writeUInt16LE(fields[i].classIndex, fieldOffset);
        buffer.writeUInt16LE(fields[i].typeIndex, fieldOffset + 2);
        buffer.writeUInt32LE(fields[i].nameStringIndex, fieldOffset + 4);
    }

    for (let i = 0; i < methods.length; i += 1) {
        const methodOffset = methodIdsOffset + i * 8;
        buffer.writeUInt16LE(methods[i].classIndex, methodOffset);
        buffer.writeUInt16LE(methods[i].protoIndex, methodOffset + 2);
        buffer.writeUInt32LE(methods[i].nameStringIndex, methodOffset + 4);
    }

    const dataClassDefOffset = classDefsOffset;
    buffer.writeUInt32LE(1, dataClassDefOffset);
    buffer.writeUInt32LE(dataClassDataOffset, dataClassDefOffset + 24);
    const ruleClassDefOffset = classDefsOffset + 32;
    buffer.writeUInt32LE(0, ruleClassDefOffset);
    buffer.writeUInt32LE(ruleClassDataOffset, ruleClassDefOffset + 24);

    typeListInt.copy(buffer, typeListOffset);
    constructorCode.copy(buffer, constructorCodeOffset);
    baseSetterCode.copy(buffer, baseSetterCodeOffset);
    growthSetterCode.copy(buffer, growthSetterCodeOffset);
    dataClassData.copy(buffer, dataClassDataOffset);
    ruleClassData.copy(buffer, ruleClassDataOffset);

    return concatBuffers([buffer]);
}

function createMinimalStringReferenceDex(): Buffer {
    const strings = [
        'Lc/a/b/a/l;',
        'V',
        'Cannot attack from (',
        'Cannot support from (',
        'i',
        'm'
    ];
    const typeStringIndexes = [0, 1];
    const methods = [
        { classIndex: 0, protoIndex: 0, nameStringIndex: 4, stringIndex: 2 },
        { classIndex: 0, protoIndex: 0, nameStringIndex: 5, stringIndex: 3 }
    ];
    const stringDataItems = strings.map(createDexString);
    const headerSize = 0x70;
    const stringIdsOffset = headerSize;
    const typeIdsOffset = stringIdsOffset + strings.length * 4;
    const protoIdsOffset = typeIdsOffset + typeStringIndexes.length * 4;
    const methodIdsOffset = protoIdsOffset + 12;
    const classDefsOffset = methodIdsOffset + methods.length * 8;
    const stringDataOffset = classDefsOffset + 32;
    const rawStringDataEnd = stringDataOffset + stringDataItems.reduce((sum, item) => sum + item.length, 0);
    const firstCodeOffset = alignToFour(rawStringDataEnd);
    const firstCode = createCodeItem(1, 0, [0x001a, methods[0].stringIndex, 0x000e]);
    const secondCodeOffset = alignToFour(firstCodeOffset + firstCode.length);
    const secondCode = createCodeItem(1, 0, [0x001a, methods[1].stringIndex, 0x000e]);
    const classData = Buffer.from([
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(2),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(firstCodeOffset),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(secondCodeOffset)
    ]);
    const classDataOffset = alignToFour(secondCodeOffset + secondCode.length);
    const totalSize = classDataOffset + classData.length;
    const buffer = Buffer.alloc(totalSize);

    buffer.write('dex\n035\0', 0, 'ascii');
    buffer.writeUInt32LE(strings.length, 0x38);
    buffer.writeUInt32LE(stringIdsOffset, 0x3c);
    buffer.writeUInt32LE(typeStringIndexes.length, 0x40);
    buffer.writeUInt32LE(typeIdsOffset, 0x44);
    buffer.writeUInt32LE(1, 0x48);
    buffer.writeUInt32LE(protoIdsOffset, 0x4c);
    buffer.writeUInt32LE(methods.length, 0x58);
    buffer.writeUInt32LE(methodIdsOffset, 0x5c);
    buffer.writeUInt32LE(1, 0x60);
    buffer.writeUInt32LE(classDefsOffset, 0x64);

    let currentOffset = stringDataOffset;
    for (let i = 0; i < strings.length; i += 1) {
        buffer.writeUInt32LE(currentOffset, stringIdsOffset + i * 4);
        stringDataItems[i].copy(buffer, currentOffset);
        currentOffset += stringDataItems[i].length;
    }

    for (let i = 0; i < typeStringIndexes.length; i += 1) {
        buffer.writeUInt32LE(typeStringIndexes[i], typeIdsOffset + i * 4);
    }

    buffer.writeUInt32LE(1, protoIdsOffset);
    buffer.writeUInt32LE(1, protoIdsOffset + 4);
    buffer.writeUInt32LE(0, protoIdsOffset + 8);

    for (let i = 0; i < methods.length; i += 1) {
        const methodOffset = methodIdsOffset + i * 8;
        buffer.writeUInt16LE(methods[i].classIndex, methodOffset);
        buffer.writeUInt16LE(methods[i].protoIndex, methodOffset + 2);
        buffer.writeUInt32LE(methods[i].nameStringIndex, methodOffset + 4);
    }

    buffer.writeUInt32LE(0, classDefsOffset);
    buffer.writeUInt32LE(classDataOffset, classDefsOffset + 24);
    firstCode.copy(buffer, firstCodeOffset);
    secondCode.copy(buffer, secondCodeOffset);
    classData.copy(buffer, classDataOffset);

    return buffer;
}

function createMinimalKeyRuleMethodDex(): Buffer {
    const strings = [
        'Lc/a/b/a/l;',
        'Lc/a/b/a/q;',
        'Lc/a/b/a/t/e;',
        'Lc/a/b/a/t/a;',
        'Lc/a/b/a/t/f;',
        'Lc/a/b/a/s/b;',
        'I',
        'V',
        'Z',
        'i',
        'm',
        'c',
        'a',
        'h',
        'b',
        'd',
        'Cannot attack from (',
        'Cannot attack in state [',
        'Cannot support from (',
        'Cannot support in state [',
        'Cannot recruit when stacked!',
        'Lc/a/b/a/t/b;',
        'Lc/a/b/a/v/b;',
        'Lc/a/b/a/t/g;',
        'e',
        'k',
        'n',
        'g',
        'j',
        'f',
        'y'
    ];
    const typeStringIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 21, 22, 23];
    const protos = [
        { returnTypeIndex: 7, parameterTypeIndexes: [6, 6] },
        { returnTypeIndex: 7, parameterTypeIndexes: [6, 6, 6] },
        { returnTypeIndex: 8, parameterTypeIndexes: [4, 6, 6] },
        { returnTypeIndex: 5, parameterTypeIndexes: [4] },
        { returnTypeIndex: 8, parameterTypeIndexes: [6, 6, 6] },
        { returnTypeIndex: 8, parameterTypeIndexes: [4, 11] },
        { returnTypeIndex: 8, parameterTypeIndexes: [4, 4] },
        { returnTypeIndex: 4, parameterTypeIndexes: [6, 6] }
    ];
    const fields = [
        { classIndex: 2, typeIndex: 6, nameStringIndex: 12 },
        { classIndex: 3, typeIndex: 4, nameStringIndex: 15 },
        { classIndex: 1, typeIndex: 9, nameStringIndex: 24 },
        { classIndex: 11, typeIndex: 11, nameStringIndex: 29 },
        { classIndex: 10, typeIndex: 6, nameStringIndex: 13 },
        { classIndex: 4, typeIndex: 8, nameStringIndex: 9 },
        { classIndex: 4, typeIndex: 8, nameStringIndex: 28 },
        { classIndex: 4, typeIndex: 6, nameStringIndex: 26 },
        { classIndex: 11, typeIndex: 11, nameStringIndex: 30 }
    ];
    const methods = [
        { classIndex: 0, protoIndex: 0, nameStringIndex: 9 },
        { classIndex: 0, protoIndex: 0, nameStringIndex: 10 },
        { classIndex: 0, protoIndex: 1, nameStringIndex: 11 },
        { classIndex: 1, protoIndex: 2, nameStringIndex: 12 },
        { classIndex: 1, protoIndex: 3, nameStringIndex: 10 },
        { classIndex: 1, protoIndex: 2, nameStringIndex: 13 },
        { classIndex: 1, protoIndex: 4, nameStringIndex: 14 },
        { classIndex: 1, protoIndex: 5, nameStringIndex: 12 },
        { classIndex: 1, protoIndex: 2, nameStringIndex: 24 },
        { classIndex: 1, protoIndex: 6, nameStringIndex: 28 },
        { classIndex: 1, protoIndex: 7, nameStringIndex: 25 },
        { classIndex: 1, protoIndex: 6, nameStringIndex: 26 },
        { classIndex: 1, protoIndex: 6, nameStringIndex: 27 }
    ];
    const typeLists = protos.map(proto => createTypeList(proto.parameterTypeIndexes));
    const stringDataItems = strings.map(createDexString);
    const headerSize = 0x70;
    const stringIdsOffset = headerSize;
    const typeIdsOffset = stringIdsOffset + strings.length * 4;
    const protoIdsOffset = typeIdsOffset + typeStringIndexes.length * 4;
    const fieldIdsOffset = protoIdsOffset + protos.length * 12;
    const methodIdsOffset = fieldIdsOffset + fields.length * 8;
    const classDefsOffset = methodIdsOffset + methods.length * 8;
    const typeListsOffset = classDefsOffset + 2 * 32;
    const stringDataOffset = typeListsOffset + typeLists.reduce((sum, item) => sum + item.length, 0);
    const rawStringDataEnd = stringDataOffset + stringDataItems.reduce((sum, item) => sum + item.length, 0);
    const attackCodeOffset = alignToFour(rawStringDataEnd);
    const attackCode = createCodeItem(4, 3, [
        0x2012,
        0x0052, 0,
        0x001a, 16,
        0x001a, 17,
        0x006e, 3, 0,
        0x006e, 4, 0,
        0x000e
    ]);
    const supportCodeOffset = alignToFour(attackCodeOffset + attackCode.length);
    const supportCode = createCodeItem(4, 3, [
        0x2012,
        0x0052, 0,
        0x001a, 18,
        0x001a, 19,
        0x006e, 5, 0,
        0x000e
    ]);
    const recruitCodeOffset = alignToFour(supportCodeOffset + supportCode.length);
    const recruitCode = createCodeItem(5, 4, [
        0x1012,
        0x0052, 1,
        0x001a, 20,
        0x006e, 6, 0,
        0x000e
    ]);
    const qAttackCodeOffset = alignToFour(recruitCodeOffset + recruitCode.length);
    const qAttackCode = createCodeItem(5, 3, [
        0x0052, 2,
        0x0062, 3,
        0x0052, 4,
        0x006e, 7, 0,
        0x006e, 8, 0,
        0x006e, 9, 0,
        0x000f
    ]);
    const qSupportPositionCodeOffset = alignToFour(qAttackCodeOffset + qAttackCode.length);
    const qSupportPositionCode = createCodeItem(4, 3, [
        0x006e, 10, 0,
        0x006e, 11, 0,
        0x000f
    ]);
    const qSupportTargetCodeOffset = alignToFour(qSupportPositionCodeOffset + qSupportPositionCode.length);
    const qSupportTargetCode = createCodeItem(4, 2, [
        0x0052, 5,
        0x0052, 6,
        0x0052, 7,
        0x0062, 8,
        0x006e, 7, 0,
        0x006e, 12, 0,
        0x000f
    ]);
    const lClassData = Buffer.from([
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(3),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(attackCodeOffset),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(supportCodeOffset),
        ...encodeUleb128(1),
        ...encodeUleb128(0),
        ...encodeUleb128(recruitCodeOffset)
    ]);
    const lClassDataOffset = alignToFour(qSupportTargetCodeOffset + qSupportTargetCode.length);
    const qClassData = Buffer.from([
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(0),
        ...encodeUleb128(3),
        ...encodeUleb128(3),
        ...encodeUleb128(0),
        ...encodeUleb128(qAttackCodeOffset),
        ...encodeUleb128(2),
        ...encodeUleb128(0),
        ...encodeUleb128(qSupportPositionCodeOffset),
        ...encodeUleb128(6),
        ...encodeUleb128(0),
        ...encodeUleb128(qSupportTargetCodeOffset)
    ]);
    const qClassDataOffset = lClassDataOffset + lClassData.length;
    const totalSize = qClassDataOffset + qClassData.length;
    const buffer = Buffer.alloc(totalSize);

    buffer.write('dex\n035\0', 0, 'ascii');
    buffer.writeUInt32LE(strings.length, 0x38);
    buffer.writeUInt32LE(stringIdsOffset, 0x3c);
    buffer.writeUInt32LE(typeStringIndexes.length, 0x40);
    buffer.writeUInt32LE(typeIdsOffset, 0x44);
    buffer.writeUInt32LE(protos.length, 0x48);
    buffer.writeUInt32LE(protoIdsOffset, 0x4c);
    buffer.writeUInt32LE(fields.length, 0x50);
    buffer.writeUInt32LE(fieldIdsOffset, 0x54);
    buffer.writeUInt32LE(methods.length, 0x58);
    buffer.writeUInt32LE(methodIdsOffset, 0x5c);
    buffer.writeUInt32LE(2, 0x60);
    buffer.writeUInt32LE(classDefsOffset, 0x64);

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
        buffer.writeUInt32LE(protos[i].returnTypeIndex, protoOffset);
        buffer.writeUInt32LE(protos[i].returnTypeIndex, protoOffset + 4);
        buffer.writeUInt32LE(currentOffset, protoOffset + 8);
        typeLists[i].copy(buffer, currentOffset);
        currentOffset += typeLists[i].length;
    }

    for (let i = 0; i < fields.length; i += 1) {
        const fieldOffset = fieldIdsOffset + i * 8;
        buffer.writeUInt16LE(fields[i].classIndex, fieldOffset);
        buffer.writeUInt16LE(fields[i].typeIndex, fieldOffset + 2);
        buffer.writeUInt32LE(fields[i].nameStringIndex, fieldOffset + 4);
    }

    for (let i = 0; i < methods.length; i += 1) {
        const methodOffset = methodIdsOffset + i * 8;
        buffer.writeUInt16LE(methods[i].classIndex, methodOffset);
        buffer.writeUInt16LE(methods[i].protoIndex, methodOffset + 2);
        buffer.writeUInt32LE(methods[i].nameStringIndex, methodOffset + 4);
    }

    buffer.writeUInt32LE(0, classDefsOffset);
    buffer.writeUInt32LE(lClassDataOffset, classDefsOffset + 24);
    buffer.writeUInt32LE(1, classDefsOffset + 32);
    buffer.writeUInt32LE(qClassDataOffset, classDefsOffset + 32 + 24);
    attackCode.copy(buffer, attackCodeOffset);
    supportCode.copy(buffer, supportCodeOffset);
    recruitCode.copy(buffer, recruitCodeOffset);
    qAttackCode.copy(buffer, qAttackCodeOffset);
    qSupportPositionCode.copy(buffer, qSupportPositionCodeOffset);
    qSupportTargetCode.copy(buffer, qSupportTargetCodeOffset);
    lClassData.copy(buffer, lClassDataOffset);
    qClassData.copy(buffer, qClassDataOffset);

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

    it('解析规则默认指挥官收入字段', () => {
        expect(parseDexRuleDefaultIncomeEvidence(createMinimalRuleIncomeDex())).toEqual({
            ruleClassDescriptor: 'Lc/a/b/a/x/e;',
            ruleDataClassDescriptor: 'Lc/a/b/a/t/d;',
            commanderBaseSetter: 'SetIncomeCommanderBase',
            commanderBaseField: 's:I',
            commanderBaseDefault: 50,
            commanderGrowthSetter: 'SetIncomeCommanderGrowth',
            commanderGrowthField: 't:I',
            commanderGrowthDefault: 25
        });
    });

    it('反查 DEX 字符串引用方法', () => {
        expect(parseDexStringReferenceMethods(
            createMinimalStringReferenceDex(),
            ['Cannot support from (', 'Cannot attack from (']
        )).toEqual([
            expect.objectContaining({
                string: 'Cannot attack from (',
                classDescriptor: 'Lc/a/b/a/l;',
                name: 'i',
                returnType: 'V',
                parameterTypes: []
            }),
            expect.objectContaining({
                string: 'Cannot support from (',
                classDescriptor: 'Lc/a/b/a/l;',
                name: 'm',
                returnType: 'V',
                parameterTypes: []
            })
        ]);
    });

    it('解析攻击、支援和招募关键方法字节码证据', () => {
        const evidence = parseDexKeyRuleMethodEvidence(createMinimalKeyRuleMethodDex());
        const byId = Object.fromEntries(evidence.map(item => [item.id, item]));

        expect(byId['attack-action-validation'].missingExpectations).toEqual([]);
        expect(byId['attack-action-validation'].referencedMethods).toContain('Lc/a/b/a/q;.a(Lc/a/b/a/t/f;,I,I):Z');
        expect(byId['attack-action-validation'].referencedMethods).toContain('Lc/a/b/a/q;.m(Lc/a/b/a/t/f;):Lc/a/b/a/s/b;');
        expect(byId['attack-target-validation'].missingExpectations).toEqual([]);
        expect(byId['attack-target-validation'].referencedFields).toContain('Lc/a/b/a/t/g;.f:Lc/a/b/a/t/g;');
        expect(byId['attack-target-validation'].referencedMethods).toContain('Lc/a/b/a/q;.j(Lc/a/b/a/t/f;,Lc/a/b/a/t/f;):Z');
        expect(byId['support-action-validation'].missingExpectations).toEqual([]);
        expect(byId['support-action-validation'].referencedMethods).toContain('Lc/a/b/a/q;.h(Lc/a/b/a/t/f;,I,I):Z');
        expect(byId['support-position-validation'].missingExpectations).toEqual([]);
        expect(byId['support-position-validation'].referencedMethods).toContain('Lc/a/b/a/q;.n(Lc/a/b/a/t/f;,Lc/a/b/a/t/f;):Z');
        expect(byId['support-target-validation'].missingExpectations).toEqual([]);
        expect(byId['support-target-validation'].referencedFields).toContain('Lc/a/b/a/t/g;.y:Lc/a/b/a/t/g;');
        expect(byId['support-target-validation'].referencedMethods).toContain('Lc/a/b/a/q;.g(Lc/a/b/a/t/f;,Lc/a/b/a/t/f;):Z');
        expect(byId['recruit-pending-validation'].missingExpectations).toEqual([]);
        expect(byId['recruit-pending-validation'].referencedFields).toContain('Lc/a/b/a/t/a;.d:Lc/a/b/a/t/f;');
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
