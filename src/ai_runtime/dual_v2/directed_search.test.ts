import { describe, expect, it, vi } from 'vitest';
import { createDefaultAppGameState } from '../../game/default_state';
import { GameEngine } from '../../game/engine';
import { queueStateKey } from './queue_state';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import { actionActor } from './tactical_prior';
import type { DualStreamModel } from './model_runtime';

describe('定向搜索与队列状态身份', () => {
    it('规则地形、行动标记、pending与规则变化均使队列失效', () => {
        const original = createDefaultAppGameState(), key = queueStateKey(original);
        const mutations = [
            (s: typeof original) => { s.map.tiles[0][0].apkMoveCost = 9; },
            (s: typeof original) => { s.map.tiles[0][0].ownerId = 17; },
            (s: typeof original) => { s.units[0].hasMoved = !s.units[0].hasMoved; },
            (s: typeof original) => { s.pendingUnitId = '其它单位'; },
            (s: typeof original) => { s.rules = { ...s.rules, unitLimit: 99 }; },
        ];
        for (const mutate of mutations) { const state = structuredClone(original); mutate(state); expect(queueStateKey(state)).not.toBe(key); }
        expect(queueStateKey(structuredClone(original))).toBe(key);
    });

    it('同单位神经后续编码完整候选，再筛选行动者', () => {
        const engine = new GameEngine(createDefaultAppGameState()), self = engine.getState().currentPlayer;
        const legal = engine.getLegalActions(self).filter(a => a.type !== 'surrender'), actor = actionActor(legal.find(a => a.type === 'move')!)!;
        const forward = vi.fn((observation: any) => ({ logits: new Float32Array(observation.actions.sourceIndices.length) }));
        const ai = new DualStreamTurnSearchAI({ forward } as unknown as DualStreamModel) as any;
        const ranked = ai.ranked(engine, true, actor);
        expect(forward.mock.calls[0][0].actions.sourceIndices.length).toBe(legal.length);
        expect(ranked.length).toBeGreaterThan(0);
        expect(ranked.every((x: any) => actionActor(x.action) === actor)).toBe(true);
        expect(ai.ranked(engine, false, actor).every((x: any) => actionActor(x.action) === actor)).toBe(true);
    });

    it('其它单位可行动时，本单位wait已完结且不会代替全队end_turn', () => {
        const engine = new GameEngine(createDefaultAppGameState()), self = engine.getState().currentPlayer;
        const wait = engine.getLegalActions(self).find(a => a.type === 'wait')!;
        const ai = new DualStreamTurnSearchAI({} as DualStreamModel) as any;
        ai.deadline = performance.now() + 10000;
        const completed = ai.complete({ engine, queue: [], prior: 0, score: 0, actors: [] }, wait, self);
        expect(completed).toHaveLength(1);
        expect(completed[0].queue.map((q: any) => q.action.type)).toEqual(['wait']);
        expect(completed[0].engine.getState().currentPlayer).toBe(self);
    });
});
