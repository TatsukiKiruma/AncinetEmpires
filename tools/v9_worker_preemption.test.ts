import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { runCancellableAiAction, type WorkerLike } from '../src/game/ai/cancellable_ai_runner';

describe('V9-02: Web Worker Hard Preemption and Watchdog Termination', () => {
    it('V9-02-A: Watchdog terminates unresponsive worker on deadline and returns safe fallback within 1s', async () => {
        const engine = new GameEngine(createDefaultAppGameState());
        let terminateCalled = false;
        let postMessageCalled = false;

        // Mock a worker that never replies (simulating an infinite loop or hang)
        const mockWorker: WorkerLike = {
            postMessage: vi.fn((_msg) => {
                postMessageCalled = true;
                // Intentionally do nothing / hang, simulating busy loop in background
            }),
            terminate: vi.fn(() => {
                terminateCalled = true;
            }),
            onmessage: null,
            onerror: null
        };

        const t0 = performance.now();
        const deadlineMs = 150; // Short deadline for automated test

        const result = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: 0,
            deadlineMs,
            allowInteractiveFallback: true,
            workerFactory: () => mockWorker,
            _debugSimulateInfiniteLoop: true
        });

        const elapsed = performance.now() - t0;

        expect(postMessageCalled).toBe(true);
        expect(terminateCalled).toBe(true);
        expect(result.status).toBe('TIMEOUT');
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackReason).toBe('WATCHDOG_DEADLINE_EXCEEDED');
        expect(result.action).toBeDefined();
        // Guaranteed to recover promptly and within budget
        expect(elapsed).toBeGreaterThanOrEqual(140);
        expect(elapsed).toBeLessThan(1000);
    });

    it('V9-02-B: State version mismatch marks in-flight worker result as STALE and terminates worker', async () => {
        const engine = new GameEngine(createDefaultAppGameState());
        let terminateCalled = false;

        const mockWorker: WorkerLike = {
            postMessage: vi.fn((msg) => {
                setTimeout(() => {
                    if (mockWorker.onmessage) {
                        mockWorker.onmessage({
                            data: {
                                requestId: msg.requestId,
                                stateVersion: msg.stateVersion,
                                result: {
                                    action: { type: 'end_turn' },
                                    status: 'OK',
                                    latencyMs: 10,
                                    source: 'test'
                                }
                            }
                        } as any);
                    }
                }, 20);
            }),
            terminate: vi.fn(() => {
                terminateCalled = true;
            }),
            onmessage: null,
            onerror: null
        };

        let currentTurn = 1;

        const result = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: 0,
            deadlineMs: 500,
            stateVersion: '1',
            getCurrentStateVersion: () => String(currentTurn),
            workerFactory: () => mockWorker
        });

        expect(result.status).toBe('OK');

        // Now test when state changes in-flight
        currentTurn = 2; // Engine state advanced
        const staleResult = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: 0,
            deadlineMs: 500,
            stateVersion: '1', // Request was for turn 1
            getCurrentStateVersion: () => String(currentTurn), // Latest turn is 2
            workerFactory: () => mockWorker
        });

        expect(staleResult.status).toBe('STALE');
        expect(staleResult.fallbackReason).toContain('STATE_VERSION_MISMATCH');
        expect(terminateCalled).toBe(true);
    });

    it('V9-02-C: AbortSignal in flight terminates worker and resolves with CANCELLED', async () => {
        const engine = new GameEngine(createDefaultAppGameState());
        let terminateCalled = false;

        const mockWorker: WorkerLike = {
            postMessage: vi.fn(() => {
                // Background worker computing...
            }),
            terminate: vi.fn(() => {
                terminateCalled = true;
            }),
            onmessage: null,
            onerror: null
        };

        const controller = new AbortController();

        setTimeout(() => {
            controller.abort();
        }, 30);

        const result = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: 0,
            deadlineMs: 1000,
            signal: controller.signal,
            workerFactory: () => mockWorker
        });

        expect(result.status).toBe('CANCELLED');
        expect(terminateCalled).toBe(true);
        expect(result.fallbackReason).toBe('ABORTED_IN_FLIGHT');
    });

    it('V9-02-D: Successful worker computation returns OK without fallback', async () => {
        const engine = new GameEngine(createDefaultAppGameState());

        const mockWorker: WorkerLike = {
            postMessage: vi.fn((msg) => {
                setTimeout(() => {
                    if (mockWorker.onmessage) {
                        mockWorker.onmessage({
                            data: {
                                requestId: msg.requestId,
                                stateVersion: msg.stateVersion,
                                result: {
                                    action: { type: 'end_turn' },
                                    status: 'OK',
                                    latencyMs: 15,
                                    source: 'mock_worker',
                                    requestedPolicy: 'heuristic',
                                    actualPolicy: 'heuristic',
                                    fallbackUsed: false,
                                    fallbackReason: null,
                                    deadlineMiss: false
                                }
                            }
                        } as any);
                    }
                }, 10);
            }),
            terminate: vi.fn(),
            onmessage: null,
            onerror: null
        };

        const result = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: 0,
            deadlineMs: 500,
            stateVersion: '1',
            workerFactory: () => mockWorker
        });

        expect(result.status).toBe('OK');
        expect(result.fallbackUsed).toBe(false);
        expect(result.source).toBe('mock_worker');
    });
});
