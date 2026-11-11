import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, decodeAction, encodeAction, encodeFixedActionIndex, type EnvStepResult } from '../env';
import { getLegalActions } from '../rules';
import { UNIT_CONFIGS } from '../units';
import type { Action, UnitClass } from '../types';

function fixture(unitClass: UnitClass = 'wolf', terrainId: 6 | 8 | 9 = 6) {
    const state = createDemoState();
    state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
    state.map.tiles[2][2] = { terrainId, ownerId: null };
    state.units[2] = { ...state.units[2], unitClass, pos: { x: 1, y: 2 } };
    state.units[3].pos = { x: 3, y: 2 };
    return state;
}

function verifyInterfaces(env: AncientEmpiresEnv, result: EnvStepResult) {
    const state = env.getState();
    const engine = new GameEngine(state);
    const legal = getLegalActions(state, state.currentPlayer);
    expect(result.state).toEqual(state);
    expect(engine.getLegalActions(state.currentPlayer)).toEqual(legal);
    expect(env.getLegalActions()).toEqual(legal);
    expect(result.legalActionCodes).toEqual(legal.map(encodeAction));
    expect(result.legalActionCodes.map(decodeAction)).toEqual(legal);
    expect(result.actionMask).toEqual(legal.map(() => true));
    expect(env.getActionMask()).toEqual(result.actionMask);
    const indexes = legal.map(a => encodeFixedActionIndex(a, state)!).sort((a, b) => a - b);
    expect(new Set(indexes).size).toBe(legal.length);
    expect(result.fixedLegalActionIndexes).toEqual(indexes);
    expect(env.getFixedLegalActionIndexes()).toEqual(indexes);
    const mask = env.getFixedActionMask().actionMask;
    expect(mask.flatMap((enabled, index) => enabled ? [index] : [])).toEqual(indexes);
    expect(engine.clone().getState()).toEqual(state);
    expect(engine.clone().getLegalActions(state.currentPlayer)).toEqual(legal);
    const clone = env.clone();
    expect(clone.getState()).toEqual(state);
    expect(clone.getLegalActions()).toEqual(legal);
    expect(clone.getActionMask()).toEqual(result.actionMask);
    expect(clone.getFixedActionMask()).toEqual(env.getFixedActionMask());
    expect(clone.getFixedLegalActionIndexes()).toEqual(indexes);
    const next = legal.find(a => a.type === 'wait' || a.type === 'post_attack_move')!;
    expect(clone.stepAction(next)).toEqual(env.clone().stepFixedAction(encodeFixedActionIndex(next, state)!));
    expect(env.getState()).toEqual(state);
}

describe('突击单位只在主动攻击后保留二次移动', () => {
    for (const unitClass of ['wolf', 'dragon', 'wolf_archer'] as const) {
        it(`${unitClass} 移动后攻击保留剩余移动，二次移动仅一次，接口一致`, () => {
            const env = new AncientEmpiresEnv({ initialState: fixture(unitClass) });
            const gold = env.getState().players.map(p => p.gold);
            expect(env.reset().reward).toBe(0);
            expect(env.clone().getState().players.map(p => p.gold)).toEqual(gold);
            verifyInterfaces(env, env.stepAction({ type: 'move', unitId: 'u3', to: { x: 2, y: 2 } }));
            const attacked = env.stepAction({ type: 'attack', attackerId: 'u3', targetId: 'u4' });
            verifyInterfaces(env, attacked);
            const unit = env.getState().units.find(u => u.id === 'u3')!;
            expect(unit.movementRemaining).toBeGreaterThan(0);
            expect(unit.hasPostAttackMoved).toBeFalsy();
            const postMove: Action = { type: 'post_attack_move', unitId: 'u3', to: { x: 2, y: 2 } };
            expect(attacked.legalActions).toContainEqual(postMove);
            const ended = env.stepFixedAction(encodeFixedActionIndex(postMove, env.getState())!);
            expect(ended.legalActions.some(a => a.type === 'post_attack_move' && a.unitId === 'u3')).toBe(false);
            verifyInterfaces(env, ended);
        });

        it(`${unitClass} 移动后待机关闭二次移动且所有接口拒绝，快照不重复入账`, () => {
            const env = new AncientEmpiresEnv({ initialState: fixture(unitClass) });
            env.stepAction({ type: 'move', unitId: 'u3', to: { x: 2, y: 2 } });
            const waited = env.stepAction({ type: 'wait', unitId: 'u3' });
            verifyInterfaces(env, waited);
            expect(waited.state.units.find(u => u.id === 'u3')!.hasPostAttackMoved).toBe(true);
            expect(waited.legalActions.some(a => a.type === 'post_attack_move' && a.unitId === 'u3')).toBe(false);
            const forbidden: Action = { type: 'post_attack_move', unitId: 'u3', to: { x: 2, y: 2 } };
            const index = encodeFixedActionIndex(forbidden, waited.state)!;
            expect(env.getFixedActionMask().actionMask[index]).toBe(false);
            expect(env.clone().stepFixedAction(index).reward).toBe(-0.01);
            const engine = new GameEngine(waited.state);
            expect(engine.step(forbidden).info).toContain('非法动作');
            expect(engine.getState()).toEqual(waited.state);
            expect(env.clone().stepAction(forbidden).reward).toBe(-0.01);
            expect(env.getState().players.map(p => p.gold)).toEqual(waited.state.players.map(p => p.gold));
        });
    }

    it('主动攻击前已耗尽移动力时也直接收尾，不生成二次移动', () => {
        const state = fixture();
        state.units[2].movementRemaining = 1;
        const env = new AncientEmpiresEnv({ initialState: state });
        env.stepAction({ type: 'move', unitId: 'u3', to: { x: 2, y: 2 } });
        const result = env.stepAction({ type: 'attack', attackerId: 'u3', targetId: 'u4' });
        expect(result.state.units.find(u => u.id === 'u3')!.movementRemaining).toBe(0);
        expect(result.legalActions.some(a => a.type === 'post_attack_move')).toBe(false);
        verifyInterfaces(env, result);
    });

    for (const actionType of ['capture', 'repair'] as const) {
        it(`移动后${actionType}按非攻击收尾关闭突击资格，接口和克隆一致`, () => {
            // 原生三种突击兵种没有占领/修理能力；仅在夹具内组合能力以验证通用收尾合同。
            const original = UNIT_CONFIGS.wolf.abilities;
            UNIT_CONFIGS.wolf.abilities = [...original, 'village_capturer', 'repairer'];
            try {
                const env = new AncientEmpiresEnv({ initialState: fixture('wolf', actionType === 'capture' ? 9 : 8) });
                env.stepAction({ type: 'move', unitId: 'u3', to: { x: 2, y: 2 } });
                const result = env.stepAction({ type: actionType, unitId: 'u3' });
                expect(result.info).not.toContain('非法动作');
                expect(result.state.units.find(u => u.id === 'u3')!.movementRemaining).toBeGreaterThan(0);
                expect(result.state.units.find(u => u.id === 'u3')!.hasPostAttackMoved).toBe(true);
                expect(result.legalActions.some(a => a.type === 'post_attack_move')).toBe(false);
                verifyInterfaces(env, result);
            } finally {
                UNIT_CONFIGS.wolf.abilities = original;
            }
        });
    }
});
