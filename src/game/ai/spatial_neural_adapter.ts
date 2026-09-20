/**
 * 空间残差卷积网络 AI 适配器 (Path B - Spatial Neural AI Adapter)
 *
 * 核心特性：
 * 1. 端到端 1000ms 契约：使用调用方单调时钟 (performance.now()) 真实度量；
 * 2. 超时与异常看门狗保护：使用 runCancellableAiAction，超时或异常自动回退到 HeuristicAI；
 * 3. 100% 规则合法：候选动作由 GameEngine 直接生成，仅对其进行空间特征池化与战术语义打分；
 * 4. 局势价值输出：同时输出当前盘面胜率估计 V(S) ∈ [-1, 1]。
 */

import { GameEngine } from '../engine';
import { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { AiActionResult } from './neural_ai_adapter';
import { runCancellableAiAction } from './cancellable_ai_runner';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from './spatial_tensor_encoder';
import trainedSpatialModel from './models/spatial_resnet_checkpoint.json';
import {
    createInitializedSpatialResNet,
    loadSpatialResNetFromJson,
    SpatialResNetPredictor,
    SpatialResNetWeights
} from './spatial_conv_net';

let defaultSpatialPredictor: SpatialResNetPredictor | null = null;

export function getDefaultSpatialPredictor(): SpatialResNetPredictor {
    if (!defaultSpatialPredictor) {
        try {
            const weights = loadSpatialResNetFromJson(JSON.stringify(trainedSpatialModel));
            defaultSpatialPredictor = new SpatialResNetPredictor(weights);
        } catch (err) {
            console.warn('[Spatial AI] 加载训练模型失败，回退至初始化权重:', err);
            const weights = createInitializedSpatialResNet(20260920);
            defaultSpatialPredictor = new SpatialResNetPredictor(weights);
        }
    }
    return defaultSpatialPredictor;
}

export function setDefaultSpatialWeights(weights: SpatialResNetWeights): void {
    defaultSpatialPredictor = new SpatialResNetPredictor(weights);
}

export interface SpatialAiActionOptions {
    deadlineMs?: number;
    signal?: AbortSignal;
    predictor?: SpatialResNetPredictor;
    onTelemetry?: (result: AiActionResult) => void;
}

/**
 * 空间卷积 AI 决策入口函数 (带 1 秒硬看门狗与异常安全回退)
 */
export async function getSpatialAiAction(
    engine: GameEngine,
    playerId: number,
    options: SpatialAiActionOptions = {}
): Promise<AiActionResult> {
    if (options.predictor) {
        setDefaultSpatialWeights((options.predictor as any).weights);
    }
    return runCancellableAiAction({
        policy: 'spatial_resnet_v1',
        engine,
        playerId,
        deadlineMs: options.deadlineMs,
        signal: options.signal
    });
}

/**
 * 同步快捷调用入口（无异步开销，适合内部对局测试循环）
 */
export function getSpatialAiActionSync(
    engine: GameEngine,
    playerId: number,
    options: SpatialAiActionOptions = {}
): AiActionResult {
    const t0 = performance.now();
    const deadlineMs = options.deadlineMs ?? 1000;
    const predictor = options.predictor ?? getDefaultSpatialPredictor();

    try {
        const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) {
            const e2e = Math.round(performance.now() - t0);
            return {
                action: { type: 'end_turn' },
                latencyMs: e2e,
                e2eMs: e2e,
                source: 'Spatial ResNet v1 (Empty)',
                deadlineMiss: e2e > deadlineMs
            };
        }

        const state = engine.getState();
        const encodedState = encodeGameStateSpatial(state, playerId);
        const candidateFeatures = legalActions.map(a =>
            encodeCandidateActionSpatial(state, playerId, a)
        );

        const result = predictor.predict(encodedState, candidateFeatures);
        const bestAction = legalActions[result.bestActionIndex] ?? legalActions[0];
        const e2eMs = Math.round(performance.now() - t0);

        const actionResult: AiActionResult = {
            action: bestAction,
            latencyMs: e2eMs,
            e2eMs,
            source: `Spatial ResNet v1 (V:${result.value.toFixed(2)})`,
            deadlineMiss: e2eMs > deadlineMs
        };

        options.onTelemetry?.(actionResult);
        return actionResult;
    } catch (err) {
        console.warn('[Spatial AI] 决策异常，安全回退到 HeuristicAI:', err);
        const fallbackAi = new HeuristicAI();
        const action = fallbackAi.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const actionResult: AiActionResult = {
            action,
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI (Spatial Fallback)',
            fallbackUsed: true,
            fallbackReason: 'EXCEPTION_SPATIAL_SYNC',
            deadlineMiss: e2eMs > deadlineMs
        };
        options.onTelemetry?.(actionResult);
        return actionResult;
    }
}
