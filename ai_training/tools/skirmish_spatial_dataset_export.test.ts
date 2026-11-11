import { describe, it, expect } from 'vitest';
import { ACTION_SEMANTIC_DIM, SPATIAL_TENSOR_CHANNELS } from '../src/game/ai/spatial_tensor_encoder';
import { generateSpatialEpisodeSamples, exportSpatialDataset } from './skirmish_spatial_dataset_export';

describe('Spatial Dataset Exporter (Path B)', () => {
    it('成功生成自包含对局样本，张量形状与候选特征对齐', () => {
        const res = generateSpatialEpisodeSamples(0, 9999, 10);
        expect(res.samples.length).toBeGreaterThan(0);

        const first = res.samples[0];
        expect(first.sampleId).toContain('spatial_ep_0_seed_9999');
        expect(first.rootFamilyId).toBeDefined();
        // V14/T14-03：编码器通道数由 24 扩到 26（新增 hasMoved 与有效攻击力）。
        expect(first.spatialTensor.length).toBe(SPATIAL_TENSOR_CHANNELS * 20 * 20);
        expect(first.globalFeatures.length).toBe(20);
        expect(first.candidateActions.length).toBeGreaterThan(0);
        expect(first.targetActionIndex).toBeGreaterThanOrEqual(0);
        expect(first.targetActionIndex).toBeLessThan(first.candidateActions.length);

        // 验证候选动作语义结构 (V2 为 32 维)
        const cand = first.candidateActions[0];
        expect(cand.action).toBeDefined();
        expect(cand.semantics.length).toBe(ACTION_SEMANTIC_DIM);
    });

    it('支持批量对局导出统计，无文件污染 (dryRun)', () => {
        const summary = exportSpatialDataset({
            episodes: 2,
            maxStepsPerEpisode: 5,
            dryRun: true
        });

        expect(summary.totalEpisodes).toBe(2);
        expect(summary.totalSamples).toBeGreaterThan(0);
    });
});
