import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { DualStreamPureAI } from './pure_ai';
import type { DualStreamModel } from './model_runtime';

describe('双流零搜索策略', () => {
    it('唯一非投降动作直接返回，不执行网络', () => {
        const forward = vi.fn(() => { throw Error('唯一动作不应前向'); });
        const engine = { getState: () => ({ currentPlayer: 2 }), isTerminal: () => false,
            getLegalActions: () => [{ type: 'surrender' }, { type: 'end_turn' }] } as unknown as GameEngine;
        const ai = new DualStreamPureAI({ forward } as unknown as DualStreamModel);
        expect(ai.getAction(engine, 2)).toEqual({ type: 'end_turn' });
        expect(forward).not.toHaveBeenCalled();
    });

    it('按argmax解码合法动作，推理不推进或克隆引擎', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const before = engine.getState();
        const legal = engine.getLegalActions(before.currentPlayer).filter(a => a.type !== 'surrender');
        const forward = vi.fn((observation: { actions: { sourceIndices: Int32Array } }) => ({
            logits: Float32Array.from(observation.actions.sourceIndices, (_, i) => i),
        }));
        vi.spyOn(engine, 'step').mockImplementation(() => { throw Error('纯策略不能推进局面'); });
        vi.spyOn(engine, 'clone').mockImplementation(() => { throw Error('纯策略不能克隆搜索'); });
        const action = new DualStreamPureAI({ forward } as unknown as DualStreamModel).getAction(engine, before.currentPlayer);
        expect(encodeAction(action)).toBe(encodeAction(legal[legal.length - 1]));
        expect(engine.getState()).toEqual(before);
        expect(() => new DualStreamPureAI({ forward } as unknown as DualStreamModel).getAction(engine, 99)).toThrow('当前行动玩家');
    });
});
