import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import type { DualStreamModel } from './model_runtime';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import * as queueState from './queue_state';
import { warmedPolicy } from './warmup';

const model = () => ({ forward: vi.fn((o: any) => ({ logits: new Float32Array(o.actions.sourceIndices.length), valueProbs: Float32Array.of(.5, .5, 0, 0, 0, 0), valueLogits: Float32Array.of(0, 0, -1e9, -1e9, -1e9, -1e9) })) }) as unknown as DualStreamModel;

describe('完整神经基准与预热隔离', () => {
    it('活跃三单位基准只比较同深度或已结束回合的挑战案', () => {
        const engine = new GameEngine(createDefaultAppGameState()), player = engine.getState().currentPlayer;
        const ai = new DualStreamTurnSearchAI(model()) as any;
        const original = ai.retaliation.bind(ai);
        const branches: { units: number; ended: boolean }[] = [];
        ai.retaliation = (branch: any, self: number) => {
            const state = branch.engine.getState();
            branches.push({ units: branch.actors.length, ended: branch.engine.isTerminal() || state.currentPlayer !== player || state.turn !== engine.getState().turn });
            return original(branch, self);
        };
        ai.getAction(engine, player);
        expect(ai.telemetry.primaryUnits).toBe(3);
        expect(branches.length).toBe(4);
        expect(branches.every(b => b.units === 3 || b.ended)).toBe(true);
        expect(ai.memory.queue.length).toBeGreaterThan(0);
    });

    it('搜索节点仅保留独立前态，不构造队列身份字符串', () => {
        const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState();
        const ai = new DualStreamTurnSearchAI(model()) as any;
        ai.deadline = performance.now() + 1000;
        const spy = vi.spyOn(queueState, 'queueStateKey');
        const action = engine.getLegalActions(state.currentPlayer).find(a => a.type === 'move')!;
        const child = ai.apply({ engine, queue: [], actors: [], prior: 0, score: 0 }, action);
        expect(spy).not.toHaveBeenCalled();
        expect(child.queue[0].state).toEqual(state);
        expect(child.queue[0].state.units).not.toBe(state.units);
        spy.mockRestore();
    });

    it('完整队列快返不再复制快照或重新构造身份字符串', () => {
        const engine = new GameEngine(createDefaultAppGameState()), self = engine.getState().currentPlayer;
        const ai = new DualStreamTurnSearchAI(model());
        const key = vi.spyOn(queueState, 'queueStateKey');
        engine.step(ai.getAction(engine, self));
        expect(ai.memory.queue.length).toBeGreaterThan(0);
        expect(key).not.toHaveBeenCalled();
        const queued = ai.memory.queue[0];
        const getter = vi.spyOn(engine, 'getState').mockImplementation(() => { throw Error('队列快返禁止复制'); });
        ai.getAction(engine, self);
        expect(ai.telemetry.queued).toBe(true); expect(key).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
        // 兼容诊断读取，但只在首次读取时构造一次字符串。
        expect(queued.expectedStateHash).toBe(queued.expectedStateHash);
        expect(key).toHaveBeenCalledTimes(1);
        getter.mockRestore(); key.mockRestore();
    });

    it('预热实例的状态与随机调用不能进入正式实例或正式引擎', () => {
        const engine = new GameEngine(createDefaultAppGameState()), before = engine.getState();
        let warmCalls = 0, formalCalls = 0;
        const policy = warmedPolicy(engine, warm => ({
            queue: [] as string[],
            getAction(clone: GameEngine, player: number) {
                if (warm) warmCalls++; else formalCalls++;
                this.queue.push('已运行');
                const legal = clone.getLegalActions(player).filter(a => a.type !== 'surrender');
                const action = legal.find(a => a.type === 'wait') ?? legal[0];
                return action;
            },
        }));
        expect(warmCalls).toBe(3); expect(formalCalls).toBe(0);
        expect(policy.queue).toEqual([]); expect(engine.getState()).toEqual(before);
    });
});
