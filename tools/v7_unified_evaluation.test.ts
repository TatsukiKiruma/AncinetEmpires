import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { runBenchmarkMatch, PolicyAgent, BENCHMARK_MAPS } from './v7_unified_evaluation';

describe('V7 Unified Benchmark Evaluation (R7-08)', () => {
    it('runs a fast benchmark match and produces strict null rehireRate when opportunities are 0', () => {
        // Scratch trajectory output goes to the platform temp directory, never into a run directory.
        const testDir = mkdtempSync(path.join(os.tmpdir(), 'v7_eval_'));
        const agent = new PolicyAgent('HEURISTIC');
        const outcome = runBenchmarkMatch(BENCHMARK_MAPS[0].name, agent, 0, 42, 6, 1000, { runDir: testDir });

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

        // Check termination reason is valid (ENGINE_ERROR is strictly rejected)
        expect(outcome.terminationReason).not.toBe('ENGINE_ERROR');
        expect(['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW', 'TRUNCATION_MAX_TURNS', 'TRUNCATION_MAX_STEPS', 'TRUNCATION_STEP_LIMIT'])
            .toContain(outcome.terminationReason);

        try { rmSync(testDir, { recursive: true, force: true }); } catch {}
    }, 30000);
});
