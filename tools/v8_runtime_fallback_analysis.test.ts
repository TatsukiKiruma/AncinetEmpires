import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { computePercentile, computeWilsonScoreInterval } from './v7_unified_evaluation';
import {
    RUNTIME_FALLBACK_GATE,
    SEARCH_POLICIES,
    buildRuntimeFallbackAnalysis
} from './v8_runtime_fallback_benchmark';

/**
 * R8-08: the closure_02 runtime fallback re-measurement must be internally consistent with its own
 * benchmark JSON, must keep decision latency under the hard ceiling, and must state an explicit
 * pass/fail verdict for the hard fallback rate.
 */

const REPO_ROOT = path.resolve(process.cwd());
const REPORT_RUN_ID = 'agent_upgrade_20260921_v8_closure_02';
const REPORT_DIR = path.join(REPO_ROOT, 'docs/training/reports', REPORT_RUN_ID);
const ANALYSIS_PATH = path.join(REPORT_DIR, 'runtime_fallback_analysis.json');
const BENCHMARK_PATH = path.join(REPORT_DIR, 'v8_runtime_fallback_benchmark.json');

describe('R8-08 bounded-search runtime fallback re-measurement', () => {
    it('R8-08-A: the re-measurement exists and covers the bounded-search policies', () => {
        expect(existsSync(ANALYSIS_PATH)).toBe(true);
        expect(existsSync(BENCHMARK_PATH)).toBe(true);

        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
        expect(analysis.runId).toBe(REPORT_RUN_ID);
        // Paths inside the analysis are repo-relative so the artifact stays valid in any checkout.
        expect(analysis.benchmarkPath).toBe(path.relative(REPO_ROOT, BENCHMARK_PATH).replace(/\\/g, '/'));
        expect(analysis.policies.map((p: any) => p.policy).sort()).toEqual(
            ['HEURISTIC', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'].sort()
        );
        for (const policy of analysis.policies) {
            expect(policy.totalCandidateDecisions).toBeGreaterThan(0);
        }
    });

    it('R8-08-B: every analysis number reproduces from the benchmark outcomes', () => {
        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
        const benchmark = JSON.parse(readFileSync(BENCHMARK_PATH, 'utf8'));

        expect(analysis.benchmarkRunId).toBe(benchmark.runId);

        for (const policy of analysis.policies) {
            const outcomes = benchmark.outcomes.filter((o: any) => o.candidatePolicy === policy.policy);
            const latencies = outcomes
                .flatMap((o: any) => o.decisionLatencies ?? [])
                .sort((a: number, b: number) => a - b);

            expect(policy.matchesPlayed).toBe(outcomes.length);
            expect(policy.totalCandidateDecisions).toBe(latencies.length);
            expect(policy.latencyP50).toBe(Number(computePercentile(latencies, 50).toFixed(1)));
            expect(policy.latencyP95).toBe(Number(computePercentile(latencies, 95).toFixed(1)));
            expect(policy.latencyP99).toBe(Number(computePercentile(latencies, 99).toFixed(1)));
            expect(policy.latencyMax).toBe(Number(latencies[latencies.length - 1].toFixed(1)));

            const hardFallbacks = outcomes.reduce((s: number, o: any) => s + (o.deadlineFallbackCount ?? 0), 0);
            expect(policy.hardFallbackDecisions).toBe(hardFallbacks);
            expect(policy.hardFallbackRatePct).toBe(Number(((hardFallbacks / latencies.length) * 100).toFixed(2)));

            const softDeadlines = outcomes.reduce((s: number, o: any) => s + (o.wallClockExceededCount ?? 0), 0);
            expect(policy.softDeadlineDecisions).toBe(softDeadlines);

            const naturalWins = outcomes.filter((o: any) => o.terminationReason === 'NATURAL_WIN').length;
            const naturalLosses = outcomes.filter((o: any) => o.terminationReason === 'NATURAL_LOSS').length;
            expect(policy.naturalWins).toBe(naturalWins);
            expect(policy.naturalLosses).toBe(naturalLosses);
            expect(policy.winRateNaturalOnly).toBe(
                naturalWins + naturalLosses > 0
                    ? Number(((naturalWins / (naturalWins + naturalLosses)) * 100).toFixed(1))
                    : 0
            );
            expect(policy.confidenceInterval95Natural).toEqual(
                computeWilsonScoreInterval(naturalWins, naturalWins + naturalLosses)
            );

            // Aggregate cross-check.
            const agg = benchmark.aggregates[policy.policy];
            expect(policy.latencyP99).toBe(agg.latencyP99);
            expect(policy.latencyMax).toBe(agg.latencyMax);
            expect(policy.hardFallbackDecisions).toBe(agg.totalDeadlineFallbacks);
            expect(policy.latenciesOver1000ms).toBe(agg.latenciesOver1000ms);
        }
    });

    it('R8-08-C: the analysis is byte-reproducible from the benchmark JSON alone', () => {
        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
        const benchmark = JSON.parse(readFileSync(BENCHMARK_PATH, 'utf8'));
        const regenerated = buildRuntimeFallbackAnalysis({
            benchmark,
            benchmarkPath: BENCHMARK_PATH,
            sourceBenchmarkPath: path.resolve(REPO_ROOT, analysis.sourceBenchmarkPath),
            runId: REPORT_RUN_ID,
            policies: analysis.policies.map((p: any) => p.policy),
            repoRoot: REPO_ROOT
        });

        expect(regenerated.gate).toEqual(analysis.gate);
        expect(regenerated.overall.passed).toBe(analysis.overall.passed);
        for (let i = 0; i < analysis.policies.length; i++) {
            const a = { ...analysis.policies[i] };
            const b = { ...regenerated.policies[i] };
            expect(b).toEqual(a);
        }
    });

    it('R8-08-D: hard fallback rate and latency gates are explicitly decided against the thresholds', () => {
        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
        expect(analysis.gate).toEqual(RUNTIME_FALLBACK_GATE);

        for (const policy of analysis.policies) {
            const isSearch = SEARCH_POLICIES.has(policy.policy);
            expect(policy.candidateSearchApplicable).toBe(isSearch);

            // Independent recomputation of the gate verdict.
            const expectedPass =
                policy.hardFallbackRatePct < RUNTIME_FALLBACK_GATE.maxHardFallbackRatePct &&
                policy.hardFallbackDecisionsPerMatch < RUNTIME_FALLBACK_GATE.maxHardFallbackDecisionsPerMatch &&
                policy.latencyP99 < RUNTIME_FALLBACK_GATE.maxP99Ms &&
                policy.latencyMax < RUNTIME_FALLBACK_GATE.maxMaxMs &&
                (!isSearch ||
                    policy.avgCandidatesEvaluatedPerDecision >= RUNTIME_FALLBACK_GATE.minAvgCandidatesEvaluated);

            expect(policy.gate.passed, `${policy.policy} gate verdict`).toBe(expectedPass);
            expect(policy.gate.passed).toBe(policy.gate.failures.length === 0);
        }

        expect(analysis.policies.some((p: any) => p.gate.passed)).toBe(true);
        expect(typeof analysis.overall.passed).toBe('boolean');
        expect(Array.isArray(analysis.overall.policiesPassed)).toBe(true);
        expect(Array.isArray(analysis.overall.policiesFailed)).toBe(true);
        expect(analysis.overall.notes.length).toBeGreaterThan(0);
    });

    it('R8-08-E: the soft/hard deadline refactor eliminated the 100% heuristic fallback regression', () => {
        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));

        for (const policy of analysis.policies) {
            if (!SEARCH_POLICIES.has(policy.policy)) continue;

            // Hard ceiling breaches stay under the gate.
            expect(policy.hardFallbackRatePct, `${policy.policy} hard fallback rate`).toBeLessThan(
                RUNTIME_FALLBACK_GATE.maxHardFallbackRatePct
            );
            expect(policy.hardFallbackDecisionsPerMatch).toBeLessThan(
                RUNTIME_FALLBACK_GATE.maxHardFallbackDecisionsPerMatch
            );

            // ...and the search still evaluates real candidates on essentially every decision.
            expect(
                policy.avgCandidatesEvaluatedPerDecision,
                `${policy.policy} avg candidates per decision`
            ).toBeGreaterThanOrEqual(RUNTIME_FALLBACK_GATE.minAvgCandidatesEvaluated);

            // Latency stays inside the hard ceiling.
            expect(policy.latencyP99).toBeLessThan(RUNTIME_FALLBACK_GATE.maxP99Ms);
            expect(policy.latencyMax).toBeLessThan(RUNTIME_FALLBACK_GATE.maxMaxMs);
            expect(policy.latenciesOver1000ms).toBe(0);
        }
    });

    it('R8-08-F: the analysis records the closure_01 source benchmark for the before/after comparison', () => {
        const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
        expect(analysis.sourceBenchmarkPath).toContain('agent_upgrade_20260921_v8_closure_01');
        const sourceBenchmarkAbs = path.resolve(REPO_ROOT, analysis.sourceBenchmarkPath);
        expect(existsSync(sourceBenchmarkAbs)).toBe(true);

        // Before the refactor: S00 2040/6576 = 31.02%, S10 1910/6591 = 28.98% hard fallbacks.
        const source = JSON.parse(readFileSync(sourceBenchmarkAbs, 'utf8'));
        expect(source.aggregates.S00_SEARCH.totalDeadlineFallbacks).toBe(2040);
        expect(source.aggregates.S10_SPATIAL_SEARCH.totalDeadlineFallbacks).toBe(1910);
    });
});
