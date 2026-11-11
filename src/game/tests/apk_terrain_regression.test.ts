import { describe, expect, it } from 'vitest';
import { addExp, getAttackBonus, getMoveCostForUnit } from '../abilities';
import { createDemoState } from '../demo_map';
import { APK_TERRAIN_CONFIGS, mapSkirmishApkTerrainId } from '../apk_terrain';
import { destroyTileForRules, getTileHealPerTurn } from '../terrain_rules';
import type { Tile } from '../terrain';

describe('APK 地形与经验审计回归', () => {
    it('全部归档的裸地图入口与显式导入元数据入口语义一致', () => {
        const state = createDemoState();
        for (const config of APK_TERRAIN_CONFIGS) {
            const tile: Tile = { terrainId: mapSkirmishApkTerrainId(config.id)!, apkTerrainId: config.id, ownerId: null };
            const explicit = { ...tile, apkTerrainKind: config.kind, apkTerrainIsLand: config.isLand, apkMoveCost: config.moveCost };
            for (const unitClass of ['soldier', 'berserker', 'golem', 'wolf_archer', 'mermaid', 'ghost'] as const) {
                const unit = { ...state.units[0], unitClass, pos: { x: 0, y: 0 } };
                expect(getMoveCostForUnit(state, unit, tile)).toBe(getMoveCostForUnit(state, unit, explicit));
                state.map.tiles[0][0] = tile;
                const bonus = getAttackBonus(state, unit, state.units[1]);
                state.map.tiles[0][0] = explicit;
                expect(getAttackBonus(state, unit, state.units[1])).toBe(bonus);
            }
        }
    });
    it('水面移动、森林与山地加成只按权威类别生效', () => {
        const state = createDemoState();
        const tile: Tile = { terrainId: 2, apkTerrainId: 2, ownerId: null };
        const golem = { ...state.units[0], unitClass: 'golem' as const, pos: { x: 0, y: 0 } };
        state.map.tiles[0][0] = tile;
        expect(getMoveCostForUnit(state, golem, tile)).toBe(3);
        expect(getAttackBonus(state, golem, state.units[1])).toBe(0);
        expect(getMoveCostForUnit(state, { ...golem, unitClass: 'berserker' }, tile)).toBe(4);
        expect(getMoveCostForUnit(state, { ...golem, unitClass: 'berserker' }, { terrainId: 2, ownerId: null })).toBe(4);
        expect(getTileHealPerTurn({ ...tile, apkTerrainId: 0 })).toBe(0);
        expect(getMoveCostForUnit(state, golem, { ...tile, apkTerrainId: 0 })).toBe(3);
    });
    it('脚本覆盖只取正数类别值，不按贴图或项目地形编号兜底', () => {
        const state = createDemoState();
        const tile: Tile = { terrainId: 2, apkTerrainId: 2, ownerId: null };
        expect(getMoveCostForUnit(state, { ...state.units[0], apkMoveOverrides: { 0: 0, 2: 1 } }, tile)).toBe(3);
        expect(getMoveCostForUnit(state, { ...state.units[0], apkMoveOverrides: { 0: -1 } }, tile)).toBe(3);
        expect(getMoveCostForUnit(state, { ...state.units[0], apkMoveOverrides: { 0: 2 } }, tile)).toBe(2);
    });
    it('地形转换同步携带语义，满级单位不再增长正经验', () => {
        const tile: Tile = { terrainId: 9, apkTerrainId: 36, ownerId: 1, apkTerrainKind: 4, apkTerrainIsLand: true, apkMoveCost: 1 };
        destroyTileForRules(tile);
        expect(tile).toMatchObject({ apkTerrainId: 27, apkTerrainKind: 4, ownerId: null });
        const unit = { ...createDemoState().units[0], level: 3 as const, exp: 610 };
        expect(addExp(unit, 60)).toBe(false);
        expect(unit.exp).toBe(610);
        addExp(unit, -10);
        expect(unit.exp).toBe(600);
    });
});
