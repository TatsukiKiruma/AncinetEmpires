import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import { actionActor } from './tactical_prior';
import type { DualStreamModel } from './model_runtime';
import { calibrateValue } from './value_calibration';

describe('第2代默认单位链', () => {
    it('默认链的后续动作调用神经排序且只走首选，其它链保持启发式', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const self = engine.getState().currentPlayer;
        const move = engine.getLegalActions(self).find(a => a.type === 'move')!;
        expect(move).toBeDefined();
        const ai = new DualStreamTurnSearchAI({} as DualStreamModel) as any;
        ai.deadline = performance.now() + 10000;
        const ranked = vi.spyOn(ai, 'ranked').mockImplementation((view: GameEngine, neural: boolean, actor: string) => {
            const legal = view.getLegalActions(self).filter(a => actionActor(a) === actor);
            return (neural ? [...legal].reverse() : legal).map(action => ({ action, score: 0, forbidden: false }));
        });
        const branch = { engine, queue: [], prior: 0, score: 0, actors: [] };
        const neural = ai.complete(branch, move, self, true);
        expect(neural).toHaveLength(1);
        expect(ranked.mock.calls.length).toBeGreaterThan(0);
        expect(ranked.mock.calls.every(c => c[1] === true && c[2] === actionActor(move))).toBe(true);
        const after = engine.clone(); after.step(move);
        const expected = after.getLegalActions(self).filter(a => actionActor(a) === actionActor(move)).at(-1)!;
        expect(encodeAction(neural[0].queue[1].action)).toBe(encodeAction(expected));
        ranked.mockClear(); ai.complete(branch, move, self);
        expect(ranked.mock.calls.every(c => c[1] === false)).toBe(true);
    });

    it('根首选显式传入神经后续开关', () => {
        const engine = new GameEngine(createDefaultAppGameState()), self = engine.getState().currentPlayer;
        const legal = engine.getLegalActions(self).filter(a => a.type !== 'surrender').slice(0, 2);
        const ai = new DualStreamTurnSearchAI({ forward: () => { throw Error('预算不足不得调用叶前向'); } } as unknown as DualStreamModel, { budgetMs: 10 }) as any;
        vi.spyOn(ai, 'candidateRoots').mockReturnValue(legal.map(action => ({ action, score: 0, forbidden: false })));
        const complete = vi.spyOn(ai, 'complete').mockReturnValue([]);
        ai.getAction(engine, self);
        expect(complete.mock.calls[0][3]).toBe(true);
        expect(complete.mock.calls[1][3]).toBe(false);
    });

    it('全局预算尚有余量但候选期限已到时，跳过叶网络', () => {
        const engine = new GameEngine(createDefaultAppGameState()), self = engine.getState().currentPlayer;
        const action = engine.getLegalActions(self).find(a => a.type === 'move')!;
        const forward = vi.fn(() => { throw Error('候选期限已到，禁止叶前向'); });
        const ai = new DualStreamTurnSearchAI({ forward } as unknown as DualStreamModel, { budgetMs: 100, maxUnits: 1 }) as any;
        vi.spyOn(ai, 'candidateRoots').mockReturnValue([{ action, score: 0, forbidden: false }]);
        vi.spyOn(ai, 'complete').mockReturnValue([{ engine, queue: [{ action, expectedStateHash: '' }], prior: 0, score: 0, actors: [] }]);
        vi.spyOn(ai, 'retaliation').mockReturnValue({ penalty: 0, commanders: new Map(), complete: false, staticComplete: false, lethalActors: 0, expandedChains: 0, staticCoveredUnits: 0 });
        expect(ai.getAction(engine, self)).toEqual(action);
        expect(forward).not.toHaveBeenCalled();
    });

    it('军力保底混合保持活跃槽归一和非活跃槽严格零', () => {
        const active = [1, 1, 0, 0, 0, 0];
        const p = calibrateValue([0, 0, 9, 9, 9, 9], active, { bucket: 0, army: [3, 1, 100, 0, 0, 0], income: [0, 0, 0, 0, 0, 0] }, { buckets: [{ temperature: 1, army: 0, income: 0, armyShareMix: .2 }] });
        expect(p[0]).toBeCloseTo(.55); expect(p[1]).toBeCloseTo(.45);
        expect([...p].slice(2)).toEqual([0, 0, 0, 0]);
    });
});
