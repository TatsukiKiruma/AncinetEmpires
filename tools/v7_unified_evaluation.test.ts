import { describe, it, expect } from 'vitest';
import { runBenchmarkMatch, PolicyAgent, BENCHMARK_MAPS } from './v7_unified_evaluation';

describe('V7 Unified Benchmark Evaluation (R7-08)', () => {
    it('runs a fast benchmark match and produces strict null rehireRate when opportunities are 0', () => {
        const agent = new PolicyAgent('HEURISTIC');
        const outcome = runBenchmarkMatch(BENCHMARK_MAPS[0].name, agent, 0, 42, 6);

        expect(outcome.matchId).toBeDefined();
        expect(outcome.steps).toBeGreaterThan(0);
        expect(outcome.turns).toBeGreaterThan(0);
        expect(outcome.candidatePolicy).toBe('HEURISTIC');

        // Check rehire calculation
        if (outcome.rehireOpportunities === 0) {
            expect(outcome.rehireRate).toBeNull();
        } else {
            expect(typeof outcome.rehireRate).toBe('number');
        }

        // Check termination reason is valid
        expect(['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW', 'TRUNCATION_STEP_LIMIT', 'TRUNCATION_STAGNATION', 'ENGINE_ERROR'])
            .toContain(outcome.terminationReason);
    });
});
