import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { NeuralBeamSearchAI } from './beam_search';
import type { SearchModel } from './search_policy';

function fixture(complete: boolean, value: number) {
    const engine = new GameEngine(createDefaultAppGameState());
    const state = engine.getState();
    const actions = engine.getLegalActions(state.currentPlayer).filter(a => a.type === 'move').slice(0, 2);
    const ai = new NeuralBeamSearchAI({} as SearchModel, { modelVersion: '契约回归', budgetMs: 4000,
        maxUnits: 1, finalists: 2, responseVariants: 1, disableActionQueue: true }) as any;
    ai.evaluate = () => ({ value: 0, ranked: actions.map((action, i) => ({ action, code: encodeAction(action), score: -i, prior: 0 })) });
    ai.complete = (branch: any, first: any) => [{ ...branch, steps: [{ state, action: first.action }], ends: [1], score: first.action === actions[0] ? -10 : 10, value: 0 }];
    ai.responseLeaf = (branch: any) => ({ complete: branch.steps[0].action === actions[1] && complete,
        value: branch.steps[0].action === actions[1] ? value : -1, final: state, actions: 1 });
    return { ai, engine, actions, state };
}

describe('CPU 搜索 V5 主干与逐步推理合同', () => {
    it('残缺高价值分支不能推翻主干，决赛圈先保送根第一名', () => {
        const { ai, engine, actions, state } = fixture(false, 1);
        expect(ai.getAction(engine, state.currentPlayer)).toEqual(actions[0]);
        expect(ai.telemetry.candidates[0].rootAction).toBe(encodeAction(actions[0]));
        expect(ai.telemetry.stopReason).toBe('policy_top1_fallback');
        expect(ai.queue).toEqual([]);
    });
    it('完整安全且严格超过带先验基线的分支才可替代主干', () => {
        const { ai, engine, actions, state } = fixture(true, .8);
        expect(ai.getAction(engine, state.currentPlayer)).toEqual(actions[1]);
        expect(ai.telemetry.candidates[1].score).toBeLessThan(.8);
    });
    it('完整但不足以抵消根先验差的分支不能替代主干', () => {
        const { ai, engine, actions, state } = fixture(true, .01);
        expect(ai.getAction(engine, state.currentPlayer)).toEqual(actions[0]);
        expect(ai.telemetry.stopReason).toBe('policy_top1_fallback');
    });
    it('禁止队列时即使缓存动作合法且前态一致也重新执行根推理', () => {
        const { ai, engine, actions, state } = fixture(true, .8);
        const evaluate = vi.spyOn(ai, 'evaluate');
        ai.queue = [{ state, action: actions[0] }];
        expect(ai.getAction(engine, state.currentPlayer)).toEqual(actions[1]);
        expect(evaluate).toHaveBeenCalledWith(engine, true, true);
        expect(ai.telemetry.queued).toBe(false);
        expect(ai.queue).toEqual([]);
    });
});

// 来源：第一次修复后 2p-1-base 回放第3轮，双方各5单位；保留原状态，不人工删兵缩短推演。
import midgame from './fixtures/k1-midgame-turn3.json';
import type { GameState } from '../../game/types';
import { createDualV3Stage7K1SearchAI } from '../../game/ai/dual_v3_champion_adapter';

describe('真实 K1 中盘 CPU 闭环', () => {
    it('750ms 中盘必须完成反扑并真实估值，而非根策略回退', () => {
        const engine = new GameEngine(structuredClone(midgame) as GameState, { applyInitialTurnStart: false });
        const witnesses: { initial: GameState; actions: any[]; final: GameState; complete: boolean }[] = [];
        const ai = createDualV3Stage7K1SearchAI({ budgetMs: 750, onWitness: w => witnesses.push(w) });
        const action = ai.getAction(engine, engine.getState().currentPlayer);
        expect(engine.hasLegalAction(engine.getState().currentPlayer, action)).toBe(true);
        expect(ai.telemetry.responseNodes).toBeGreaterThan(0);
        expect(ai.telemetry.responseComplete).toBeGreaterThan(0);
        expect(ai.telemetry.stopReason).not.toBe('policy_top1_fallback');
        expect(ai.telemetry.networkCalls).toBeGreaterThanOrEqual(2);
        expect(ai.telemetry.ownNodes).toBeLessThanOrEqual(160);
        for (const w of witnesses.filter(w => w.complete)) {
            const replay = new GameEngine(w.initial, { applyInitialTurnStart: false });
            for (const action of w.actions) {
                expect(replay.hasLegalAction(replay.getState().currentPlayer, action)).toBe(true);
                replay.step(action);
            }
            expect(replay.getState()).toEqual(w.final);
            expect(w.final.winner !== null || w.final.currentPlayer === midgame.currentPlayer && w.final.turn > midgame.turn).toBe(true);
        }
    }, 10000);
    it('己方动作链也不能侵占反扑节点或时间配额', () => {
        const {ai} = fixture(false, 0);
        ai.options.maxNodes = 100; ai.options.ownFraction = .4;
        ai.deadline = performance.now() + 10000; ai.searchEnd = ai.activeEnd = ai.deadline;
        ai.telemetry.nodes = 40;
        expect(ai.canExpand(true)).toBe(false);
        ai.response = true;
        expect(ai.canExpand()).toBe(true);
        ai.response = false; ai.telemetry.nodes = 0; ai.searchEnd = performance.now() - 1;
        expect(ai.canExpand(true)).toBe(false);
    });
    it('允许队列也不能缓存启发式步骤或其后缀', () => {
        const {ai,engine,actions,state} = fixture(true,.8);
        ai.options.disableActionQueue = false;
        ai.complete = (branch: any, first: any) => [{...branch, steps:[{state,action:first.action},
            {state,action:actions[0],heuristic:true},{state,action:actions[1],heuristic:false}],ends:[3],score:0,value:0}];
        ai.getAction(engine,state.currentPlayer);
        expect(ai.queue).toEqual([]);
    });
});
