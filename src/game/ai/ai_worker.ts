/**
 * Web Worker for Off-Main-Thread AI Decision Computing
 *
 * Runs heavy AI search and neural inference in an isolated background thread
 * so that the main browser thread remains 100% responsive, and the watchdog
 * timer can truly preempt or cancel tasks by terminating the worker.
 */

import { GameEngine } from '../engine';
import { getAiAction, type SupportedAiPolicy, type AiActionResult } from './neural_ai_adapter';

export interface WorkerAiRequest {
    requestId: string;
    policy: SupportedAiPolicy;
    state: any;
    playerId: number;
    deadlineMs?: number;
    stateVersion?: string;
    _debugSimulateInfiniteLoop?: boolean;
}

export interface WorkerAiResponse {
    requestId: string;
    stateVersion?: string;
    result?: AiActionResult;
    error?: string;
}

if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
    self.addEventListener('message', (event: MessageEvent<WorkerAiRequest>) => {
        const { requestId, policy, state, playerId, deadlineMs, stateVersion, _debugSimulateInfiniteLoop } = event.data;

        if (_debugSimulateInfiniteLoop) {
            // Intentional infinite busy loop for preemption testing
            while (true) {}
        }

        try {
            const engine = new GameEngine(state);
            const result = getAiAction(policy, engine, playerId, {
                deadlineMs: deadlineMs ?? 1000
            });
            const response: WorkerAiResponse = {
                requestId,
                stateVersion,
                result
            };
            self.postMessage(response);
        } catch (err: any) {
            const response: WorkerAiResponse = {
                requestId,
                stateVersion,
                error: err?.message ?? String(err)
            };
            self.postMessage(response);
        }
    });
}
