import type { DualObservation } from '../dual_v2/contract';
import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDemoState } from '../../game/demo_map';
import { actionActor } from '../dual_v2/tactical_prior';
import { ReachabilityContext } from '../dual_v2/reachability';
import { BatchedNeuralBeamSearchAI } from './batched_beam_search';
import type { BatchedSearchModel } from './batched_search_types';
import { filterRolloutActions } from './anchored_policy';
import { tacticalPriorBundle, type RankedAction } from './search_policy';

const model = (): BatchedSearchModel => ({ forwardBatch: vi.fn(async (rows: DualObservation[]) => rows.map(o => ({
    logits: new Float32Array(o.actions.sourceIndices.length), valueLogits: new Float32Array(6),
    valueProbs: Float32Array.from(o.playerOrder.active, a => a / o.playerOrder.active.reduce((x, y) => x + y, 0))
}))) });

describe('V7原子链完整性', () => {
    it('同单位占领和修复严格排除待机，全部禁手时回退', () => {
        const rows: RankedAction[] = [
            { action: { type: 'capture', unitId: 'a' }, code: 'c', score: 0, prior: 0 },
            { action: { type: 'wait', unitId: 'a' }, code: 'w', score: 10, prior: 0 },
            { action: { type: 'wait', unitId: 'b' }, code: 'b', score: 0, prior: 0 },
            { action: { type: 'end_turn' }, code: 'e', score: 20, prior: 0, forbidden: true }
        ];
        expect(filterRolloutActions(rows).map(r => r.code)).toEqual(['c', 'b']);
        expect(filterRolloutActions([{ ...rows[0], action: { type: 'repair', unitId: 'a' } }, rows[1]])).toHaveLength(1);
        expect(filterRolloutActions([rows[3]])).toEqual([rows[3]]);
    });
    it('移动到空村后的占领待机二选一无需模型', async () => {
        const state = createDemoState();
        state.players[0].gold = 0;
        state.units.find(u => u.id === 'u1')!.hasActed = true;
        const soldier = state.units.find(u => u.id === 'u3')!;
        soldier.pos = { x: 2, y: 1 };
        state.pendingUnitId = soldier.id;
        const engine = new GameEngine(state, { applyInitialTurnStart: false });
        engine.step({ type: 'move', unitId: 'u3', to: { x: 3, y: 1 } });
        expect(engine.getLegalActions(0).filter(a => a.type !== 'surrender').map(a => a.type).sort()).toEqual(['capture', 'wait']);
        const network = model(), ai = new BatchedNeuralBeamSearchAI(network, { modelVersion: 'V7', ownTurnRollout: true });
        expect(await ai.getAction(engine, 0)).toEqual({ type: 'capture', unitId: 'u3' });
        expect(network.forwardBatch).not.toHaveBeenCalled();
        expect(ai.telemetry.stopReason).toBe('unique_action');
        expect(ai.telemetry.teacher?.available).toBe(false);
    });
    it('真实根不调用B、不缓存队列，A和C见证无占领待机及提前结束禁手', async () => {
        const engine = new GameEngine(createDemoState()), witnesses: any[] = [];
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: 'V7', ownTurnRollout: true, budgetMs: 4000,
            maxNodes: 2400, finalists: 4, responseVariants: 1, responseUnits: 128, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, 0);
        expect(['move', 'recruit', 'recruit_to_castle']).toContain(action.type);
        expect(ai.telemetry.waveBatches.B).toBe(0);
        expect((ai as any).queue).toEqual([]);
        expect(witnesses.length).toBeGreaterThan(1);
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial, { applyInitialTurnStart: false });
            for (const action of w.actions) {
                const state = replay.getState(), legal = replay.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                if (action.type === 'wait') expect(legal.some(a => ['capture', 'repair'].includes(a.type) && actionActor(a) === actionActor(action))).toBe(false);
                if (action.type === 'end_turn') {
                    const bundle = tacticalPriorBundle(state, legal, new ReachabilityContext(state), true);
                    expect(Boolean(bundle.forbidden?.[legal.findIndex(a => a.type === 'end_turn')])).toBe(false);
                }
                expect(replay.hasLegalAction(state.currentPlayer, action)).toBe(true);
                replay.step(action);
            }
        }
    }, 10000);
    it('根与链先验尺度不共享缓存，相同尺度重复查询命中缓存', async () => {
        const engine = new GameEngine(createDemoState()), network = model();
        const ai = new BatchedNeuralBeamSearchAI(network, { modelVersion: 'V7', ownTurnRollout: true, priorScale: .3, ownRolloutPriorScale: 1 }) as any;
        ai.self = 0; ai.deadline = ai.activeEnd = performance.now() + 3000;
        const root = (await ai.evaluateBatch([engine], 'root'))[0];
        const chain = (await ai.evaluateBatch([engine], 'A'))[0];
        expect(root).not.toBe(chain);
        expect((await ai.evaluateBatch([engine], 'A'))[0]).toBe(chain);
        expect(network.forwardBatch).toHaveBeenCalledTimes(2);
        expect(chain.ranked.some((r: RankedAction, i: number) => r.score !== root.ranked[i]?.score)).toBe(true);
    });
    it('根评估后仅剩一个允许动作时不展开伪搜索', async () => {
        const engine = new GameEngine(createDemoState());
        const legal = engine.getLegalActions(0);
        const action = legal.find(a => a.type === 'move')!;
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: 'V7', ownTurnRollout: true }) as any;
        vi.spyOn(ai, 'evaluateBatch').mockResolvedValue([{ value: 0, ranked: [
            { action, code: 'm', score: 0, prior: 0 },
            { action: { type: 'end_turn' }, code: 'e', score: 10, prior: 0, forbidden: true }
        ] }]);
        expect(await ai.getAction(engine, 0)).toEqual(action);
        expect(ai.telemetry.stopReason).toBe('unique_action');
        expect(ai.telemetry.nodes).toBe(0);
        expect(ai.telemetry.teacher.available).toBe(false);
    });
    it.each([2, 3, 4])('%i名存活玩家只在单挑生成双反扑', async n => {
        const state = createDemoState();
        state.rules = { ...state.rules, defeatOnNoUnitsAndNoCastles: false, defeatOnNoUnits: false, defeatOnCommanderDeath: false, defeatOnNoCastles: false };
        state.players = Array.from({ length: n }, (_, id) => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 }));
        const engine = new GameEngine(state, { applyInitialTurnStart: false });
        engine.step({ type: 'end_turn' });
        const ai = new BatchedNeuralBeamSearchAI(model(), { modelVersion: 'V7', ownTurnRollout: true, responseVariants: 1, twoPlayerResponseVariants: 2, responseUnits: 128 }) as any;
        ai.self = 0; ai.deadline = ai.activeEnd = performance.now() + 3000;
        const groups = await ai.responseLeavesBatch([{ engine, steps: [{ state, action: { type: 'end_turn' } }], ends: [1], value: 0, prior: 0, score: 0 }]);
        expect(groups[0]).toHaveLength(n === 2 ? 2 : 1);
    });
});
