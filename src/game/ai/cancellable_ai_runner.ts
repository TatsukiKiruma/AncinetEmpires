/**
 * Cancellable AI Runner (V9)
 *
 * 核心保障：
 * 1. 真实端到端时钟度量 (包含 fallback 准备、状态序列化、编码、推理、搜索和返回全过程)；
 * 2. 外部主动取消保护：收到 AbortSignal 立即返回 status: 'CANCELLED'，严禁施加作废动作；
 * 3. 状态版本 (stateVersion) 保护：过期响应标记 status: 'STALE'，调用端拒绝落子；
 * 4. 硬看门狗超时熔断：超过 deadlineMs (默认 1000ms) 触发 TIMEOUT，诚实记录超时数字；
 * 5. 杜绝无意义前置开销：严禁在启动时钟前无条件计算昂贵启发式。
 */

import { GameEngine } from '../engine';
import type { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { getAiAction, type SupportedAiPolicy, type AiActionResult } from './neural_ai_adapter';

export interface WorkerLike {
    postMessage(message: any, transfer?: any[]): void;
    terminate(): void;
    onmessage?: ((ev: MessageEvent) => any) | null;
    onerror?: ((ev: any) => any) | null;
    addEventListener?(type: string, listener: any, options?: any): void;
    removeEventListener?(type: string, listener: any): void;
}

let defaultWorkerInstance: WorkerLike | null = null;

export function getDefaultWorker(): WorkerLike | null {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        if (!defaultWorkerInstance) {
            try {
                defaultWorkerInstance = new Worker(new URL('./ai_worker.ts', import.meta.url), { type: 'module' });
            } catch (err) {
                console.warn('[cancellable_ai_runner] Failed to instantiate Web Worker, falling back to main thread:', err);
                defaultWorkerInstance = null;
            }
        }
        return defaultWorkerInstance;
    }
    return null;
}

export function terminateDefaultWorker(): void {
    if (defaultWorkerInstance) {
        try {
            defaultWorkerInstance.terminate();
        } catch {}
        defaultWorkerInstance = null;
    }
}

export interface CancellableAiOptions {
    policy: SupportedAiPolicy;
    engine: GameEngine;
    playerId: number;
    deadlineMs?: number;
    signal?: AbortSignal;
    stateVersion?: number | string;
    getCurrentStateVersion?: () => number | string;
    allowInteractiveFallback?: boolean;
    workerFactory?: () => WorkerLike;
    _debugSimulateInfiniteLoop?: boolean;
    onTelemetry?: (telemetry: DecisionTelemetryEntry) => void;
}

export interface DecisionTelemetryEntry {
    timestamp: string;
    requestId: string;
    policy: SupportedAiPolicy;
    playerId: number;
    stateVersion: string;
    status: 'OK' | 'CANCELLED' | 'STALE' | 'TIMEOUT' | 'ERROR';
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
 * 运行可取消、带硬看门狗与版本保护的 AI 决策
 */
export async function runCancellableAiAction(
    options: CancellableAiOptions
): Promise<AiActionResult> {
    const t0 = performance.now();
    const deadlineMs = options.deadlineMs ?? 1000;
    const requestStateVersion = String(options.stateVersion ?? options.engine.getState().turn);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. 检查调用前是否已被外部取消
    if (options.signal?.aborted) {
        const e2eMs = Math.round(performance.now() - t0);
        let fallbackAction: Action = { type: 'end_turn' };
        if (options.allowInteractiveFallback) {
            try {
                fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
            } catch {
                fallbackAction = { type: 'end_turn' };
            }
        }
        const res: AiActionResult = {
            action: fallbackAction,
            status: 'CANCELLED',
            latencyMs: e2eMs,
            e2eMs,
            source: options.allowInteractiveFallback ? 'HeuristicAI (Pre-aborted Fallback)' : `${options.policy} (Pre-aborted)`,
            requestedPolicy: options.policy,
            actualPolicy: options.allowInteractiveFallback ? 'heuristic' : options.policy,
            fallbackUsed: true,
            fallbackReason: 'ABORTED_PRE_CALL',
            deadlineMiss: false
        };
        emitTelemetry(options, requestId, requestStateVersion, res);
        return res;
    }

    return new Promise<AiActionResult>((resolve) => {
        let isDone = false;
        let watchdogTimer: any = null;
        let currentWorker: WorkerLike | null = null;
        let isUsingDefaultWorker = false;

        const cleanupAndTerminateWorker = () => {
            if (currentWorker) {
                try {
                    currentWorker.terminate();
                } catch {}
                if (isUsingDefaultWorker) {
                    defaultWorkerInstance = null;
                }
                currentWorker = null;
            }
        };

        const complete = (result: AiActionResult) => {
            if (isDone) return;
            isDone = true;
            if (watchdogTimer) clearTimeout(watchdogTimer);

            if (options.signal?.aborted) {
                cleanupAndTerminateWorker();
                let fallbackAction: Action = { type: 'end_turn' };
                if (options.allowInteractiveFallback) {
                    try {
                        fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
                    } catch {
                        fallbackAction = { type: 'end_turn' };
                    }
                }
                result = {
                    ...result,
                    action: fallbackAction,
                    status: 'CANCELLED',
                    fallbackUsed: true,
                    fallbackReason: 'ABORTED_IN_FLIGHT',
                    source: options.allowInteractiveFallback ? 'HeuristicAI (Aborted In Flight)' : result.source
                };
            } else {
                // 检查调用方传入的 stateVersion 是否与当前最新引擎状态一致
                const latestVersion = options.getCurrentStateVersion
                    ? String(options.getCurrentStateVersion())
                    : String(options.engine.getState().turn);
                if (options.stateVersion !== undefined && String(options.stateVersion) !== latestVersion && result.status === 'OK') {
                    cleanupAndTerminateWorker();
                    result = {
                        ...result,
                        status: 'STALE',
                        fallbackReason: `STATE_VERSION_MISMATCH: expected ${options.stateVersion}, current ${latestVersion}`
                    };
                }
            }

            emitTelemetry(options, requestId, requestStateVersion, result);
            resolve(result);
        };

        // 2. 监听外部取消信号
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                cleanupAndTerminateWorker();
                const e2eMs = Math.round(performance.now() - t0);
                let fallbackAction: Action = { type: 'end_turn' };
                if (options.allowInteractiveFallback) {
                    try {
                        fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
                    } catch {
                        fallbackAction = { type: 'end_turn' };
                    }
                }
                complete({
                    action: fallbackAction,
                    status: 'CANCELLED',
                    latencyMs: e2eMs,
                    e2eMs,
                    source: options.allowInteractiveFallback ? 'HeuristicAI (Aborted In Flight)' : `${options.policy} (Aborted In Flight)`,
                    requestedPolicy: options.policy,
                    actualPolicy: options.allowInteractiveFallback ? 'heuristic' : options.policy,
                    fallbackUsed: true,
                    fallbackReason: 'ABORTED_IN_FLIGHT',
                    deadlineMiss: e2eMs > deadlineMs
                });
            }, { once: true });
        }

        // 3. 设定硬看门狗定时器 (deadlineMs)：即使 Worker 陷入死循环也执行硬 terminate 恢复
        watchdogTimer = setTimeout(() => {
            cleanupAndTerminateWorker();

            const e2eMs = Math.round(performance.now() - t0);
            let fallbackAction: Action = { type: 'end_turn' };
            if (options.allowInteractiveFallback) {
                try {
                    fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
                } catch {
                    fallbackAction = { type: 'end_turn' };
                }
            }

            complete({
                action: fallbackAction,
                status: 'TIMEOUT',
                latencyMs: e2eMs,
                e2eMs,
                source: `${options.policy} (Watchdog Hard Timeout)`,
                requestedPolicy: options.policy,
                actualPolicy: options.allowInteractiveFallback ? 'heuristic' : options.policy,
                fallbackUsed: true,
                fallbackReason: 'WATCHDOG_DEADLINE_EXCEEDED',
                deadlineMiss: true
            });
        }, deadlineMs);

        // 4. 优先分配至 Web Worker 线程执行；Node/Vitest 或环境不支持时同构降级
        const worker = options.workerFactory ? options.workerFactory() : getDefaultWorker();
        if (worker) {
            currentWorker = worker;
            isUsingDefaultWorker = !options.workerFactory;

            const handleMessage = (ev: MessageEvent) => {
                const data = ev.data;
                if (!data || data.requestId !== requestId) return;

                const e2eMs = Math.round(performance.now() - t0);
                if (data.error) {
                    let fallbackAction: Action = { type: 'end_turn' };
                    if (options.allowInteractiveFallback) {
                        try {
                            fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
                        } catch {
                            fallbackAction = { type: 'end_turn' };
                        }
                    }
                    complete({
                        action: fallbackAction,
                        status: 'ERROR',
                        latencyMs: e2eMs,
                        e2eMs,
                        source: `${options.policy} (Worker Exception)`,
                        requestedPolicy: options.policy,
                        actualPolicy: options.allowInteractiveFallback ? 'heuristic' : options.policy,
                        fallbackUsed: true,
                        fallbackReason: `WORKER_ERROR: ${data.error}`,
                        deadlineMiss: e2eMs > deadlineMs
                    });
                } else if (data.result) {
                    complete({
                        ...data.result,
                        e2eMs,
                        deadlineMiss: e2eMs > deadlineMs
                    });
                }
            };

            const handleError = (ev: any) => {
                cleanupAndTerminateWorker();
                const e2eMs = Math.round(performance.now() - t0);
                complete({
                    action: { type: 'end_turn' },
                    status: 'ERROR',
                    latencyMs: e2eMs,
                    e2eMs,
                    source: `${options.policy} (Worker Error Event)`,
                    requestedPolicy: options.policy,
                    actualPolicy: options.policy,
                    fallbackUsed: true,
                    fallbackReason: `WORKER_ERROR_EVENT: ${ev?.message ?? String(ev)}`,
                    deadlineMiss: e2eMs > deadlineMs
                });
            };

            if (typeof currentWorker.addEventListener === 'function') {
                currentWorker.addEventListener('message', handleMessage);
                currentWorker.addEventListener('error', handleError);
            } else {
                currentWorker.onmessage = handleMessage;
                currentWorker.onerror = handleError;
            }

            try {
                currentWorker.postMessage({
                    requestId,
                    policy: options.policy,
                    state: options.engine.getState(),
                    playerId: options.playerId,
                    deadlineMs,
                    stateVersion: requestStateVersion,
                    _debugSimulateInfiniteLoop: options._debugSimulateInfiniteLoop
                });
            } catch (err: any) {
                cleanupAndTerminateWorker();
                runSyncFallback();
            }
        } else {
            runSyncFallback();
        }

        function runSyncFallback() {
            setTimeout(() => {
                if (isDone) return;
                try {
                    const res = getAiAction(options.policy, options.engine, options.playerId, {
                        deadlineMs,
                        signal: options.signal,
                        allowInteractiveFallback: options.allowInteractiveFallback
                    });
                    complete(res);
                } catch (err: any) {
                    const e2eMs = Math.round(performance.now() - t0);
                    let fallbackAction: Action = { type: 'end_turn' };
                    if (options.allowInteractiveFallback) {
                        try {
                            fallbackAction = new HeuristicAI().getAction(options.engine, options.playerId);
                        } catch {
                            fallbackAction = { type: 'end_turn' };
                        }
                    }
                    complete({
                        action: fallbackAction,
                        status: 'ERROR',
                        latencyMs: e2eMs,
                        e2eMs,
                        source: `${options.policy} (Exception Catch)`,
                        requestedPolicy: options.policy,
                        actualPolicy: options.allowInteractiveFallback ? 'heuristic' : options.policy,
                        fallbackUsed: true,
                        fallbackReason: `EXCEPTION: ${err?.message ?? String(err)}`,
                        deadlineMiss: e2eMs > deadlineMs
                    });
                }
            }, 0);
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
        status: result.status ?? 'OK',
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
