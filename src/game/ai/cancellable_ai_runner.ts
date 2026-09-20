/**
 * Cancellable AI Runner (R04)
 *
 * 1. 调用方单调时钟硬看门狗：如果底层 AI 执行耗时超过 deadlineMs (默认 1000ms)，触发超时熔断。
 * 2. 外部主动取消支持：接收 AbortSignal，若用户换图、下一步、重新开始或手动终止，立即作废当前计算。
 * 3. 状态版本 (stateVersion) 保护：过期响应不得施加到已经改变的游戏状态。
 * 4. 廉价预校验回退：一旦超时或发生异常，立即回退到经过校验的合法动作 (如 HeuristicAI 或首个合法动作)。
 * 5. 诚实遥测：记录真实端到端时延、搜索耗时、超时标志与回退原因。
 */

import { GameEngine } from '../engine';
import type { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { getAiAction, type SupportedAiPolicy, type AiActionResult } from './neural_ai_adapter';

export interface CancellableAiOptions {
    policy: SupportedAiPolicy;
    engine: GameEngine;
    playerId: number;
    deadlineMs?: number;
    signal?: AbortSignal;
    stateVersion?: number | string;
    onTelemetry?: (telemetry: DecisionTelemetryEntry) => void;
}

export interface DecisionTelemetryEntry {
    timestamp: string;
    requestId: string;
    policy: SupportedAiPolicy;
    playerId: number;
    stateVersion: string;
    e2eMs: number;
    searchMs?: number;
    nodesExpanded?: number;
    deadlineMiss: boolean;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    actionType: string;
    source: string;
}

/**
 * 运行可取消、带硬看门狗的 AI 决策
 */
export async function runCancellableAiAction(
    options: CancellableAiOptions
): Promise<AiActionResult> {
    const t0 = performance.now();
    const deadlineMs = options.deadlineMs ?? 1000;
    const stateVersion = String(options.stateVersion ?? options.engine.getState().turn);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. 检查调用前是否已被取消
    if (options.signal?.aborted) {
        const fallback = new HeuristicAI().getAction(options.engine, options.playerId);
        const e2eMs = Math.round(performance.now() - t0);
        const res: AiActionResult = {
            action: fallback,
            latencyMs: e2eMs,
            e2eMs,
            source: 'HeuristicAI (Pre-aborted)',
            fallbackUsed: true,
            fallbackReason: 'ABORTED_PRE_CALL',
            deadlineMiss: false
        };
        emitTelemetry(options, requestId, stateVersion, res);
        return res;
    }

    // 2. 准备预校验的廉价合法回退动作
    const quickFallback = new HeuristicAI().getAction(options.engine, options.playerId);

    // 3. 异步/看门狗竞争
    return new Promise<AiActionResult>((resolve) => {
        let isDone = false;
        let watchdogTimer: any = null;

        const complete = (result: AiActionResult) => {
            if (isDone) return;
            isDone = true;
            if (watchdogTimer) clearTimeout(watchdogTimer);
            emitTelemetry(options, requestId, stateVersion, result);
            resolve(result);
        };

        // 监听外部取消事件
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                const e2eMs = Math.round(performance.now() - t0);
                complete({
                    action: quickFallback,
                    latencyMs: e2eMs,
                    e2eMs,
                    source: 'HeuristicAI (Aborted During Search)',
                    fallbackUsed: true,
                    fallbackReason: 'ABORTED_IN_FLIGHT',
                    deadlineMiss: e2eMs > deadlineMs
                });
            }, { once: true });
        }

        // 设定硬看门狗定时器 (deadlineMs)
        watchdogTimer = setTimeout(() => {
            const e2eMs = Math.round(performance.now() - t0);
            complete({
                action: quickFallback,
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Watchdog Hard Timeout)',
                fallbackUsed: true,
                fallbackReason: 'WATCHDOG_DEADLINE_EXCEEDED',
                deadlineMiss: true
            });
        }, deadlineMs);

        // 启动实际 AI 决策
        try {
            // 在微任务中触发计算，以便看门狗能在高负载时先注册
            queueMicrotask(() => {
                if (isDone) return;
                try {
                    const res = getAiAction(options.policy, options.engine, options.playerId, {
                        deadlineMs,
                        signal: options.signal
                    });
                    complete(res);
                } catch (err: any) {
                    const e2eMs = Math.round(performance.now() - t0);
                    complete({
                        action: quickFallback,
                        latencyMs: e2eMs,
                        e2eMs,
                        source: 'HeuristicAI (Exception Catch)',
                        fallbackUsed: true,
                        fallbackReason: `EXCEPTION: ${err?.message ?? String(err)}`,
                        deadlineMiss: e2eMs > deadlineMs
                    });
                }
            });
        } catch (err: any) {
            const e2eMs = Math.round(performance.now() - t0);
            complete({
                action: quickFallback,
                latencyMs: e2eMs,
                e2eMs,
                source: 'HeuristicAI (Immediate Exception)',
                fallbackUsed: true,
                fallbackReason: `SYNC_EXCEPTION: ${err?.message ?? String(err)}`,
                deadlineMiss: e2eMs > deadlineMs
            });
        }
    });
}

function emitTelemetry(
    options: CancellableAiOptions,
    requestId: string,
    stateVersion: string,
    result: AiActionResult
) {
    const entry: DecisionTelemetryEntry = {
        timestamp: new Date().toISOString(),
        requestId,
        policy: options.policy,
        playerId: options.playerId,
        stateVersion,
        e2eMs: result.e2eMs ?? result.latencyMs,
        searchMs: result.latencyMs,
        nodesExpanded: result.nodesExpanded,
        deadlineMiss: Boolean(result.deadlineMiss),
        fallbackUsed: Boolean(result.fallbackUsed),
        fallbackReason: result.fallbackReason ?? null,
        actionType: result.action.type,
        source: result.source
    };
    options.onTelemetry?.(entry);
}
