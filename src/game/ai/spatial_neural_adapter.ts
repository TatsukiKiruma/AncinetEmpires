/**
 * 空间残差卷积网络 AI 适配器 (Path B - Spatial Neural AI Adapter)
 *
 * 核心特性：
 * 1. 严格模型与编码契约绑定：v2 使用 32 维动作语义与 20 维全局特征；v1 显式保留为 24 维历史对照；
 * 2. 严禁静默回退：加载失败或无效索引严格拒绝，正式模式绝不使用随机初始化权重或 legal[0]；
 * 3. 共享推理契约：使用 shared_spatial_policy.predictSpatialAction，确保前端、评测与 DAgger 一致；
 * 4. 真实端到端时延与权威元数据：完整回传 requestedPolicy, actualPolicy, checkpointSha256, encoderVersion。
 */

import { GameEngine } from '../engine';
import { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { type AiActionResult } from './neural_ai_adapter';
import { runCancellableAiAction } from './cancellable_ai_runner';
import trainedSpatialModelV1 from './models/spatial_resnet_checkpoint.json';
import trainedSpatialModelV2 from './models/spatial_resnet_v2_checkpoint.json';
import trainedSpatialModelDagger from './models/spatial_resnet_dagger_checkpoint.json';
import {
    loadSpatialResNetFromJson,
    SpatialResNetPredictor,
    SpatialResNetWeights
} from './spatial_conv_net';
import { predictSpatialAction } from './shared_spatial_policy';
import { getPolicyRegistryEntry, isValueHeadQualified } from './models/model_registry';

export type SupportedSpatialPolicy =
    | 'spatial_v2_experimental'
    | 'spatial_dagger_experimental'
    | 'spatial_resnet_v1';

const predictorCache = new Map<string, SpatialResNetPredictor>();

/**
 * 严格加载并缓存空间预测器。正式模式绝不回退至随机初始化权重。
 */
export function getSpatialPredictor(
    policy: SupportedSpatialPolicy = 'spatial_v2_experimental'
): SpatialResNetPredictor {
    const cached = predictorCache.get(policy);
    if (cached) return cached;

    try {
        let modelJsonObj: any;
        if (policy === 'spatial_v2_experimental') {
            modelJsonObj = trainedSpatialModelV2;
        } else if (policy === 'spatial_dagger_experimental') {
            modelJsonObj = trainedSpatialModelDagger;
        } else if (policy === 'spatial_resnet_v1') {
            modelJsonObj = trainedSpatialModelV1;
        } else {
            throw new Error(`Unsupported spatial policy: ${policy}`);
        }

        const weights = loadSpatialResNetFromJson(JSON.stringify(modelJsonObj));
        const predictor = new SpatialResNetPredictor(weights);
        predictorCache.set(policy, predictor);
        return predictor;
    } catch (err) {
        const errorMsg = `MODEL_LOAD_ERROR: Failed to load spatial predictor for policy "${policy}": ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Spatial AI] ${errorMsg}`);
        throw new Error(errorMsg);
    }
}

export function getDefaultSpatialPredictor(
    policy: SupportedSpatialPolicy = 'spatial_v2_experimental'
): SpatialResNetPredictor {
    return getSpatialPredictor(policy);
}

export function setDefaultSpatialWeights(
    weights: SpatialResNetWeights,
    policy: SupportedSpatialPolicy = 'spatial_v2_experimental'
): void {
    const predictor = new SpatialResNetPredictor(weights);
    predictorCache.set(policy, predictor);
}

export interface SpatialAiActionOptions {
    policy?: SupportedSpatialPolicy;
    deadlineMs?: number;
    signal?: AbortSignal;
    predictor?: SpatialResNetPredictor;
    allowInteractiveFallback?: boolean;
    onTelemetry?: (result: AiActionResult) => void;
}

/**
 * 空间卷积 AI 异步决策入口函数 (带 1 秒硬看门狗与异常安全回退)
 */
export async function getSpatialAiAction(
    engine: GameEngine,
    playerId: number,
    options: SpatialAiActionOptions = {}
): Promise<AiActionResult> {
    const policy = options.policy ?? 'spatial_v2_experimental';
    if (options.predictor) {
        predictorCache.set(policy, options.predictor);
    }
    return runCancellableAiAction({
        policy,
        engine,
        playerId,
        deadlineMs: options.deadlineMs,
        signal: options.signal,
        allowInteractiveFallback: options.allowInteractiveFallback ?? true
    });
}

/**
 * 同步快捷调用入口（无异步开销，适合内部对局测试循环与共享调用）
 */
export function getSpatialAiActionSync(
    engine: GameEngine,
    playerId: number,
    options: SpatialAiActionOptions = {}
): AiActionResult {
    const t0 = performance.now();
    const deadlineMs = options.deadlineMs ?? 1000;
    const requestedPolicy = options.policy ?? 'spatial_v2_experimental';
    const registryEntry = getPolicyRegistryEntry(requestedPolicy);
    const checkpointSha = registryEntry?.checkpoint?.sha256;

    // 检查取消信号
    if (options.signal?.aborted) {
        const e2eMs = Math.round(performance.now() - t0);
        const actionResult: AiActionResult = {
            action: { type: 'end_turn' },
            status: 'CANCELLED',
            latencyMs: e2eMs,
            e2eMs,
            source: `${requestedPolicy} (Cancelled)`,
            requestedPolicy,
            actualPolicy: requestedPolicy,
            checkpointSha256: checkpointSha,
            encoderVersion: requestedPolicy === 'spatial_resnet_v1' ? 'v1' : 'v2',
            fallbackUsed: false,
            fallbackReason: 'ABORTED',
            deadlineMiss: false
        };
        options.onTelemetry?.(actionResult);
        return actionResult;
    }

    try {
        const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) {
            const e2e = Math.round(performance.now() - t0);
            const emptyResult: AiActionResult = {
                action: { type: 'end_turn' },
                status: 'OK',
                latencyMs: e2e,
                e2eMs: e2e,
                source: `${requestedPolicy} (Empty Legal Actions)`,
                requestedPolicy,
                actualPolicy: requestedPolicy,
                checkpointSha256: checkpointSha,
                encoderVersion: requestedPolicy === 'spatial_resnet_v1' ? 'v1' : 'v2',
                deadlineMiss: e2e > deadlineMs
            };
            options.onTelemetry?.(emptyResult);
            return emptyResult;
        }

        const predictor = options.predictor ?? getSpatialPredictor(requestedPolicy);
        const encVersion: 'v1' | 'v2' = requestedPolicy === 'spatial_resnet_v1' ? 'v1' : 'v2';

        const state = engine.getState();
        const predResult = predictSpatialAction(predictor, state, playerId, legalActions, encVersion);

        const e2eMs = Math.round(performance.now() - t0);
        const actionResult: AiActionResult = {
            action: predResult.action,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            source: isValueHeadQualified(requestedPolicy)
                ? `${registryEntry?.title ?? requestedPolicy} (V:${predResult.value.toFixed(2)})`
                : `${registryEntry?.title ?? requestedPolicy} (V:unqualified)`,
            requestedPolicy,
            actualPolicy: requestedPolicy,
            checkpointSha256: checkpointSha,
            encoderVersion: encVersion,
            deadlineMiss: e2eMs > deadlineMs
        };

        options.onTelemetry?.(actionResult);
        return actionResult;
    } catch (err) {
        if (!options.allowInteractiveFallback) {
            // 正式模式 / benchmark 严禁静默 fallback：直接抛出真实错误
            throw err;
        }

        console.warn(`[Spatial AI] ${requestedPolicy} 决策异常，交互模式回退至 HeuristicAI:`, err);
        const fallbackAi = new HeuristicAI();
        const fallbackAction = fallbackAi.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);

        const actionResult: AiActionResult = {
            action: fallbackAction,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI (Interactive Fallback)',
            requestedPolicy,
            actualPolicy: 'heuristic',
            checkpointSha256: checkpointSha,
            encoderVersion: requestedPolicy === 'spatial_resnet_v1' ? 'v1' : 'v2',
            fallbackUsed: true,
            fallbackReason: `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`,
            deadlineMiss: e2eMs > deadlineMs
        };

        options.onTelemetry?.(actionResult);
        return actionResult;
    }
}
