import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { runBoundedSearch } from './v7_heuristic_bounded_search';
import { Action } from '../src/game/types';

describe('V8 Task A: S00/S10 Runtime Gate & Deadline Enforcement', () => {
    it('R8-Gate-A: runBoundedSearch strictly respects deadline inside rollout and records wallClockExceeded & deadlineFallbackCount', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        // Custom slow HeuristicAI that delays 40ms per decision
        class SlowHeuristicAI extends HeuristicAI {
            override getAction(eng: GameEngine, pid: number, legals?: Action[]): Action {
                const start = performance.now();
                while (performance.now() - start < 40) {
                    // busy-wait 40ms
                }
                return super.getAction(eng, pid, legals);
            }
        }

        const slowAi = new SlowHeuristicAI();
        const maxMs = 70; // deadline 70ms: 2 steps would be 80ms

        const t0 = performance.now();
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs, maxNodes: 100 },
            heuristicAi: slowAi,
            maxDepth: 10
        });
        const duration = performance.now() - t0;

        // 1. Must abort as soon as deadline expires, not run all rollout steps
        // Margin: 40ms (duration of 1 slow step) + 30ms scheduling
        expect(duration).toBeLessThanOrEqual(maxMs + 65);

        // 2. Must record wallClockExceeded = true and budgetReason = 'timeout'
        expect(result.wallClockExceeded).toBe(true);
        expect(result.budgetReason).toBe('timeout');

        // 3. Must record deadlineFallbackCount
        expect(typeof result.deadlineFallbackCount).toBe('number');
        expect(result.deadlineFallbackCount).toBeGreaterThanOrEqual(1);

        // 4. Must always return a valid chosen action
        expect(result.chosenAction).toBeDefined();
        expect(result.chosenAction.type).toBeDefined();
    });

    it('R8-Gate-B: Fallback to HeuristicAI top action when deadline expires before any candidate completes', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        class VerySlowHeuristicAI extends HeuristicAI {
            override getAction(eng: GameEngine, pid: number, legals?: Action[]): Action {
                const start = performance.now();
                while (performance.now() - start < 60) {
                    // busy wait 60ms
                }
                return super.getAction(eng, pid, legals);
            }
        }

        const verySlowAi = new VerySlowHeuristicAI();
        // Extremely tight deadline: 10ms (cannot even complete 1 step of candidate 0)
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 15, maxNodes: 100 },
            heuristicAi: verySlowAi
        });

        expect(result.wallClockExceeded).toBe(true);
        expect(result.budgetReason).toBe('timeout');
        expect(result.chosenAction).toBeDefined();
        // Since candidate 0 rollout was aborted before completion, it must have fallback recorded
        expect(result.deadlineFallbackCount).toBeGreaterThanOrEqual(1);
    });
});
