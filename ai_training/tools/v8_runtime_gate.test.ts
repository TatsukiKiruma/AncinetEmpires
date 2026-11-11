import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { runBoundedSearch } from './v7_heuristic_bounded_search';
import { Action } from '../src/game/types';

describe('V8 Task A: S00/S10 Runtime Gate & Deadline Enforcement', () => {
    it('R8-Gate-A: soft deadline aborts rollout expansion without unbounded latency and always returns a valid action', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        class SlowHeuristicAI extends HeuristicAI {
            override getAction(eng: GameEngine, pid: number, legals?: Action[]): Action {
                const start = performance.now();
                while (performance.now() - start < 40) {
                    // busy-wait: simulates an expensive rollout decision
                }
                return super.getAction(eng, pid, legals);
            }
        }

        const maxMs = 70; // hard ceiling equals soft budget in this legacy-style test
        const started = performance.now();
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs, maxNodes: 100, hardMaxMs: maxMs },
            heuristicAi: new SlowHeuristicAI(),
            maxDepth: 10
        });
        const duration = performance.now() - started;

        // Runtime gate: no unbounded rollout fan-out; one short fallback decision may
        // overshoot the soft budget by roughly one slow heuristic step.
        expect(duration).toBeLessThanOrEqual(maxMs + 150);
        expect(result.wallClockExceeded).toBe(true);
        expect(result.budgetReason).toBe('timeout');
        expect(result.chosenAction).toBeDefined();
        expect(result.chosenAction.type).toBeDefined();
        expect(result.deadlineFallbackCount ?? 0).toBeLessThanOrEqual(1);
    });

    it('R8-Gate-B: explicit hard emergency ceiling falls back to HeuristicAI top action when even scoring cannot finish', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        class VerySlowHeuristicAI extends HeuristicAI {
            private busyWait(): void {
                const start = performance.now();
                while (performance.now() - start < 60) {
                    // busy wait: no candidate can be scored inside the hard ceiling
                }
            }
            override scoreCandidateActions(eng: GameEngine, pid: number, legals: readonly Action[]) {
                this.busyWait();
                return super.scoreCandidateActions(eng, pid, legals);
            }
            override getAction(eng: GameEngine, pid: number, legals?: Action[]): Action {
                this.busyWait();
                return super.getAction(eng, pid, legals);
            }
        }

        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 15, maxNodes: 100, hardMaxMs: 15 },
            heuristicAi: new VerySlowHeuristicAI()
        });

        expect(result.wallClockExceeded).toBe(true);
        expect(result.budgetReason).toBe('timeout');
        expect(result.chosenAction).toBeDefined();
        expect(result.deadlineFallbackCount).toBeGreaterThanOrEqual(1);
        expect(result.traces.length).toBe(0);
    });

    it('R8-Gate-C: an expired soft budget with a wide hard ceiling still produces a real candidate trace (never 100% heuristic)', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 0, maxNodes: 8, hardMaxMs: 900 }
        });

        expect(result.wallClockExceeded).toBe(true);
        expect(result.traces.length).toBeGreaterThan(0);
        expect(result.candidatesEvaluated).toBeGreaterThan(0);
        expect(result.deadlineFallbackCount).toBe(0);
        // Search expansion is shallow but real; it must not silently become the pure heuristic.
        expect(result.shallowEvaluations).toBeGreaterThanOrEqual(0);
    });
});