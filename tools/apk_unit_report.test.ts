import { describe, expect, it } from 'vitest';
import {
    buildValueDistribution,
    parseApkUnitRecord,
    parseApkUnitRecordsFromDecryptedDataBin
} from './apk_unit_report';

function writeUnitRecord(
    buffer: Buffer,
    offset: number,
    values: {
        cost: number;
        population: number;
        attackElement: number;
        defenseShift: number;
        baseAttack: number;
        fieldF: number;
        attackGrowth: number;
        baseDefense: number;
        defenseGrowth: number;
        baseMaxHp: number;
        maxHpGrowth: number;
        baseMove: number;
        moveGrowth: number;
        maxRange: number;
        minRange: number;
        fieldP: number;
        abilityIds: number[];
        recruitableFlag: number;
        flagR: number;
        tailByte: number;
    }
): number {
    const fixed = [
        values.cost,
        values.population,
        values.attackElement,
        values.defenseShift,
        values.baseAttack,
        values.fieldF,
        values.attackGrowth,
        values.baseDefense,
        values.defenseGrowth,
        values.baseMaxHp,
        values.maxHpGrowth,
        values.baseMove,
        values.moveGrowth,
        values.maxRange,
        values.minRange,
        values.fieldP
    ];

    let cursor = offset;
    for (const value of fixed) {
        buffer.writeInt32BE(value, cursor);
        cursor += 4;
    }
    buffer[cursor] = values.abilityIds.length;
    cursor += 1;
    for (const abilityId of values.abilityIds) {
        buffer.writeInt32BE(abilityId, cursor);
        cursor += 4;
    }
    buffer[cursor] = values.recruitableFlag;
    buffer[cursor + 1] = values.flagR;
    buffer[cursor + 2] = values.tailByte;
    return cursor + 3;
}

describe('APK data.bin 单位复核工具', () => {
    it('解析单条变长单位记录', () => {
        const buffer = Buffer.alloc(128);
        const nextOffset = writeUnitRecord(buffer, 0, {
            cost: 150,
            population: 1,
            attackElement: 0,
            defenseShift: 0,
            baseAttack: 55,
            fieldF: 0,
            attackGrowth: 10,
            baseDefense: 5,
            defenseGrowth: 5,
            baseMaxHp: 100,
            maxHpGrowth: 0,
            baseMove: 4,
            moveGrowth: 0,
            maxRange: 1,
            minRange: 1,
            fieldP: 0,
            abilityIds: [0, 2],
            recruitableFlag: 1,
            flagR: 1,
            tailByte: 0
        });

        expect(parseApkUnitRecord(buffer, 0, 0)).toEqual({
            record: {
                id: 0,
                unitClass: 'soldier',
                recordOffset: 0,
                cost: 150,
                population: 1,
                attackElement: 0,
                defenseShift: 0,
                baseAttack: 55,
                fieldF: 0,
                attackGrowth: 10,
                baseDefense: 5,
                defenseGrowth: 5,
                baseMaxHp: 100,
                maxHpGrowth: 0,
                baseMove: 4,
                moveGrowth: 0,
                maxRange: 1,
                minRange: 1,
                fieldP: 0,
                abilityIds: [0, 2],
                recruitableFlag: 1,
                flagR: 1,
                tailByte: 0
            },
            nextOffset
        });
    });

    it('从解密后的 data.bin 头部定位单位小节', () => {
        const decrypted = Buffer.alloc(128);
        decrypted.writeUInt32BE(365703, 0);
        decrypted[8] = 0;
        const sectionOffset = 9;
        decrypted.writeUInt32BE(8, sectionOffset);
        decrypted.writeUInt32BE(365703, sectionOffset + 4);
        decrypted.writeUInt32BE(0, sectionOffset + 8);
        decrypted[sectionOffset + 12] = 1;
        writeUnitRecord(decrypted, sectionOffset + 14, {
            cost: 250,
            population: 1,
            attackElement: 0,
            defenseShift: 0,
            baseAttack: 45,
            fieldF: 0,
            attackGrowth: 10,
            baseDefense: 5,
            defenseGrowth: 5,
            baseMaxHp: 100,
            maxHpGrowth: 0,
            baseMove: 4,
            moveGrowth: 0,
            maxRange: 3,
            minRange: 2,
            fieldP: 0,
            abilityIds: [4],
            recruitableFlag: 1,
            flagR: 1,
            tailByte: 0
        });

        const parsed = parseApkUnitRecordsFromDecryptedDataBin(decrypted);
        expect(parsed.sectionOffset).toBe(sectionOffset);
        expect(parsed.sectionMarker).toBe(8);
        expect(parsed.sectionMagic).toBe(365703);
        expect(parsed.records).toEqual([
            expect.objectContaining({
                id: 0,
                unitClass: 'soldier',
                cost: 250,
                minRange: 2,
                maxRange: 3,
                abilityIds: [4]
            })
        ]);
    });

    it('统计单位数值分布', () => {
        expect(buildValueDistribution([
            { id: 0, unitClass: 'soldier', recordOffset: 0, cost: 150, population: 1, attackElement: 0, defenseShift: 0, baseAttack: 55, fieldF: 0, attackGrowth: 10, baseDefense: 5, defenseGrowth: 5, baseMaxHp: 100, maxHpGrowth: 0, baseMove: 4, moveGrowth: 0, maxRange: 1, minRange: 1, fieldP: 0, abilityIds: [0, 2], recruitableFlag: 1, flagR: 1, tailByte: 0 },
            { id: 1, unitClass: 'archer', recordOffset: 1, cost: 250, population: 1, attackElement: 0, defenseShift: 0, baseAttack: 45, fieldF: 0, attackGrowth: 10, baseDefense: 5, defenseGrowth: 5, baseMaxHp: 100, maxHpGrowth: 0, baseMove: 4, moveGrowth: 0, maxRange: 3, minRange: 2, fieldP: 0, abilityIds: [4], recruitableFlag: 1, flagR: 1, tailByte: 0 },
            { id: 2, unitClass: 'water_elemental', recordOffset: 2, cost: 250, population: 1, attackElement: 0, defenseShift: 0, baseAttack: 60, fieldF: 1, attackGrowth: 10, baseDefense: 15, defenseGrowth: 5, baseMaxHp: 100, maxHpGrowth: 0, baseMove: 4, moveGrowth: 0, maxRange: 1, minRange: 1, fieldP: 0, abilityIds: [12], recruitableFlag: 1, flagR: 1, tailByte: 0 }
        ], 'cost')).toEqual([
            { value: 150, count: 1, unitIds: [0] },
            { value: 250, count: 2, unitIds: [1, 2] }
        ]);
    });
});
