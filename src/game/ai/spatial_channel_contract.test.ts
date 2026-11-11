import { describe, expect, it, vi } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { getSpatialAiActionSync, getSpatialPredictor } from './spatial_neural_adapter';
import { getAiAction } from './neural_ai_adapter';
import { getFilteredCandidateActionsDetailed } from './runtime/v7_heuristic_bounded_search';
import { createInitializedSpatialResNet, SpatialResNetPredictor } from './spatial_conv_net';
import { ENCODER_SCHEMA_ID_V13, ENCODER_SCHEMA_ID_V15, ENCODER_SCHEMA_ID_V19 } from './spatial_tensor_encoder';

describe('空间策略和S10搜索按权重schema编码', () => {
    it('应用适配器直接使用内置24通道权重，不触发回退', () => {
        const engine = new GameEngine(createDemoState());
        const predictor = getSpatialPredictor('spatial_v2_experimental');
        expect(predictor.spatialChannels).toBe(24);
        const result = getSpatialAiActionSync(engine, 0, { predictor, allowInteractiveFallback: false });
        expect(result.status).toBe('OK');
        expect(result.actualPolicy).toBe('spatial_v2_experimental');
        expect(result.fallbackUsed).not.toBe(true);
        expect(engine.getLegalActions(0)).toContainEqual(result.action);
    });

    it('应用s10_spatial_search入口使用内置权重完成决策', () => {
        const engine = new GameEngine(createDemoState());
        const result = getAiAction('s10_spatial_search', engine, 0, { deadlineMs: 3000 });
        expect(result.status).toBe('OK');
        expect(result.actualPolicy).toBe('s10_spatial_search');
        expect(result.fallbackUsed).not.toBe(true);
        expect(engine.getLegalActions(0)).toContainEqual(result.action);
    });

    for (const schema of [ENCODER_SCHEMA_ID_V13, ENCODER_SCHEMA_ID_V15, ENCODER_SCHEMA_ID_V19] as const) {
        it(`S10候选实际执行${schema}的前向且不改变状态`, () => {
            const engine = new GameEngine(createDemoState());
            const before = engine.getState();
            const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(18, 'spatial-resnet-v2', schema));
            const spy = vi.spyOn(predictor, 'predict');
            const filtered = getFilteredCandidateActionsDetailed(engine, 0, new HeuristicAI(), predictor,
                { maxTotal: 5, tacticalQuota: 0, heuristicQuota: 0, topSpatialK: 4 });
            expect(spy).toHaveBeenCalledOnce();
            expect(filtered.sourceCounts.spatial).toBeGreaterThan(0);
            for (const action of filtered.candidates) expect(engine.getLegalActions(0)).toContainEqual(action);
            expect(engine.getState()).toEqual(before);
        });
    }
});
