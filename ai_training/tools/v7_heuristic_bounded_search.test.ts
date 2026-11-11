import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import {
    evaluatePositionHeuristic,
    runBoundedSearch,
    getFilteredCandidateActions
} from './v7_heuristic_bounded_search';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

describe('V7 Bounded Search Teacher (R7-05 & R7-06)', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    it('evaluates position heuristically with natural terminal dominance and no pseudo value', () => {
        const state = createDemoState(rules);
        const score0 = evaluatePositionHeuristic(state, 0);
        const score1 = evaluatePositionHeuristic(state, 1);

        // Symmetric starting state should yield approximately opposite scores
        expect(typeof score0).toBe('number');
        expect(typeof score1).toBe('number');
        expect(score0).toBeCloseTo(-score1, 0);

        // Natural win terminal state gives +100000
        const winState = createDemoState(rules);
        winState.winner = 0;
        expect(evaluatePositionHeuristic(winState, 0)).toBe(100000);
        expect(evaluatePositionHeuristic(winState, 1)).toBe(-100000);
    });

    it('generates candidate actions including HeuristicAI choice and filters duplicates', () => {
        const state = createDemoState(rules);
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();

        const candidates = getFilteredCandidateActions(engine, 0, heuristicAi);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.length).toBeLessThanOrEqual(12);

        // Verify heuristic top action is included
        const heuristicTop = heuristicAi.getAction(engine, 0);
        const hasTop = candidates.some(c => JSON.stringify(c) === JSON.stringify(heuristicTop));
        expect(hasTop).toBe(true);
    });

    it('executes bounded search within time and node budget under 1000ms', () => {
        const state = createDemoState(rules);
        const engine = new GameEngine(state);

        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 500, maxNodes: 30 }
        });

        expect(result.chosenAction).toBeDefined();
        expect(result.chosenActionCode).toBeDefined();
        expect(result.totalNodes).toBeGreaterThan(0);
        expect(result.totalNodes).toBeLessThanOrEqual(35);
        expect(result.elapsedMs).toBeLessThan(1000);
        expect(result.traces.length).toBeGreaterThan(0);
    });
});
