import { describe, expect, it } from 'vitest';
import {
    buildSkirmishRuleTerrainTable,
    buildValueDistribution,
    parseApkTerrainConfigsFromDecryptedDataBin,
    parseApkTerrainRecord
} from './apk_terrain_report';

function writeTerrainRecord(
    buffer: Buffer,
    offset: number,
    values: {
        kind: number;
        flagA: number;
        variant: number;
        linkedA: number;
        defenseBonus: number;
        healPerTurn: number;
        moveCost: number;
        flagB: number;
        linkedB: number;
        linkedC: number;
        flagC: number;
        tail: number;
    }
) {
    buffer.writeInt32BE(values.kind, offset);
    buffer.writeInt16BE(values.flagA, offset + 4);
    buffer.writeInt32BE(values.variant, offset + 6);
    buffer.writeInt32BE(values.linkedA, offset + 10);
    buffer.writeInt32BE(values.defenseBonus, offset + 14);
    buffer.writeInt32BE(values.healPerTurn, offset + 18);
    buffer.writeInt32BE(values.moveCost, offset + 22);
    buffer[offset + 26] = values.flagB;
    buffer.writeInt32BE(values.linkedB, offset + 27);
    buffer.writeInt32BE(values.linkedC, offset + 31);
    buffer[offset + 35] = values.flagC;
    buffer.writeUInt32BE(values.tail, offset + 36);
}

describe('APK data.bin 地形复核工具', () => {
    it('解析单条 40 字节地形记录', () => {
        const buffer = Buffer.alloc(40);
        writeTerrainRecord(buffer, 0, {
            kind: 8,
            flagA: 1,
            variant: 4,
            linkedA: -1,
            defenseBonus: 15,
            healPerTurn: 20,
            moveCost: 1,
            flagB: 1,
            linkedB: 27,
            linkedC: -1,
            flagC: 0,
            tail: 0
        });

        expect(parseApkTerrainRecord(buffer, 0, 36)).toEqual({
            id: 36,
            kind: 8,
            flagA: 1,
            variant: 4,
            linkedA: -1,
            defenseBonus: 15,
            healPerTurn: 20,
            moveCost: 1,
            flagB: 1,
            linkedB: 27,
            linkedC: -1,
            flagC: 0,
            tail: '0x00000000'
        });
    });

    it('从解密后的 data.bin 头部解析地形表', () => {
        const decrypted = Buffer.alloc(9 + 2 * 40);
        decrypted.writeUInt32BE(365703, 0);
        decrypted[8] = 2;
        writeTerrainRecord(decrypted, 9, {
            kind: 0,
            flagA: 0,
            variant: -1,
            linkedA: 0,
            defenseBonus: 0,
            healPerTurn: 3,
            moveCost: 16777215,
            flagB: 255,
            linkedB: -1,
            linkedC: 0,
            flagC: 0,
            tail: 1
        });
        writeTerrainRecord(decrypted, 49, {
            kind: 4,
            flagA: 1,
            variant: 5,
            linkedA: -1,
            defenseBonus: 10,
            healPerTurn: 20,
            moveCost: 1,
            flagB: 0,
            linkedB: -1,
            linkedC: -1,
            flagC: 0,
            tail: 0
        });

        expect(parseApkTerrainConfigsFromDecryptedDataBin(decrypted)).toEqual([
            expect.objectContaining({ id: 0, defenseBonus: 0, healPerTurn: 3, moveCost: 16777215, tail: '0x00000001' }),
            expect.objectContaining({ id: 1, defenseBonus: 10, healPerTurn: 20, moveCost: 1, tail: '0x00000000' })
        ]);
    });

    it('统计地形数值分布', () => {
        expect(buildValueDistribution([
            { id: 0, kind: 0, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
            { id: 1, kind: 0, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
            { id: 2, kind: 0, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' }
        ], 'defenseBonus')).toEqual([
            { value: 0, count: 1, ids: [0] },
            { value: 10, count: 2, ids: [1, 2] }
        ]);
    });

    it('输出官方 skirmish 实际使用地形的训练规则表', () => {
        const table = buildSkirmishRuleTerrainTable();
        const byId = new Map(table.map(item => [item.apkTerrainId, item]));

        expect(table.length).toBeGreaterThan(0);
        expect(byId.get(30)).toEqual(expect.objectContaining({
            apkTerrainId: 30,
            tileCount: 2,
            confidence: 'approximate',
            projectTerrainId: 11
        }));
        expect(byId.get(30)?.projectRuleSemantics).toEqual(expect.objectContaining({
            projectTerrainKey: 'camp',
            defenseBonus: 10,
            healPerTurn: 20,
            moveCost: 1,
            clearsNegativeStatus: false,
            canBeCaptured: false,
            generatesIncome: false,
            canRecruit: false
        }));

        expect(byId.get(31)).toEqual(expect.objectContaining({
            apkTerrainId: 31,
            tileCount: 7,
            confidence: 'approximate',
            projectTerrainId: 12
        }));
        expect(byId.get(31)?.projectRuleSemantics).toEqual(expect.objectContaining({
            projectTerrainKey: 'temple',
            defenseBonus: 10,
            healPerTurn: 20,
            moveCost: 1,
            clearsNegativeStatus: true,
            canBeCaptured: false,
            generatesIncome: false,
            canRecruit: false
        }));

        expect(byId.get(36)?.projectRuleSemantics).toEqual(expect.objectContaining({
            projectTerrainKey: 'town',
            canBeCaptured: true,
            generatesIncome: true,
            canRecruit: false
        }));
        expect(byId.get(37)?.projectRuleSemantics).toEqual(expect.objectContaining({
            projectTerrainKey: 'castle',
            canBeCaptured: true,
            generatesIncome: true,
            canRecruit: true
        }));

        expect([...byId.keys()]).not.toEqual(expect.arrayContaining([80, 81, 82, 83]));
    });
});
