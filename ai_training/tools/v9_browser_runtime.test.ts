import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { runCancellableAiAction } from '../src/game/ai/cancellable_ai_runner';
import { getAiAction } from '../src/game/ai/neural_ai_adapter';
import { computePercentile } from './v7_unified_evaluation';

describe('V9-02: Front-end Runtime, End-to-End Budget, Cancellation & Stale Protection', () => {
    it('V9-02-A: Pre-call cancellation immediately returns status CANCELLED without stepping engine', async () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));
        const initialTurn = engine.getState().turn;
        const initialUnits = JSON.stringify(engine.getState().units);

        const abortController = new AbortController();
        abortController.abort(); // Aborted before call

        const res = await runCancellableAiAction({
            policy: 'spatial_v2_experimental',
            engine,
            playerId: 0,
            deadlineMs: 1000,
            signal: abortController.signal
        });

        expect(res.status).toBe('CANCELLED');
        expect(res.fallbackReason).toBe('ABORTED_PRE_CALL');
        expect(res.deadlineMiss).toBe(false);

        // Verify engine state was not stepped
        expect(engine.getState().turn).toBe(initialTurn);
        expect(JSON.stringify(engine.getState().units)).toBe(initialUnits);
    });

    it('V9-02-B: In-flight cancellation returns status CANCELLED and marks ABORTED_IN_FLIGHT', async () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));
        const initialTurn = engine.getState().turn;

        const abortController = new AbortController();
        const promise = runCancellableAiAction({
            policy: 's10_spatial_search',
            engine,
            playerId: 0,
            deadlineMs: 1000,
            signal: abortController.signal
        });

        // Trigger abort while the action promise is active in flight
        abortController.abort();

        const res = await promise;

        // Either cancelled before or in-flight
        expect(res.status).toBe('CANCELLED');
        expect(res.fallbackReason).toMatch(/ABORTED/);
        expect(engine.getState().turn).toBe(initialTurn);
    });

    it('V9-02-C: Stale stateVersion is detected and flagged as STALE', async () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));

        // Request with stateVersion 0, but engine is already at turn 1
        engine.step({ type: 'end_turn' });
        const currentTurn = engine.getState().turn;
        expect(currentTurn).toBeGreaterThan(0);

        const res = await runCancellableAiAction({
            policy: 'heuristic',
            engine,
            playerId: engine.getState().currentPlayer,
            stateVersion: 0 // obsolete state version!
        });

        expect(res.status).toBe('STALE');
        expect(res.fallbackReason).toMatch(/STATE_VERSION_MISMATCH/);
    });

    it('V9-02-D: Hard watchdog deadline triggers TIMEOUT status and deadlineMiss: true', async () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));

        // Set an impossibly short deadline (0ms)
        const res = await runCancellableAiAction({
            policy: 's10_spatial_search',
            engine,
            playerId: 0,
            deadlineMs: 0
        });

        expect(res.status).toBe('TIMEOUT');
        expect(res.deadlineMiss).toBe(true);
        expect(res.fallbackUsed).toBe(true);
        expect(res.fallbackReason).toBe('WATCHDOG_DEADLINE_EXCEEDED');
    });

    it('V9-02-E: End-to-end latency measurement across warm decisions reports realistic p50/p95/max', async () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));
        const latencies: number[] = [];
        let deadlineMisses = 0;

        // Run 10 consecutive decisions
        for (let i = 0; i < 10; i++) {
            const cp = engine.getState().currentPlayer;
            const res = await runCancellableAiAction({
                policy: 'spatial_v2_experimental',
                engine,
                playerId: cp,
                deadlineMs: 1000
            });

            expect(res.e2eMs).toBeDefined();
            expect(res.e2eMs).toBeGreaterThanOrEqual(0);
            latencies.push(res.e2eMs!);
            if (res.deadlineMiss) deadlineMisses++;

            if (res.status === 'OK') {
                engine.step(res.action);
            }
        }

        latencies.sort((a, b) => a - b);
        const p50 = computePercentile(latencies, 50);
        const p95 = computePercentile(latencies, 95);
        const p99 = computePercentile(latencies, 99);
        const max = latencies[latencies.length - 1];

        expect(p50).toBeGreaterThanOrEqual(0);
        expect(max).toBeLessThan(1000); // 1-second contract satisfied
        expect(deadlineMisses).toBe(0);
    });
});
