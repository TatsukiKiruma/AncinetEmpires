import { expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDemoState } from '../../game/demo_map';
import { encodeDualObservation } from '../dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from './batched_beam_search';
import type { BatchedSearchModel } from './batched_search_types';

it('纯价值评估不请求引擎动作列表，保留所有价值输入并隔离策略缓存', async () => {
    const engine = new GameEngine(createDemoState());
    const state = engine.getState();
    const full = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer));
    const calls: boolean[] = [];
    const model: BatchedSearchModel = {supportsValueOnly: true, forwardBatch: async (rows, context) => {
        calls.push(Boolean(context?.valueOnly));
        for (const row of rows) {
            expect(row.spatialTensor).toEqual(full.spatialTensor);
            expect(row.entityTokens).toEqual(full.entityTokens);
            expect(row.relationalBias).toEqual(full.relationalBias);
            if (context?.valueOnly) expect(row.actions.pointers.length).toBe(0);
        }
        return rows.map(row => ({logits: new Float32Array(row.actions.sourceIndices.length), valueProbs: [.5,.5,0,0,0,0], valueLogits: [0,0,-1e9,-1e9,-1e9,-1e9]}));
    }};
    const ai: any = new BatchedNeuralBeamSearchAI(model, {modelVersion: '纯价值回归'});
    ai.self = state.currentPlayer; ai.deadline = ai.activeEnd = performance.now() + 60000;
    const legal = vi.spyOn(engine, 'getLegalActions');
    const values = await ai.evaluateBatch([engine,engine], 'C', undefined, true);
    expect(legal).not.toHaveBeenCalled(); expect(calls).toEqual([true]);
    expect(values[0].ranked).toEqual([]); expect(values[0].value).toBe(values[1].value);
    await ai.evaluateBatch([engine], 'C');
    expect(calls).toEqual([true,false]); expect(legal).toHaveBeenCalled();
    legal.mockRestore();
});

it('相同完整状态键无损区分任意字段变化', () => {
    const state = createDemoState();
    const ai: any = new BatchedNeuralBeamSearchAI({forwardBatch: async () => []}, {modelVersion: '完整状态键'});
    const changed = structuredClone(state); changed.players[0].gold++;
    expect(ai.key(state)).not.toBe(ai.key(changed));
    expect(ai.key(state)).toBe(ai.key(structuredClone(state)));
});

it('未声明纯价值能力的旧客户端仍收到完整动作菜单', async () => {
    const engine = new GameEngine(createDemoState());
    let count = 0;
    const model: BatchedSearchModel = {forwardBatch: async (rows, context) => {
        expect(context?.valueOnly).toBe(false);
        expect(rows[0].actions.pointers.length).toBeGreaterThan(0); count++;
        return rows.map(row => ({logits:new Float32Array(row.actions.sourceIndices.length),valueLogits:[0,0,-1e9,-1e9,-1e9,-1e9],valueProbs:[.5,.5,0,0,0,0]}));
    }};
    const ai:any = new BatchedNeuralBeamSearchAI(model,{modelVersion:'旧客户端兼容'});
    ai.self=engine.getState().currentPlayer; ai.deadline=ai.activeEnd=performance.now()+60000;
    await ai.evaluateBatch([engine],'C',undefined,true);
    expect(count).toBe(1);
});
