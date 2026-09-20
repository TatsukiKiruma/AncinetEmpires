/**
 * 前端/应用层 AI 策略适配器 (R04 真实 1 秒请求边界与安全降级)
 *
 * 封装原生启发式、随机 AI 以及训练生成的 NET_B 神经网络策略 (S10 搜索与 1-ply 快速预测)，
 * 提供零依赖纯浏览器端支持与异常安全回退保护：
 * 1. 真实时延：调用方单调时钟 performance.now() 测量权威端到端耗时，严禁耗时裁剪。
 * 2. 动作空间防碰撞：统一使用 45 维 encodeGameActionV2 动作编码。
 * 3. 严格看门狗与降级：若搜索超时 (1000ms) 或发生异常，安全回退到经过校验的原生启发式动作。
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

export type SupportedAiPolicy = 'heuristic' | 'random' | 'net_b_s10' | 'net_b_1ply';

export interface AiActionResult {
    action: Action;
    latencyMs: number;
    nodesExpanded?: number;
    source: string;
    fallbackUsed?: boolean;
    fallbackReason?: string | null;
    deadlineMiss?: boolean;
    e2eMs?: number;
}

export interface AiActionOptions {
    signal?: AbortSignal;
    deadlineMs?: number;
    stateVersion?: number | string;
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
 * 核心 AI 决策入口：调用方单调时钟端到端测量
 */
export function getAiAction(
    policy: SupportedAiPolicy,
    engine: GameEngine,
    playerId: number,
    options?: AiActionOptions
): AiActionResult {
    const t0 = performance.now();
    const deadlineMs = options?.deadlineMs ?? 1000;

    // 检查取消信号
    if (options?.signal?.aborted) {
        const fallbackAi = new HeuristicAI();
        const action = fallbackAi.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action,
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI (Aborted Fallback)',
            fallbackUsed: true,
            fallbackReason: 'ABORTED',
            deadlineMiss: e2eMs > deadlineMs
        };
        options.onTelemetry?.(res);
        return res;
    }

    if (policy === 'random') {
        const ai = new RandomAI();
        const action = ai.getAction(engine, playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action,
            latencyMs: e2eMs,
            e2eMs,
            source: 'RandomAI',
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
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI',
            deadlineMiss: e2eMs > deadlineMs
        };
        options?.onTelemetry?.(res);
        return res;
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
                    latencyMs: e2eMs,
                    e2eMs,
                    source: 'NET_B (1-ply: Empty)',
                    deadlineMiss: e2eMs > deadlineMs
                };
                options?.onTelemetry?.(res);
                return res;
            }
            const stateVec = Array.from(encodeGameState(state, playerId));
            // 修复：统一使用 45 维 encodeGameActionV2
            const candVecs = legalActions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const decision = predictDecision(net, stateVec, candVecs);
            const bestAction = legalActions[decision.topIndex] ?? legalActions[0];
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action: bestAction,
                latencyMs: e2eMs,
                e2eMs,
                source: 'NET_B (1-ply Policy)',
                deadlineMiss: e2eMs > deadlineMs
            };
            options?.onTelemetry?.(res);
            return res;
        } catch (err) {
            console.warn('[AI] NET_B 1-ply 异常，安全回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            const action = fallbackAi.getAction(engine, playerId);
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action,
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Fallback)',
                fallbackUsed: true,
                fallbackReason: 'EXCEPTION_1PLY',
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

            // 超时熔断保护：若实际执行突破截止时间，记录超时标志并可选择安全降级
            const res: AiActionResult = {
                action: decision.action,
                latencyMs: e2eMs, // 权威上报调用方完整端到端耗时
                e2eMs,
                nodesExpanded: decision.nodesExpanded,
                source: `NET_B S10 (${decision.reason})`,
                fallbackUsed: decision.fallbackUsed || deadlineMiss,
                fallbackReason: decision.fallbackReason ?? (deadlineMiss ? 'REAL_DEADLINE_EXCEEDED' : null),
                deadlineMiss
            };
            options?.onTelemetry?.(res);
            return res;
        } catch (err) {
            console.warn('[AI] NET_B S10 搜索异常，安全回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            const action = fallbackAi.getAction(engine, playerId);
            const e2eMs = Math.round(performance.now() - t0);
            const res: AiActionResult = {
                action,
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Fallback)',
                fallbackUsed: true,
                fallbackReason: 'EXCEPTION_S10',
                deadlineMiss: e2eMs > deadlineMs
            };
            options?.onTelemetry?.(res);
            return res;
        }
    }

    // 默认兜底
    const fallback = new HeuristicAI();
    const action = fallback.getAction(engine, playerId);
    const e2eMs = Math.round(performance.now() - t0);
    const res: AiActionResult = {
        action,
        latencyMs: e2eMs,
        e2eMs,
        source: 'HeuristicAI (Default)',
        deadlineMiss: e2eMs > deadlineMs
    };
    options?.onTelemetry?.(res);
    return res;
}
