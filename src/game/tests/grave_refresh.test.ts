import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, buildFixedActionMask, encodeFixedActionIndex } from '../env';
import type { UnitClass } from '../types';

function graveState(ownerId = 1, remainingTurns = 0, victimClass: UnitClass = 'soldier') {
    const state = createDemoState();
    state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
    state.units = [
        ...state.units.filter(unit => unit.unitClass === 'commander'),
        { id: 'attacker', ownerId: 0, unitClass: 'dragon', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'victim', ownerId: 1, unitClass: victimClass, pos: { x: 3, y: 2 }, hp: 1, maxHp: 100, hasMoved: false, hasActed: false }
    ];
    state.graves = [{ id: 'existing', pos: { x: 3, y: 2 }, ownerId, remainingTurns }];
    return state;
}

const attack = { type: 'attack', attackerId: 'attacker', targetId: 'victim' } as const;

describe('APK 同格死亡覆盖墓碑计时', () => {
    it.each([[1, 0], [1, 1], [0, 0]])('旧计时玩家 %i、剩余 %i 的墓碑被重新计时', (owner, turns) => {
        const engine = new GameEngine(graveState(owner, turns), { disableAutoAdvanceWhenNoMeaningfulAction: true });
        engine.step(attack);
        expect(engine.getState().units.some(unit => unit.id === 'victim')).toBe(false);
        expect(engine.getState().graves).toEqual([{ id: 'existing', pos: { x: 3, y: 2 }, ownerId: 0, remainingTurns: 1 }]);
        // 按新计时玩家的回合递减，旧计时玩家的回合不能使墓碑提前消失。
        engine.step({ type: 'post_attack_move', unitId: 'attacker', to: { x: 2, y: 2 } });
        engine.step({ type: 'end_turn' });
        expect(engine.getState().graves?.[0].remainingTurns).toBe(1);
        engine.step({ type: 'end_turn' });
        expect(engine.getState().graves?.[0].remainingTurns).toBe(0);
        engine.step({ type: 'end_turn' });
        engine.step({ type: 'end_turn' });
        expect(engine.getState().graves).toEqual([]);
    });

    it('亡灵死亡不生成墓碑，也不刷新旧墓碑', () => {
        const engine = new GameEngine(graveState(1, 0, 'skeleton'), { disableAutoAdvanceWhenNoMeaningfulAction: true });
        engine.step(attack);
        expect(engine.getState().units.some(unit => unit.id === 'victim')).toBe(false);
        expect(engine.getState().graves?.[0]).toMatchObject({ ownerId: 1, remainingTurns: 0 });
    });

    it('环境动作、固定 mask 与克隆使用同一墓碑结算，不重复初始化收益', () => {
        const env = new AncientEmpiresEnv({ initialState: graveState() });
        const before = env.getState();
        const legal = new GameEngine(before).getLegalActions(0);
        expect(legal).toContainEqual(attack);
        expect(buildFixedActionMask(before, legal).actionMask[encodeFixedActionIndex(attack, before)]).toBe(true);
        env.stepAction(attack);
        const after = env.getState();
        expect(after.graves?.[0]).toMatchObject({ ownerId: 0, remainingTurns: 1 });
        expect(env.clone().getState()).toEqual(after);
    });
});
