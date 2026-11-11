import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, encodeAction, buildFixedActionMask } from '../env';
import { getLegalActions } from '../rules';
import type { Action } from '../types';

function actor(action: Action): string | undefined {
    if ('unitId' in action) return action.unitId;
    if ('attackerId' in action) return action.attackerId;
    if ('healerId' in action) return action.healerId;
    if ('summonerId' in action) return action.summonerId;
    if ('supporterId' in action) return action.supporterId;
}

describe('定向合法动作查询', () => {
    it('与完整候选按类型及行动单位过滤一致，顺序和状态不变', () => {
        const engine = new GameEngine(createDemoState(), { disableAutoAdvanceWhenNoMeaningfulAction: true });
        for (let step = 0; step < 40 && !engine.isTerminal(); step++) {
            const state = engine.getState(), full = engine.getLegalActions(state.currentPlayer);
            const before = JSON.stringify(state);
            expect(engine.getLegalActions(state.currentPlayer, { onlyAttacks: true })).toEqual(full.filter(a => a.type === 'attack'));
            expect(engine.getLegalActions(state.currentPlayer, { skipMovement: true })).toEqual(full.filter(a => a.type !== 'move' && a.type !== 'post_attack_move'));
            expect(engine.getLegalActions(state.currentPlayer, { skipRecruitment: true })).toEqual(full.filter(a => a.type !== 'recruit_to_castle' && a.type !== 'recruit_and_deploy'));
            for (const unit of state.units.filter(u => u.ownerId === state.currentPlayer)) {
                const expected = full.filter(a => actor(a) === undefined || actor(a) === unit.id);
                expect(engine.getLegalActions(state.currentPlayer, { unitId: unit.id, onlyAttacks: true })).toEqual(expected.filter(a => a.type === 'attack'));
                expect(getLegalActions(state, state.currentPlayer, { unitId: unit.id })).toEqual(expected);
                expect(getLegalActions(state, state.currentPlayer, { unitId: unit.id, skipMovement: true })).toEqual(expected.filter(a => a.type !== 'move' && a.type !== 'post_attack_move'));
                expect(getLegalActions(state, state.currentPlayer, { unitId: unit.id, skipMovement: true, skipRecruitment: true })).toEqual(expected.filter(a => a.type !== 'move' && a.type !== 'post_attack_move' && a.type !== 'recruit_to_castle' && a.type !== 'recruit_and_deploy'));
            }
            expect(JSON.stringify(engine.getState())).toBe(before);
            const action = full[(step * 17) % full.length];
            const clone = engine.clone(), projected = new GameEngine(state, { unsafeBypassValidationForTests: true, disableAutoAdvanceWhenNoMeaningfulAction: true });
            expect(clone.step(action)).toEqual(projected.step(action));
            expect(engine.getState()).toEqual(state);
            const env = new AncientEmpiresEnv({ initialState: state });
            expect(env.clone().getState()).toEqual(env.getState());
            expect(buildFixedActionMask(state, full)).toEqual(buildFixedActionMask(state, getLegalActions(state, state.currentPlayer)));
            expect(new Set(full.map(encodeAction)).size).toBe(full.length);
            engine.step(action);
        }
    });

    it('定向校验仍拒绝敌方移动和不存在的单位，且不改变状态', () => {
        const engine = new GameEngine(createDemoState());
        const before = engine.getState();
        for (const id of ['不存在', before.units.find(u => u.ownerId !== before.currentPlayer)!.id]) {
            expect(engine.step({ type: 'move', unitId: id, to: { x: 0, y: 0 } }).info).toContain('非法动作');
            expect(engine.getState()).toEqual(before);
        }
    });
});
