import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import type { DualObservation } from '../dual_v2/contract';
import { BatchedNeuralBeamSearchAI } from './batched_beam_search';
import type { BatchedSearchModel } from './batched_search_types';
import { searchTeacher } from './search_teacher';
import { softPriors } from './search_policy';
import { ReachabilityContext } from '../dual_v2/reachability';
import { actionActor } from '../dual_v2/tactical_prior';
import { encodeAction } from '../../game/env';
import { createDemoState } from '../../game/demo_map';
import { responseActionIndices } from './response_proposals';
import { crossedSelfTurn } from './response_horizon';
import { SearchBudgetExpiredError } from './search_budget';

function model(): BatchedSearchModel {
    return { forwardBatch: vi.fn(async (rows: DualObservation[]) => rows.map(o => ({
        logits: Float32Array.from(o.actions.sourceIndices, (_, i) => o.actions.pointers[i * 5 + 2] === 13 ? 1000 : 0),
        valueLogits: Float32Array.from(o.playerOrder.active, a => a ? 0 : -1e9),
        valueProbs: Float32Array.from(o.playerOrder.active, a => a / o.playerOrder.active.reduce((x, y) => x + y, 0))
    }))) };
}

describe('异步波次搜索合同', () => {
    it('一次前向用尽软预算后合法收口，不伪造教师标签，下一根仍可继续', async () => {
        const engine = new GameEngine(createDefaultAppGameState()), before = engine.getState(), normal = model();
        let expired = true;
        const bridge: BatchedSearchModel = { forwardBatch: async rows => { if (expired) throw new SearchBudgetExpiredError(); return normal.forwardBatch(rows); } };
        const ai = new BatchedNeuralBeamSearchAI(bridge, { modelVersion: '软截止恢复', budgetMs: 1000, maxNodes: 80, maxUnits: 1, finalists: 2 });
        const fallback = await ai.getAction(engine, before.currentPlayer);
        expect(engine.hasLegalAction(before.currentPlayer, fallback)).toBe(true); expect(engine.getState()).toEqual(before);
        expect(ai.telemetry.budgetExpirations).toBe(1); expect(ai.telemetry.teacher!.available).toBe(false);
        expect(ai.telemetry.teacher!.evaluatedMask.some(Boolean)).toBe(false);
        expired = false;
        const action = await ai.getAction(engine, before.currentPlayer);
        expect(engine.hasLegalAction(before.currentPlayer, action)).toBe(true); expect(ai.telemetry.networkCalls).toBeGreaterThan(0);
    });
    it('敌方响应预筛保留即时战术、招募及城堡相关行动者，子菜单先验一致', () => {
        const state = createDemoState(), engine = new GameEngine(state), full = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        const indices = responseActionIndices(state, full, new Float64Array(full.length), 1), included = new Set(indices);
        full.forEach((a, i) => { if (a.type !== 'move' && a.type !== 'post_attack_move') expect(included.has(i)).toBe(true); });
        const priors = softPriors(state, full, new ReachabilityContext(state)), subset = softPriors(state, indices.map(i => full[i]), new ReachabilityContext(state));
        indices.forEach((source, i) => expect(subset[i]).toBe(priors[source]));
    });
    it('单位跟进菜单与完整菜单中的该单位先验完全一致', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        for (let depth = 0; depth < 5; depth++) {
            const state = engine.getState(), full = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
            const all = softPriors(state, full, new ReachabilityContext(state));
            for (const actor of new Set(full.map(actionActor).filter(Boolean))) {
                const subset = full.filter(a => actionActor(a) === actor), own = softPriors(state, subset, new ReachabilityContext(state));
                subset.forEach((a, i) => expect(own[i]).toBe(all[full.findIndex(b => encodeAction(a) === encodeAction(b))]));
            }
            const move = full.find(a => a.type === 'move') ?? full.find(a => a.type === 'end_turn'); if (!move) break; engine.step(move);
        }
    });
    it('跨候选合批，节点上限共享，输入不变，所有见证独立合法重放', async () => {
        const engine = new GameEngine(createDefaultAppGameState()), before = engine.getState(), witnesses: any[] = [];
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '固定模型', budgetMs: 3000, maxNodes: 160, rootCandidates: 6, innerCandidates: 3, beamWidth: 3, maxUnits: 2, finalists: 3, responseVariants: 2, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, before.currentPlayer);
        expect(engine.hasLegalAction(before.currentPlayer, action)).toBe(true); expect(engine.getState()).toEqual(before);
        expect(ai.telemetry.nodes).toBe(ai.telemetry.ownNodes + ai.telemetry.responseNodes); expect(ai.telemetry.nodes).toBeLessThanOrEqual(160);
        expect(Math.max(...ai.telemetry.batchSizes)).toBeGreaterThan(1);
        expect(ai.telemetry.waveBatches.C).toBeGreaterThan(0); expect(witnesses.length).toBeGreaterThan(0);
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial, { applyInitialTurnStart: false });
            for (const a of w.actions) { expect(replay.hasLegalAction(replay.getState().currentPlayer, a)).toBe(true); replay.step(a); }
            expect(replay.getState()).toEqual(w.final);
        }
        const teacher = ai.telemetry.teacher!;
        if (teacher.evaluatedMask.some(Boolean)) expect(teacher.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }, 10000);
    it('完整前态和合法性共同控制队列，预算上限与旧同步类一致', async () => {
        const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState(), action = engine.getLegalActions(state.currentPlayer).find(a => a.type === 'wait')!;
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '队列', budgetMs: 20, maxNodes: 1 }) as any;
        ai.queue = [{ state, action }]; expect(await ai.getAction(engine, state.currentPlayer)).toEqual(action); expect(ai.telemetry.queued).toBe(true);
        ai.queue = [{ state: { ...state, turn: state.turn + 1 }, action }]; await ai.getAction(engine, state.currentPlayer); expect(ai.telemetry.queued).toBe(false);
        const invalid = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '预算', budgetMs: 4001 });
        await expect(invalid.getAction(engine, state.currentPlayer)).rejects.toThrow('4000');
    });
    it('缓存身份包含先验尺度、效用模式与反榜首系数', () => {
        const state = createDefaultAppGameState();
        const keys = [{ priorScale: 1 }, { priorScale: .35 }, { valueMode: 'zero_sum_margin' as const }, { antiLeaderBeta: .5 }].map(options => {
            const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '同模型', ...options }) as any; return ai.key(state);
        });
        expect(new Set(keys).size).toBe(4);
    });
    it.each([3, 4])('%i人反扑依次使用每个敌席自己的观测，回到己方才闭合', async n => {
        const state = createDemoState();
        state.rules = { ...state.rules, defeatOnNoUnitsAndNoCastles: false, defeatOnNoUnits: false, defeatOnCommanderDeath: false, defeatOnNoCastles: false };
        state.players = Array.from({ length: n }, (_, id) => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 }));
        for (let id = 2; id < n; id++) state.units.push({ ...state.units[0], id: `额外席${id}`, ownerId: id, pos: { x: id + 1, y: 4 } });
        const engine = new GameEngine(state, { applyInitialTurnStart: false }), initial = engine.getState();
        engine.step(engine.getLegalActions(0).find(a => a.type === 'end_turn')!);
        const perspectives: number[] = [], batchModel = model();
        const original = batchModel.forwardBatch;
        batchModel.forwardBatch = async rows => { perspectives.push(...rows.map(o => o.playerOrder.playerIds[0]!)); return original(rows); };
        const ai = new BatchedNeuralBeamSearchAI(batchModel, { modelVersion: '多人响应', maxNodes: 100, budgetMs: 3000, responseVariants: 2 }) as any;
        ai.self = 0; ai.deadline = ai.activeEnd = performance.now() + 3000;
        const groups = await ai.responseLeavesBatch([{ engine, steps: [{ state: initial, action: { type: 'end_turn' } }], ends: [1], value: 0, prior: 0, score: 0 }]);
        expect(groups[0].every((t: any) => t.complete)).toBe(true);
        expect(groups[0].every((t: any) => t.branch.engine.getState().currentPlayer === 0)).toBe(true);
        for (let id = 1; id < n; id++) expect(perspectives).toContain(id);
    });
    it('己方计划已跨回合回到自己时不再多跳过一轮己方', async () => {
        const initial = createDefaultAppGameState(), returned = structuredClone(initial); returned.turn++;
        const engine = new GameEngine(returned, { applyInitialTurnStart: false });
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '已返回己方', responseVariants: 2 }) as any;
        ai.self = returned.currentPlayer; ai.deadline = ai.activeEnd = performance.now() + 2000;
        const groups = await ai.responseLeavesBatch([{ engine, steps: [{ state: initial, action: { type: 'end_turn' } }], ends: [1], value: 0, score: 0, prior: 0 }]);
        expect(groups[0].every((t: any) => t.complete && t.branch.steps.length === 0)).toBe(true);
        expect(ai.telemetry.responseNodes).toBe(0);
    });
    it('空军但保留城堡的己方被权威引擎自动跳过时，轮回不误报cycle', async () => {
        const state = createDemoState(); state.units = state.units.filter(u => u.ownerId !== 0); state.units[0].pos = { x: 0, y: 0 };
        state.players[0].gold = 0; state.currentPlayer = 1;
        state.rules = { incomeCastle: 0, incomeVillage: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0, defeatOnNoUnitsAndNoCastles: true };
        const engine = new GameEngine(state, { applyInitialTurnStart: false }), before = engine.getState();
        const check = engine.clone(); check.step({ type: 'end_turn' });
        expect(check.getState().currentPlayer).toBe(1); expect(check.getState().players[0].isAlive).toBe(true);
        expect(crossedSelfTurn(before, check.getState(), 0)).toBe(true);
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: '己方自动跳过', responseVariants: 1 }) as any;
        ai.self = 0; ai.deadline = ai.activeEnd = performance.now() + 2000;
        const groups = await ai.responseLeavesBatch([{ engine, steps: [{ state: { ...before, currentPlayer: 0 }, action: { type: 'end_turn' } }], ends: [1], value: 0, score: 0, prior: 0 }]);
        expect(groups[0][0].complete).toBe(true); expect(groups[0][0].branch.steps).toHaveLength(1);
        expect(crossedSelfTurn({ currentPlayer: 1, turn: 1 }, { currentPlayer: 0, turn: 2 }, 1)).toBe(false);
        expect(crossedSelfTurn({ currentPlayer: 0, turn: 1 }, { currentPlayer: 2, turn: 1 }, 1)).toBe(true);
    });
    it('教师目标仅归一化已完成根动作，未完成价值留空，否决方案概率为零', () => {
        const teacher = searchTeacher(['a', 'b', 'c', 'd'], [
            { rootAction: 'a', value: .2, responseComplete: true }, { rootAction: 'b', value: .9, responseComplete: false },
            { rootAction: 'c', value: .8, responseComplete: true, vetoed: true }, { rootAction: 'd', value: -.1, responseComplete: true }
        ]);
        expect(teacher.evaluatedMask).toEqual([true, false, true, true]); expect(teacher.qValues[1]).toBe(null);
        expect(teacher.probabilities[1]).toBe(0); expect(teacher.probabilities[2]).toBe(0);
        expect(teacher.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(teacher.probabilities.every(Number.isFinite)).toBe(true);
        expect(searchTeacher(['a'], []).value).toBe(null);
    });
});
