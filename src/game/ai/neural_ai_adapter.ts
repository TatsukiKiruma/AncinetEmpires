/**
 * 前端/应用层 AI 策略适配器 (Path B & Skirmish AI Adapter)
 *
 * 统一封装启发式、随机 AI 以及空间残差网络 (V2 实验性模型、DAgger、V1 历史内置) 与 NET_B / NET_A 策略。
 * 核心保障：
 * 1. 真实端到端时延权威度量 (performance.now())；
 * 2. 严格错误处理，正式模式严禁以随机初始化权重或 legal[0] 伪装模型决策；
 * 3. 取消信号返回 status: 'CANCELLED'，调用端拒绝执行作废动作。
 */

import { GameEngine } from '../engine';
import type { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { RandomAI } from './random_ai';
import { loadDualHeadModelFromJson, predictDecision, type DualHeadNet } from '../../../tools/skirmish_dual_head_net';
import { createNetworkModelScorer } from '../../../tools/skirmish_neural_search';
import { searchTeacherAction } from '../../../tools/skirmish_search_teacher';
import { encodeGameState, encodeGameActionV2 } from '../../../tools/skirmish_network_features';
import netBData from './models/net_b_checkpoint.json';
import {
    getSpatialAiActionSync,
    getSpatialPredictor
} from './spatial_neural_adapter';
import { runBoundedSearch } from '../../../tools/v7_heuristic_bounded_search';
import { getPolicyRegistryEntry } from './models/model_registry';

export type SupportedAiPolicy =
    | 'heuristic'
    | 'random'
    | 'spatial_v2_experimental'
    | 'spatial_dagger_experimental'
    | 's10_spatial_search'
    | 's00_search'
    | 'spatial_resnet_v1'
    | 'spatial_v2_smoke_100'
    | 'net_b_s10'
    | 'net_b_1ply'
    | 'net_a';

export interface AiActionResult {
    action: Action;
    latencyMs: number;
    e2eMs?: number;
    nodesExpanded?: number;
    source: string;
    status?: 'OK' | 'CANCELLED' | 'STALE' | 'TIMEOUT' | 'ERROR';
    requestedPolicy?: SupportedAiPolicy | string;
    actualPolicy?: SupportedAiPolicy | string;
    checkpointSha256?: string;
    encoderVersion?: string;
    fallbackUsed?: boolean;
    fallbackReason?: string | null;
    deadlineMiss?: boolean;
}

export interface AiActionOptions {
    signal?: AbortSignal;
    deadlineMs?: number;
    stateVersion?: number | string;
    allowInteractiveFallback?: boolean;
    onTelemetry?: (telemetry: AiActionResult) => void;
}

let cachedNetB: DualHeadNet | null = null;
let cachedModelScorer: ((state: any, playerId: number, actions: readonly Action[]) => Map<string, number>) | null = null;

export function getNetB(): DualHeadNet {
    if (!cachedNetB) {
        cachedNetB = loadDualHeadModelFromJson(JSON.stringify(netBData));
    }
    return cachedNetB;
}

export function getModelScorer() {
    if (!cachedModelScorer) {
        const net = getNetB();
        cachedModelScorer = createNetworkModelScorer(net);
    }
    return cachedModelScorer;
}

/**
 * 核心 AI 决策入口：调用方单调时钟端到端权威测量
 */
export function getAiAction(
    policy: SupportedAiPolicy,
    engine: GameEngine,
    playerId: number,
    options?: AiActionOptions
): AiActionResult {
    const t0 = performance.now();
    const deadlineMs = options?.deadlineMs ?? 1000;
    const registryEntry = getPolicyRegistryEntry(policy);
    const checkpointSha = registryEntry?.checkpoint?.sha256;
    const encoderVersion = registryEntry?.checkpoint?.encoderVersion ?? (policy === 'heuristic' ? 'heuristic' : 'none');

    // 1. 检查取消信号：返回 CANCELLED，调用方不得落子
    if (options?.signal?.aborted) {
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action: { type: 'end_turn' },
            status: 'CANCELLED',
            latencyMs: e2eMs,
            e2eMs,
            source: `${policy} (Cancelled)`,
            requestedPolicy: policy,
            actualPolicy: policy,
            checkpointSha256: checkpointSha,
            encoderVersion,
            fallbackUsed: false,
            fallbackReason: 'ABORTED',
            deadlineMiss: false
        };
        options?.onTelemetry?.(res);
        return res;
    }

    if (policy === 'random') {
        const ai = new RandomAI();
        const action = ai.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            source: 'RandomAI',
            requestedPolicy: 'random',
            actualPolicy: 'random',
            deadlineMiss: e2eMs > deadlineMs
        };
        options?.onTelemetry?.(res);
        return res;
    }

    if (policy === 'heuristic') {
        const ai = new HeuristicAI();
        const action = ai.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI (Production Default)',
            requestedPolicy: 'heuristic',
            actualPolicy: 'heuristic',
            deadlineMiss: e2eMs > deadlineMs
        };
        options?.onTelemetry?.(res);
        return res;
    }

    if (
        policy === 'spatial_v2_experimental' ||
        policy === 'spatial_dagger_experimental' ||
        policy === 'spatial_resnet_v1'
    ) {
        return getSpatialAiActionSync(engine, playerId, {
            ...options,
            policy
        });
    }

    if (policy === 's00_search') {
        const res = runBoundedSearch(engine, playerId, {
            budget: {
                maxMs: 200,
                maxNodes: 20,
                hardMaxMs: deadlineMs
            },
            signal: options?.signal
        });
        const e2eMs = Math.round(performance.now() - t0);
        const actionResult: AiActionResult = {
            action: res.chosenAction,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            nodesExpanded: res.totalNodes,
            source: `S00 Search (${res.budgetReason})`,
            requestedPolicy: 's00_search',
            actualPolicy: 's00_search',
            deadlineMiss: e2eMs > deadlineMs
        };
        options?.onTelemetry?.(actionResult);
        return actionResult;
    }

    if (policy === 's10_spatial_search') {
        const predictor = getSpatialPredictor('spatial_v2_experimental');
        const res = runBoundedSearch(engine, playerId, {
            budget: {
                maxMs: 200,
                maxNodes: 20,
                hardMaxMs: deadlineMs
            },
            spatialPredictor: predictor,
            signal: options?.signal
        });
        const e2eMs = Math.round(performance.now() - t0);
        const actionResult: AiActionResult = {
            action: res.chosenAction,
            status: 'OK',
            latencyMs: e2eMs,
            e2eMs,
            nodesExpanded: res.totalNodes,
            source: `S10 Spatial Search (${res.budgetReason})`,
            requestedPolicy: 's10_spatial_search',
            actualPolicy: 's10_spatial_search',
            checkpointSha256: checkpointSha,
            encoderVersion: 'v2',
            deadlineMiss: e2eMs > deadlineMs
        };
        options?.onTelemetry?.(actionResult);
        return actionResult;
    }

    if (policy === 'net_b_1ply') {
        try {
            const net = getNetB();
            const state = engine.getState();
            const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
            if (legalActions.length === 0) {
                const e2eMs = Math.round(performance.now() - t0);
                const res: AiActionResult = {
                    action: { type: 'end_turn' },
                    status: 'OK',
                    latencyMs: e2eMs,
                    e2eMs,
                    source: 'NET_B (1-ply: Empty)',
                    requestedPolicy: 'net_b_1ply',
                    actualPolicy: 'net_b_1ply',
                    checkpointSha256: checkpointSha,
                    encoderVersion: 'dense-45',
                    deadlineMiss: e2eMs > deadlineMs
                };
                options?.onTelemetry?.(res);
                return res;
            }
            const stateVec = Array.from(encodeGameState(state, playerId));
            const candVecs = legalActions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const decision = predictDecision(net, stateVec, candVecs);
            const bestIndex = decision.bestActionIndex ?? decision.topIndex;
            if (bestIndex === undefined || bestIndex < 0 || bestIndex >= legalActions.length) {
                throw new Error(`NET_B returned invalid action index ${bestIndex} for ${legalActions.length} actions`);
            }
            const bestAction = legalActions[bestIndex];
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action: bestAction,
                status: 'OK',
                latencyMs: e2eMs,
                e2eMs,
                source: 'NET_B (1-ply Policy)',
                requestedPolicy: 'net_b_1ply',
                actualPolicy: 'net_b_1ply',
                checkpointSha256: checkpointSha,
                encoderVersion: 'dense-45',
                deadlineMiss: e2eMs > deadlineMs
            };
            options?.onTelemetry?.(res);
            return res;
        } catch (err) {
            if (!options?.allowInteractiveFallback) {
                throw err;
            }
            console.warn('[AI] NET_B 1-ply 异常，回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            const action = fallbackAi.getAction(engine, playerId);
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action,
                status: 'OK',
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Fallback)',
                requestedPolicy: 'net_b_1ply',
                actualPolicy: 'heuristic',
                checkpointSha256: checkpointSha,
                encoderVersion: 'dense-45',
                fallbackUsed: true,
                fallbackReason: `EXCEPTION_1PLY: ${err instanceof Error ? err.message : String(err)}`,
                deadlineMiss: e2eMs > deadlineMs
            };
            options?.onTelemetry?.(res);
            return res;
        }
    }

    if (policy === 'net_b_s10') {
        try {
            const scorer = getModelScorer();
            const state = engine.getState();
            const decision = searchTeacherAction({
                state,
                playerId,
                config: {
                    nodeBudget: 150,
                    deadlineMs,
                    searchStopElapsedMs: Math.min(850, Math.floor(deadlineMs * 0.85)),
                    returnTargetElapsedMs: Math.min(950, Math.floor(deadlineMs * 0.95))
                },
                modelScorer: scorer
            });

            const e2eMs = Math.round(performance.now() - t0);
            const deadlineMiss = e2eMs > deadlineMs;

            const res: AiActionResult = {
                action: decision.action,
                status: 'OK',
                latencyMs: e2eMs,
                e2eMs,
                nodesExpanded: decision.nodesExpanded,
                source: `NET_B S10 (${decision.reason})`,
                requestedPolicy: 'net_b_s10',
                actualPolicy: 'net_b_s10',
                checkpointSha256: checkpointSha,
                encoderVersion: 'dense-45',
                fallbackUsed: decision.fallbackUsed || deadlineMiss,
                fallbackReason: decision.fallbackReason ?? (deadlineMiss ? 'REAL_DEADLINE_EXCEEDED' : null),
                deadlineMiss
            };
            options?.onTelemetry?.(res);
            return res;
        } catch (err) {
            if (!options?.allowInteractiveFallback) {
                throw err;
            }
            console.warn('[AI] NET_B S10 搜索异常，回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            const action = fallbackAi.getAction(engine, playerId);
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action,
                status: 'OK',
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Fallback)',
                requestedPolicy: 'net_b_s10',
                actualPolicy: 'heuristic',
                checkpointSha256: checkpointSha,
                encoderVersion: 'dense-45',
                fallbackUsed: true,
                fallbackReason: `EXCEPTION_S10: ${err instanceof Error ? err.message : String(err)}`,
                deadlineMiss: e2eMs > deadlineMs
            };
            options?.onTelemetry?.(res);
            return res;
        }
    }

    // 默认回退
    const fallback = new HeuristicAI();
    const action = fallback.getAction(engine, playerId);
    const e2eMs = Math.round(performance.now() - t0);
    const res: AiActionResult = {
        action,
        status: 'OK',
        latencyMs: e2eMs,
        e2eMs,
        source: 'HeuristicAI (Default Fallback)',
        requestedPolicy: policy,
        actualPolicy: 'heuristic',
        fallbackUsed: true,
        fallbackReason: `UNKNOWN_POLICY: ${policy}`,
        deadlineMiss: e2eMs > deadlineMs
    };
    options?.onTelemetry?.(res);
    return res;
}
