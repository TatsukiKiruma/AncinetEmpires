import { describe, expect, it } from 'vitest';
import {
    buildSkirmishRuleTerrainTable,
    buildValueDistribution,
    parseApkTerrainConfigsFromDecryptedDataBin,
    parseApkTerrainRecord
} from './apk_terrain_report';

// 直接取自 APK 解密字节；t1 的 variants=[2] 使记录从 40 变为 44 字节。
const T0 = '000000000000ffffffff00000000000000000000000300ffffffffffffffff000000000000000001';
const T1 = '000000000000ffffffff00000000000000000000000300ffffffffffffffff00000000010000000200000001';
const T2 = '000000000000ffffffff00000000000000000000000300ffffffffffffffff000000000000000001';

describe('APK data.bin 地形复核工具', () => {
    it('逐字段解析 APK 字节及变长数组，不能固定跨度', () => {
        expect(parseApkTerrainRecord(Buffer.from(T1, 'hex'), 0, 1)).toMatchObject({
            id: 1, kind: 0, isLand: false, capturable: false, moveCost: 3, healPerTurn: 0,
            variants: [2], graphicsType: 1, linkedA: -1, linkedB: -1, linkedC: -1
        });
        const data = Buffer.from('000594870000000003' + T0 + T1 + T2 + '000594870000000015', 'hex');
        const rows = parseApkTerrainConfigsFromDecryptedDataBin(data);
        expect(rows.map(row => [row.kind, row.moveCost, row.healPerTurn])).toEqual([[0, 3, 0], [0, 3, 0], [0, 3, 0]]);
        expect(rows[1].variants).toEqual([2]);
        expect(() => parseApkTerrainConfigsFromDecryptedDataBin(data.subarray(0, -1))).toThrow('边界');
        const invalid = Buffer.from(data);
        invalid.writeInt32BE(-1, 5);
        expect(() => parseApkTerrainConfigsFromDecryptedDataBin(invalid)).toThrow('长度');
        expect(() => parseApkTerrainRecord(Buffer.from(T1, 'hex').subarray(0, 40), 0, 1)).toThrow('越界');
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
