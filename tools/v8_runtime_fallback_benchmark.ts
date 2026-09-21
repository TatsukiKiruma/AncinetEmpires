/**
 * R8-08 Runtime Fallback Benchmark (closure_02)
 *
 * Re-measures the bounded-search runtime gate (S00_SEARCH / S10_SPATIAL_SEARCH) after the
 * `hardMaxMs` fallback refactor in tools/v7_heuristic_bounded_search.ts, and emits a machine
 * generated runtime fallback analysis.
 *
 * This tool NEVER writes into a historical run directory. It always writes into the run id
 * given by --run-id (default: the closure_02 run) under this repository checkout.
 *
 * Usage:
 *   node --loader ... tools/v8_runtime_fallback_benchmark.ts [--quick] [--policies a,b]
 *   node --loader ... tools/v8_runtime_fallback_benchmark.ts --analyze-only <benchmark.json>
 */

import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    runFullV7BenchmarkSuite,
    BENCHMARK_MAPS,
    computePercentile,
    computeWilsonScoreInterval,
    type PolicyType,
    type MatchOutcome
} from './v7_unified_evaluation';
import { toRepoRelative } from './v8_closure_facts';

export const DEFAULT_RUN_ID = 'agent_upgrade_20260921_v8_closure_02';
export const DEFAULT_SOURCE_RUN_ID = 'agent_upgrade_20260921_v8_closure_01';

/** Gate thresholds for the runtime fallback qualification. */
export const RUNTIME_FALLBACK_GATE = {
    /** Hard fallback decisions / total candidate decisions must be strictly below this percentage. */
    maxHardFallbackRatePct: 10,
    /** Hard fallback decisions per match must be strictly below this count. */
    maxHardFallbackDecisionsPerMatch: 50,
    /** p99 decision latency must be strictly below this many milliseconds. */
    maxP99Ms: 1000,
    /** Max decision latency must be strictly below this many milliseconds. */
    maxMaxMs: 1000,
    /** Average real candidates evaluated per decision must be at least this many (search policies only). */
    minAvgCandidatesEvaluated: 1
} as const;

/** Policies that actually run the bounded candidate search (and therefore report candidate counters). */
export const SEARCH_POLICIES: ReadonlySet<string> = new Set(['S00_SEARCH', 'S10_SPATIAL_SEARCH']);

export interface RuntimeFallbackPolicyAnalysis {
    policy: string;
    matchesPlayed: number;
    /** True when this policy runs the bounded candidate search and reports candidate counters. */
    candidateSearchApplicable: boolean;
    totalCandidateDecisions: number;
    hardFallbackDecisions: number;
    hardFallbackRatePct: number;
    hardFallbackDecisionsPerMatch: number;
    softDeadlineDecisions: number;
    softDeadlineRatePct: number;
    matchesWithSoftDeadline: number;
    matchesWithHardFallback: number;
    candidateEvaluationsTotal: number;
    avgCandidatesEvaluatedPerDecision: number;
    shallowEvaluationsTotal: number;
    avgShallowEvaluationsPerDecision: number;
    decisionsWithRealRollout: number;
    decisionsWithOnlyShallowEvaluation: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    latencyMax: number;
    latenciesOver1000ms: number;
    naturalWins: number;
    naturalLosses: number;
    truncations: number;
    winRateNaturalOnly: number;
    effectiveWinRate: number;
    confidenceInterval95Natural: [number, number];
    gate: {
        hardFallbackRateOk: boolean;
        hardFallbackPerMatchOk: boolean;
        p99Ok: boolean;
        maxOk: boolean;
        candidatesEvaluatedOk: boolean;
        passed: boolean;
        failures: string[];
    };
}

export interface RuntimeFallbackAnalysis {
    runId: string;
    generatedAt: string;
    /** Repo-relative path of the analysed benchmark, so the artifact is checkout independent. */
    benchmarkPath: string;
    /** Repo-relative path of the read-only closure_01 baseline benchmark. */
    sourceBenchmarkPath: string;
    benchmarkRunId: string;
    maps: string[];
    seeds: number[];
    maxTurns: number;
    maxAtomicSteps: number;
    gate: typeof RUNTIME_FALLBACK_GATE;
    policies: RuntimeFallbackPolicyAnalysis[];
    overall: {
        passed: boolean;
        policiesEvaluated: string[];
        policiesPassed: string[];
        policiesFailed: string[];
        notes: string[];
    };
}

/** Recompute per-policy facts straight from the raw match outcomes. */
export function recomputePolicyFacts(benchmark: any, policy: string): {
    outcomes: MatchOutcome[];
    latencies: number[];
    latenciesOver1000ms: number;
    naturalWins: number;
    naturalLosses: number;
    naturalDraws: number;
    truncations: number;
    hardFallbackDecisions: number;
    softDeadlineDecisions: number;
    candidateEvaluationsTotal: number;
    shallowEvaluationsTotal: number;
} {
    const outcomes: MatchOutcome[] = (benchmark.outcomes ?? []).filter(
        (o: MatchOutcome) => o.candidatePolicy === policy
    );
    const latencies: number[] = outcomes
        .flatMap(o => o.decisionLatencies ?? [])
        .sort((a, b) => a - b);
    return {
        outcomes,
        latencies,
        latenciesOver1000ms: latencies.filter(v => v > 1000).length,
        naturalWins: outcomes.filter(o => o.terminationReason === 'NATURAL_WIN').length,
        naturalLosses: outcomes.filter(o => o.terminationReason === 'NATURAL_LOSS').length,
        naturalDraws: outcomes.filter(o => o.terminationReason === 'NATURAL_DRAW').length,
        truncations: outcomes.filter(o => o.terminationReason.startsWith('TRUNCATION')).length,
        hardFallbackDecisions: outcomes.reduce((s, o) => s + (o.deadlineFallbackCount ?? 0), 0),
        softDeadlineDecisions: outcomes.reduce((s, o) => s + (o.wallClockExceededCount ?? 0), 0),
        candidateEvaluationsTotal: outcomes.reduce((s, o) => s + (o.searchCandidatesEvaluated ?? 0), 0),
        shallowEvaluationsTotal: outcomes.reduce((s, o) => s + (o.searchShallowEvaluations ?? 0), 0)
    };
}

function pct(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
}

export function analyzePolicy(benchmark: any, policy: string): RuntimeFallbackPolicyAnalysis {
    const f = recomputePolicyFacts(benchmark, policy);
    const decisions = f.latencies.length;
    const naturalTotal = f.naturalWins + f.naturalLosses;

    // Canonical Wilson interval from tools/v7_unified_evaluation.ts - never re-implemented here.
    const ciNatural = computeWilsonScoreInterval(f.naturalWins, naturalTotal);

    const hardFallbackRatePct = pct(f.hardFallbackDecisions, decisions);
    const hardFallbackDecisionsPerMatch = f.outcomes.length > 0
        ? Number((f.hardFallbackDecisions / f.outcomes.length).toFixed(2))
        : 0;
    const avgCandidatesEvaluatedPerDecision = decisions > 0
        ? Number((f.candidateEvaluationsTotal / decisions).toFixed(3))
        : 0;
    const avgShallowEvaluationsPerDecision = decisions > 0
        ? Number((f.shallowEvaluationsTotal / decisions).toFixed(3))
        : 0;

    const p50 = Number(computePercentile(f.latencies, 50).toFixed(1));
    const p95 = Number(computePercentile(f.latencies, 95).toFixed(1));
    const p99 = Number(computePercentile(f.latencies, 99).toFixed(1));
    const max = f.latencies.length > 0 ? Number(f.latencies[f.latencies.length - 1].toFixed(1)) : 0;

    const failures: string[] = [];
    const hardFallbackRateOk = hardFallbackRatePct < RUNTIME_FALLBACK_GATE.maxHardFallbackRatePct;
    if (!hardFallbackRateOk) {
        failures.push(
            `hardFallbackRatePct ${hardFallbackRatePct}% >= ${RUNTIME_FALLBACK_GATE.maxHardFallbackRatePct}%`
        );
    }
    const hardFallbackPerMatchOk =
        hardFallbackDecisionsPerMatch < RUNTIME_FALLBACK_GATE.maxHardFallbackDecisionsPerMatch;
    if (!hardFallbackPerMatchOk) {
        failures.push(
            `hardFallbackDecisionsPerMatch ${hardFallbackDecisionsPerMatch} >= ${RUNTIME_FALLBACK_GATE.maxHardFallbackDecisionsPerMatch}`
        );
    }
    const p99Ok = p99 < RUNTIME_FALLBACK_GATE.maxP99Ms;
    if (!p99Ok) failures.push(`p99 ${p99}ms >= ${RUNTIME_FALLBACK_GATE.maxP99Ms}ms`);
    const maxOk = max < RUNTIME_FALLBACK_GATE.maxMaxMs;
    if (!maxOk) failures.push(`max ${max}ms >= ${RUNTIME_FALLBACK_GATE.maxMaxMs}ms`);
    const candidatesEvaluatedOk =
        !SEARCH_POLICIES.has(policy) ||
        avgCandidatesEvaluatedPerDecision >= RUNTIME_FALLBACK_GATE.minAvgCandidatesEvaluated;
    if (!candidatesEvaluatedOk) {
        failures.push(
            `avgCandidatesEvaluatedPerDecision ${avgCandidatesEvaluatedPerDecision} < ${RUNTIME_FALLBACK_GATE.minAvgCandidatesEvaluated}`
        );
    }

    return {
        policy,
        matchesPlayed: f.outcomes.length,
        candidateSearchApplicable: SEARCH_POLICIES.has(policy),
        totalCandidateDecisions: decisions,
        hardFallbackDecisions: f.hardFallbackDecisions,
        hardFallbackRatePct,
        hardFallbackDecisionsPerMatch,
        softDeadlineDecisions: f.softDeadlineDecisions,
        softDeadlineRatePct: pct(f.softDeadlineDecisions, decisions),
        matchesWithSoftDeadline: f.outcomes.filter(o => (o.wallClockExceededCount ?? 0) > 0).length,
        matchesWithHardFallback: f.outcomes.filter(o => (o.deadlineFallbackCount ?? 0) > 0).length,
        candidateEvaluationsTotal: f.candidateEvaluationsTotal,
        avgCandidatesEvaluatedPerDecision,
        shallowEvaluationsTotal: f.shallowEvaluationsTotal,
        avgShallowEvaluationsPerDecision,
        // A decision that ran a full rollout reports zero shallow evaluations.
        decisionsWithOnlyShallowEvaluation: Math.max(0, f.shallowEvaluationsTotal),
        decisionsWithRealRollout: Math.max(0, f.candidateEvaluationsTotal - f.shallowEvaluationsTotal),
        latencyP50: p50,
        latencyP95: p95,
        latencyP99: p99,
        latencyMax: max,
        latenciesOver1000ms: f.latenciesOver1000ms,
        naturalWins: f.naturalWins,
        naturalLosses: f.naturalLosses,
        truncations: f.truncations,
        winRateNaturalOnly: naturalTotal > 0 ? Number(((f.naturalWins / naturalTotal) * 100).toFixed(1)) : 0,
        effectiveWinRate: Number(((f.naturalWins / Math.max(1, f.outcomes.length)) * 100).toFixed(1)),
        confidenceInterval95Natural: ciNatural,
        gate: {
            hardFallbackRateOk,
            hardFallbackPerMatchOk,
            p99Ok,
            maxOk,
            candidatesEvaluatedOk,
            passed:
                hardFallbackRateOk &&
                hardFallbackPerMatchOk &&
                p99Ok &&
                maxOk &&
                candidatesEvaluatedOk,
            failures
        }
    };
}

export function buildRuntimeFallbackAnalysis(options: {
    benchmark: any;
    benchmarkPath: string;
    sourceBenchmarkPath: string;
    runId: string;
    policies: string[];
    repoRoot: string;
}): RuntimeFallbackAnalysis {
    const { benchmark, benchmarkPath, sourceBenchmarkPath, runId, policies, repoRoot } = options;
    const policyAnalyses = policies.map(p => analyzePolicy(benchmark, p));

    for (const pa of policyAnalyses) {
        const agg = benchmark.aggregates?.[pa.policy];
        if (!agg) continue;
        // Self check: the analysis must agree with the benchmark's own aggregates.
        const mismatches: string[] = [];
        if (agg.latencyP99 !== pa.latencyP99) mismatches.push(`latencyP99 ${agg.latencyP99} != ${pa.latencyP99}`);
        if (agg.latencyMax !== pa.latencyMax) mismatches.push(`latencyMax ${agg.latencyMax} != ${pa.latencyMax}`);
        if (agg.latencyP50 !== pa.latencyP50) mismatches.push(`latencyP50 ${agg.latencyP50} != ${pa.latencyP50}`);
        if (agg.latencyP95 !== pa.latencyP95) mismatches.push(`latencyP95 ${agg.latencyP95} != ${pa.latencyP95}`);
        if ((agg.totalDeadlineFallbacks ?? 0) !== pa.hardFallbackDecisions) {
            mismatches.push(`totalDeadlineFallbacks ${agg.totalDeadlineFallbacks} != ${pa.hardFallbackDecisions}`);
        }
        if ((agg.wallClockExceededMatches ?? 0) !== pa.matchesWithSoftDeadline) {
            mismatches.push(
                `wallClockExceededMatches ${agg.wallClockExceededMatches} != ${pa.matchesWithSoftDeadline}`
            );
        }
        if (agg.latenciesOver1000ms !== pa.latenciesOver1000ms) {
            mismatches.push(`latenciesOver1000ms ${agg.latenciesOver1000ms} != ${pa.latenciesOver1000ms}`);
        }
        if (JSON.stringify(agg.confidenceInterval95Natural) !== JSON.stringify(pa.confidenceInterval95Natural)) {
            mismatches.push(
                `confidenceInterval95Natural ${JSON.stringify(agg.confidenceInterval95Natural)} != ${JSON.stringify(pa.confidenceInterval95Natural)}`
            );
        }
        if (agg.winRateNaturalOnly !== pa.winRateNaturalOnly) {
            mismatches.push(`winRateNaturalOnly ${agg.winRateNaturalOnly} != ${pa.winRateNaturalOnly}`);
        }
        if (agg.effectiveWinRate !== pa.effectiveWinRate) {
            mismatches.push(`effectiveWinRate ${agg.effectiveWinRate} != ${pa.effectiveWinRate}`);
        }
        if (agg.naturalWins !== pa.naturalWins || agg.naturalLosses !== pa.naturalLosses || agg.truncations !== pa.truncations) {
            mismatches.push(
                `W/L/T ${agg.naturalWins}/${agg.naturalLosses}/${agg.truncations} != ${pa.naturalWins}/${pa.naturalLosses}/${pa.truncations}`
            );
        }
        if (mismatches.length > 0) {
            throw new Error(
                `Runtime fallback analysis disagrees with benchmark aggregates for ${pa.policy}: ${mismatches.join('; ')}`
            );
        }
    }

    const passed = policyAnalyses.filter(p => p.gate.passed).map(p => p.policy);
    const failed = policyAnalyses.filter(p => !p.gate.passed).map(p => p.policy);
    const notes: string[] = [];
    notes.push(
        `Hard fallback counts decisions where the hard ceiling (hardMaxMs) expired before any candidate trace was produced.`
    );
    notes.push(
        `Soft deadline counts decisions where the soft budget expired but a real candidate trace was still produced.`
    );
    if (failed.length > 0) {
        notes.push(
            `Failing policies: ${failed.join(', ')}. These policies are NOT QUALIFIED for online deployment.`
        );
    }

    return {
        runId,
        generatedAt: new Date().toISOString(),
        benchmarkPath: toRepoRelative(repoRoot, benchmarkPath),
        sourceBenchmarkPath: toRepoRelative(repoRoot, sourceBenchmarkPath),
        benchmarkRunId: benchmark.runId,
        maps: benchmark.benchmarkMaps ?? [],
        seeds: benchmark.seeds ?? [],
        maxTurns: benchmark.maxTurns,
        maxAtomicSteps: benchmark.maxAtomicSteps,
        gate: RUNTIME_FALLBACK_GATE,
        policies: policyAnalyses,
        overall: {
            passed: failed.length === 0,
            policiesEvaluated: policyAnalyses.map(p => p.policy),
            policiesPassed: passed,
            policiesFailed: failed,
            notes
        }
    };
}

async function main() {
    const argv = process.argv;
    const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
    const runIdIdx = argv.indexOf('--run-id');
    const runId = runIdIdx !== -1 && argv[runIdIdx + 1] ? argv[runIdIdx + 1] : DEFAULT_RUN_ID;

    const reportDir = path.join(repoRoot, 'docs/training/reports', runId);
    const runDir = path.join(repoRoot, 'training_runs', runId);
    const checkpointDir = path.join(runDir, 'checkpoints');
    const benchmarkPath = path.join(reportDir, 'v8_runtime_fallback_benchmark.json');
    const analysisPath = path.join(reportDir, 'runtime_fallback_analysis.json');
    // The source benchmark is always addressed inside this checkout, never as a raw cwd-relative
    // path, so the recorded identifier stays stable no matter where the tool is invoked from.
    const sourceBenchmarkPath = path.join(
        repoRoot,
        'docs/training/reports',
        DEFAULT_SOURCE_RUN_ID,
        'v8_clean_benchmark.json'
    );

    const analyzeOnlyIdx = argv.indexOf('--analyze-only');
    if (analyzeOnlyIdx !== -1) {
        const target = argv[analyzeOnlyIdx + 1];
        if (!target) throw new Error('--analyze-only requires a benchmark JSON path');
        const abs = path.resolve(target);
        const benchmark = JSON.parse(readFileSync(abs, 'utf8'));
        const policies = Object.keys(benchmark.aggregates ?? {});
        const analysis = buildRuntimeFallbackAnalysis({
            benchmark,
            benchmarkPath: abs,
            sourceBenchmarkPath,
            runId,
            policies,
            repoRoot
        });
        mkdirSync(path.dirname(analysisPath), { recursive: true });
        writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8');
        console.log(`[Runtime Fallback] Analysis written to ${analysisPath}`);
        return;
    }

    const quick = argv.includes('--quick');
    const policiesIdx = argv.indexOf('--policies');
    const policies: PolicyType[] = policiesIdx !== -1 && argv[policiesIdx + 1]
        ? (argv[policiesIdx + 1].split(',').filter(Boolean) as PolicyType[])
        : (['HEURISTIC', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'] as PolicyType[]);

    const maps = quick ? BENCHMARK_MAPS.slice(0, 1) : BENCHMARK_MAPS;
    const seeds = quick ? [42] : [42, 1337];

    mkdirSync(reportDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });

    console.log('=======================================================');
    console.log(`[R8-08 Runtime Fallback Benchmark] runId=${runId}`);
    console.log(`checkpoints: ${checkpointDir}`);
    console.log(`policies: ${policies.join(', ')}`);
    console.log(`maps: ${maps.length}, seeds: ${seeds.length}, quick=${quick}`);
    console.log('=======================================================');

    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: policies,
        maps,
        seeds,
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: benchmarkPath,
        directories: { runId, reportDir, runDir, checkpointDir }
    });

    const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
    const analysis = buildRuntimeFallbackAnalysis({
        benchmark,
        benchmarkPath,
        sourceBenchmarkPath,
        runId,
        policies,
        repoRoot
    });
    writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8');

    console.log('\n=======================================================');
    console.log(`Matches: ${res.outcomes.length}`);
    console.log(`Benchmark: ${benchmarkPath}`);
    console.log(`Analysis:  ${analysisPath}`);
    for (const p of analysis.policies) {
        console.log(
            `  ${p.policy}: decisions=${p.totalCandidateDecisions} hardFallback=${p.hardFallbackDecisions} ` +
            `(${p.hardFallbackRatePct}%) soft=${p.softDeadlineDecisions} (${p.softDeadlineRatePct}%) ` +
            `avgCand=${p.avgCandidatesEvaluatedPerDecision} avgShallow=${p.avgShallowEvaluationsPerDecision} ` +
            `p99=${p.latencyP99} max=${p.latencyMax} gate=${p.gate.passed ? 'PASS' : 'FAIL'}`
        );
    }
    console.log(`Overall gate: ${analysis.overall.passed ? 'PASS' : 'FAIL'}`);
    console.log('=======================================================');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch(err => {
        console.error('Runtime fallback benchmark failed:', err);
        process.exit(1);
    });
}
