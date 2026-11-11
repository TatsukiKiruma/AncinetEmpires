import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action } from '../src/game/types';
import { runBoundedSearch, selectHeuristicTopAction } from './v7_heuristic_bounded_search';

function freshEngine(): GameEngine {
    return new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem', 'SD'));
}

describe('V8 Task C: Search Fallback Reduction & Fixed Node Budget', () => {
    it('R8-Fallback-A: a tight soft deadline still evaluates at least one candidate (never 100% heuristic fallback)', () => {
        const engine = freshEngine();
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 0, maxNodes: 5, hardMaxMs: 900 }
        });

        expect(result.chosenAction).toBeDefined();
        expect(result.traces.length).toBeGreaterThan(0);
        expect(result.candidatesEvaluated ?? 0).toBeGreaterThan(0);
        expect(result.deadlineFallbackCount).toBe(0);
        expect(result.wallClockExceeded).toBe(true);
    });

    it('R8-Fallback-B: fixed node budget is respected and still yields a real searched candidate', () => {
        const engine = freshEngine();
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 5000, maxNodes: 1, hardMaxMs: 5000 }
        });

        expect(result.totalNodes).toBeLessThanOrEqual(1);
        expect(result.traces.length).toBeGreaterThan(0);
        expect(result.candidatesEvaluated ?? 0).toBeGreaterThan(0);
        expect(result.deadlineFallbackCount).toBe(0);
        expect(result.chosenAction).toBeDefined();
    });

    it('R8-Fallback-C: hard deadline still permits an explicit emergency fallback to the heuristic top action', () => {
        class VerySlowHeuristicAI extends HeuristicAI {
            private busyWait(): void {
                const start = performance.now();
                while (performance.now() - start < 60) {
                    // busy wait: simulate a pathologically slow fallback and scoring policy
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

        const engine = freshEngine();
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 15, hardMaxMs: 15 },
            heuristicAi: new VerySlowHeuristicAI()
        });

        expect(result.chosenAction).toBeDefined();
        expect(result.deadlineFallbackCount).toBeGreaterThanOrEqual(1);
    });

    it('R8-Fallback-D: precomputed top action selection matches HeuristicAI.getAction exactly', () => {
        const engine = freshEngine();
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');
        const fixedRng = () => 0.5;
        const scoringHeuristic = new HeuristicAI(fixedRng);
        const directHeuristic = new HeuristicAI(fixedRng);
        const scored = scoringHeuristic.scoreCandidateActions(engine, 0, legal);
        const selected = selectHeuristicTopAction(scored, legal);
        const direct = directHeuristic.getAction(engine, 0, legal);
        expect(selected).toEqual(direct);
    });
});