import { describe, expect, it } from 'vitest';
import { createAppApkSkirmishGameState } from '../../game/apk_skirmish_map_assets';
import { createCustomSkirmishState } from '../../game/custom_skirmish/catalog';
import { frostBridges } from '../../game/custom_skirmish/frost-bridges';
import { tideHarbors } from '../../game/custom_skirmish/tide-harbors';
import { GameEngine } from '../../game/engine';
import patterns from './border-patterns.json';
import { aerBorderFrame, createAerTileGrid } from './tiles';

describe('原版地图图层', () => {
    it('Duel 保留原生建筑编号和归属，岸边匹配到原版岸线', () => {
        const state = createAppApkSkirmishGameState();
        const grid = createAerTileGrid(state.map);
        expect(grid[4][4]).toEqual({ base: 1, object: 8, team: 0 });
        expect(grid[4][6]).toEqual({ base: 1, object: 6, team: null });
        expect(grid[8][4]).toEqual({ base: 1, object: 7, team: 1 });
        expect(grid.flatMap((row, y) => row.map((_, x) => aerBorderFrame(grid, x, y, patterns)))
            .some(frame => frame > 0)).toBe(true);
    });

    it('三港回潮按桥的原始朝向选图，不能把纵桥画成横桥', () => {
        const grid = createAerTileGrid(createCustomSkirmishState(tideHarbors).map, true);
        expect(grid[7][9]).toEqual({ base: 0, object: 35, team: null });
        expect(grid[9][7]).toEqual({ base: 0, object: 34, team: null });
    });

    it('占领后的城镇按引擎的新归属重选配色', () => {
        const engine = new GameEngine(createCustomSkirmishState(frostBridges));
        const id = 'custom_commander_0';
        expect(createAerTileGrid(engine.getState().map, true)[3][5].team).toBeNull();
        engine.step({ type: 'move', unitId: id, to: { x: 5, y: 3 } });
        const { state } = engine.step({ type: 'capture', unitId: id });
        expect(createAerTileGrid(state.map, true)[3][5]).toEqual({ base: 1, object: 7, team: 0 });
    });
});
