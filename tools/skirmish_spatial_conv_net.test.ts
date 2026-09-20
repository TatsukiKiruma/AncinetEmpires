import { describe, it, expect } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import {
    createInitializedSpatialResNet,
    SpatialResNetPredictor,
    exportSpatialResNetToJson,
    loadSpatialResNetFromJson
} from '../src/game/ai/spatial_conv_net';

describe('Spatial Conv ResNet (Path B)', () => {
    it('正确初始化权重并验证参数量', () => {
        const weights = createInitializedSpatialResNet(12345);
        expect(weights.version).toBe('spatial-resnet-v1');
        expect(weights.architectureId).toBe('spatial_resnet_32ch_2res');

        // 计算总参数量
        let totalParams = 0;
        const countLayer = (l: { weights: Float32Array; biases: Float32Array }) => {
            totalParams += l.weights.length + l.biases.length;
        };
        countLayer(weights.stem);
        countLayer(weights.res1_1);
        countLayer(weights.res1_2);
        countLayer(weights.res2_1);
        countLayer(weights.res2_2);
        countLayer(weights.valDense1);
        countLayer(weights.valDense2);
        countLayer(weights.polDense1);
        countLayer(weights.polDense2);

        // 验证总参数量在 ~47,000 左右（紧凑轻量，适合前端毫秒级推理）
        expect(totalParams).toBeGreaterThan(40000);
        expect(totalParams).toBeLessThan(55000);
    });

    it('单次前向完成局势价值评估与合法动作打分，耗时满足低延迟约束', () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(0);
        expect(legalActions.length).toBeGreaterThan(0);

        const weights = createInitializedSpatialResNet(42);
        const predictor = new SpatialResNetPredictor(weights);

        const encodedState = encodeGameStateSpatial(state, 0);
        const candidateFeatures = legalActions.map(a => encodeCandidateActionSpatial(state, 0, a));

        const t0 = performance.now();
        const result = predictor.predict(encodedState, candidateFeatures);
        const elapsed = performance.now() - t0;

        // 1. 验证耗时
        expect(elapsed).toBeLessThan(100); // 远低于 1000ms

        // 2. 验证价值头输出
        expect(result.value).toBeGreaterThanOrEqual(-1.0);
        expect(result.value).toBeLessThanOrEqual(1.0);

        // 3. 验证动作头输出
        expect(result.actionLogits.length).toBe(legalActions.length);
        expect(result.actionProbs.length).toBe(legalActions.length);
        expect(result.bestActionIndex).toBeGreaterThanOrEqual(0);
        expect(result.bestActionIndex).toBeLessThan(legalActions.length);

        const sumProb = result.actionProbs.reduce((a, b) => a + b, 0);
        expect(sumProb).toBeCloseTo(1.0, 5);

        // 4. 最佳动作必为合法动作之一
        const bestAction = legalActions[result.bestActionIndex];
        expect(bestAction).toBeDefined();
    });

    it('支持 JSON 序列化与反序列化，加载后预测输出完全确定', () => {
        const weights = createInitializedSpatialResNet(999);
        const jsonStr = exportSpatialResNetToJson(weights);
        expect(typeof jsonStr).toBe('string');
        expect(jsonStr.length).toBeGreaterThan(1000);

        const reloadedWeights = loadSpatialResNetFromJson(jsonStr);

        const state = createDemoState();
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(0);
        const encodedState = encodeGameStateSpatial(state, 0);
        const candidateFeatures = legalActions.map(a => encodeCandidateActionSpatial(state, 0, a));

        const predOriginal = new SpatialResNetPredictor(weights).predict(encodedState, candidateFeatures);
        const predReloaded = new SpatialResNetPredictor(reloadedWeights).predict(encodedState, candidateFeatures);

        expect(predOriginal.value).toBeCloseTo(predReloaded.value, 6);
        expect(predOriginal.bestActionIndex).toBe(predReloaded.bestActionIndex);
        for (let i = 0; i < predOriginal.actionLogits.length; i += 1) {
            expect(predOriginal.actionLogits[i]).toBeCloseTo(predReloaded.actionLogits[i], 5);
        }
    });
});
