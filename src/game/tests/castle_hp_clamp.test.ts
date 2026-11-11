import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, buildFixedActionMask, encodeFixedActionIndex } from '../env';
import type { UnitClass, UnitLevel } from '../types';

function castleState(hp = 190, unitClass: UnitClass = 'dragon', level: UnitLevel = 0) {
    const state = createDemoState();
    state.currentPlayer = 1;
    state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
    state.map.tiles[1][1] = { terrainId: 10, ownerId: 0 };
    state.units = [
        { id: 'occupant', ownerId: 1, unitClass, pos: { x: 1, y: 1 }, hp, maxHp: 100, level, hasMoved: false, hasActed: false },
        { id: 'healer', ownerId: 1, unitClass: 'paladin', pos: { x: 2, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'owner', ownerId: 0, unitClass: 'soldier', pos: { x: 5, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
    ];
    return state;
}

describe('APK 敌军占堡扣血的生命钳制', () => {
    it.each([[190, 100], [120, 70], [100, 50], [50, null], [20, null]])('生命 %i 扣堡伤后为 %s，死亡继续走正常清理', (hp, expected) => {
        const engine = new GameEngine(castleState(hp), { disableAutoAdvanceWhenNoMeaningfulAction: true });
        engine.step({ type: 'end_turn' });
        expect(engine.getState().units.find(unit => unit.id === 'occupant')?.hp ?? null).toBe(expected);
    });

    it('等级成长单位使用有效上限，不误夹取到基础生命 100', () => {
        const engine = new GameEngine(castleState(290, 'golem', 4), { disableAutoAdvanceWhenNoMeaningfulAction: true });
        engine.step({ type: 'end_turn' });
        expect(engine.getState().units.find(unit => unit.id === 'occupant')?.hp).toBe(200);
    });

    it('恢复后可治疗的动作和固定 mask 一致，clone 不重复扣血或发放收益', () => {
        const env = new AncientEmpiresEnv({ initialState: castleState() });
        env.stepAction({ type: 'end_turn' });
        const state = env.getState();
        expect(state.units.find(unit => unit.id === 'occupant')?.hp).toBe(100);
        expect(env.clone().getState()).toEqual(state);
        // 在快照中切到治疗方，避免其回合开始自行消除超额生命掩盖错误。
        state.currentPlayer = 1;
        state.units.find(unit => unit.id === 'healer')!.hasActed = false;
        state.units.find(unit => unit.id === 'healer')!.hasMoved = false;
        const engine = new GameEngine(state, { disableAutoAdvanceWhenNoMeaningfulAction: true });
        const actions = engine.getLegalActions(1);
        const heal = actions.find(action => action.type === 'heal' && action.healerId === 'healer' && action.targetId === 'occupant');
        expect(heal).toBeDefined();
        const mask = buildFixedActionMask(state, actions);
        expect(mask.actionMask[encodeFixedActionIndex(heal!, state)]).toBe(true);
    });
});
