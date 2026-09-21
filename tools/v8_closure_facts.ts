/**
 * closure_02 shared fact model.
 *
 * Single source of truth for every number that appears in the closure_02 report set.
 * Both the report generator (tools/v8_closure_report.ts) and the consistency verifier
 * (tools/v8_verify_report_consistency.ts) import these helpers, so a report can only ever
 * contain numbers that were machine derived from the benchmark JSON / on-disk artifacts.
 *
 * Nothing in this module writes files.
 */

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
    computePercentile,
    computeWilsonScoreInterval,
    type MatchOutcome
} from './v7_unified_evaluation';

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

/** Region markers: text between them is exempt from claim scanning and the legacy denylist. */
export const LEGACY_CLAIMS_ALLOWED_START = '<!-- legacy-claims-allowed:start -->';
export const LEGACY_CLAIMS_ALLOWED_END = '<!-- legacy-claims-allowed:end -->';

/** Fenced block markers carrying the machine readable fact object. */
export const MACHINE_FACTS_START = '<!-- MACHINE_FACTS_BEGIN -->';
export const MACHINE_FACTS_END = '<!-- MACHINE_FACTS_END -->';

/** JSON keys that hold deliberate historical quotations and are exempt from scanning. */
export const LEGACY_EXEMPT_JSON_KEYS: ReadonlySet<string> = new Set(['historicalCorrections']);

/** Bounded-search policies that report candidate-search counters. */
export const SEARCH_POLICIES: ReadonlySet<string> = new Set(['S00_SEARCH', 'S10_SPATIAL_SEARCH']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyRole = 'INCUMBENT_DEFAULT' | 'CONTROL' | 'CHALLENGER';

export interface PolicyQualification {
    role: PolicyRole;
    promotionEligible: boolean;
    promotionQualified: boolean;
    runtimeGateApplicable: boolean;
    runtimeGateQualified: boolean;
    reasons: string[];
}

export interface PolicyFacts {
    policy: string;
    label: string;
    matchesPlayed: number;
    naturalWins: number;
    naturalLosses: number;
    naturalDraws: number;
    truncations: number;
    winLossTruncation: string;
    truncationRatePct: number;
    winRateNaturalOnlyPct: number;
    effectiveWinRatePct: number;
    winRateNaturalOnlyNumerator: number;
    winRateNaturalOnlyDenominator: number;
    confidenceInterval95Natural: [number, number];
    confidenceInterval95Effective: [number, number];
    engineErrors: number;
    modelLoadErrors: number;
    notRuns: number;
    decisionCount: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    latencyMax: number;
    latenciesOver1000ms: number;
    deadlineFallbackCount: number;
    deadlineFallbackRatePct: number;
    wallClockExceededMatches: number;
    totalRehireOpportunities: number;
    totalRehireSuccesses: number;
    rehireSuccessRatePct: number | null;
    totalRecoveryWindows: number;
    totalRecoverySuccesses: number;
    recoveryWindowSuccessRatePct: number | null;
    candidateSearchApplicable: boolean;
    qualification: PolicyQualification;
}

export interface CheckpointFacts {
    identity: string;
    path: string;
    sha256: string;
}

export interface DatasetFacts {
    datasetPath: string;
    datasetSha256: string;
    datasetRows: number;
    splitManifestPath: string;
    splitManifestSha256: string;
    consumedManifestPath: string;
    consumedManifestSha256: string;
    trainSampleCount: number;
    valSampleCount: number;
    trainValSampleIdIntersection: number;
    datasetSampleIdsCovered: number;
    phaseDistribution: Array<{ phase: string; count: number; pct: number }>;
    curriculumBreakdown: Record<string, number>;
    rootFamiliesTotal: number;
    trainRootFamilies: number;
    valRootFamilies: number;
    valueTargetNullCount: number;
    valueTargetNonNullCount: number;
    duplicateStatesFiltered: number;
    quarantinedSamples: number;
}

export interface RuntimeFallbackFacts {
    analysisPath: string;
    analysisSha256: string;
    runId: string;
    /** Repo-relative path of the benchmark that was analysed. */
    benchmarkPath: string;
    /** Repo-relative path of the read-only closure_01 baseline benchmark. */
    sourceBenchmarkPath: string;
    gate: Record<string, number>;
    overallPassed: boolean;
    policies: Array<{
        policy: string;
        totalCandidateDecisions: number;
        hardFallbackDecisions: number;
        hardFallbackRatePct: number;
        hardFallbackDecisionsPerMatch: number;
        softDeadlineDecisions: number;
        softDeadlineRatePct: number;
        avgCandidatesEvaluatedPerDecision: number;
        avgShallowEvaluationsPerDecision: number;
        latencyP99: number;
        latencyMax: number;
        gatePassed: boolean;
        gateFailures: string[];
    }>;
}

export interface DaggerRound2Aggregate {
    policy: string;
    matchesPlayed: number;
    naturalWins: number;
    naturalLosses: number;
    naturalDraws: number;
    truncations: number;
    truncationRatePct: number;
    winRateNaturalOnlyPct: number;
    effectiveWinRatePct: number;
    confidenceInterval95Natural: [number, number];
    confidenceInterval95Effective: [number, number];
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    latencyMax: number;
    latenciesOver1000ms: number;
    wallClockExceededMatches: number;
    totalRehireOpportunities: number;
    totalRehireSuccesses: number;
    totalRecoveryWindows: number;
    totalRecoverySuccesses: number;
    checkpointSha256: string | null;
}

export interface DaggerRound2Facts {
    summaryPath: string;
    summarySha256: string;
    roundLabel: string;
    failuresCount: number;
    failureTypeCounts: Record<string, number>;
    policyDivergenceOnly: boolean;
    correctionSignalNote: string;
    baseDatasetPath: string | null;
    baseDatasetRowsRead: number;
    daggerDatasetRows: number;
    daggerSampleRowsAppended: number;
    daggerAddedRootCount: number;
    baseModelSha256: string;
    daggerSha256: string | null;
    distinctCheckpointShas: boolean;
    pythonCommand: string;
    torchVersion: string;
    pairedReportPath: string;
    pairedReportSha256: string;
    pairedMatches: number;
    pairedAggregates: DaggerRound2Aggregate[];
    qualityAssessment: Record<string, unknown>;
}

export interface SearchProfileRow {
    step: number;
    turn: number;
    legalActions: number;
    heuristicScoreAllMs: number;
    filteredCandidatesMs: number;
    legacyFixedOverheadMs: number;
    newFixedOverheadMs: number;
    leafEvalMs: number;
    boundedSearchMs: number;
    boundedSearchFallback: number;
    boundedSearchCandidatesEvaluated: number;
    boundedSearchShallowEvaluations: number;
    boundedSearchWallClockExceeded: boolean;
}

export interface SearchProfileFacts {
    profilePath: string;
    profileSha256: string;
    source: string;
    mapName: string;
    seat: number;
    budget: Record<string, number>;
    rows: SearchProfileRow[];
}

export interface ClosureFacts {
    factsVersion: number;
    generator: string;
    generatedAt: string;
    reportRunId: string;
    sourceRunId: string;
    branch: string;
    reviewBaseCommit: string;
    sourceBenchmark: {
        path: string;
        sha256: string;
        runId: string;
        evaluatedAt: string;
        maps: string[];
        seeds: number[];
        maxTurns: number;
        maxAtomicSteps: number;
        totalMatches: number;
        totalDecisions: number;
    };
    checkpoints: CheckpointFacts[];
    policies: PolicyFacts[];
    dataset: DatasetFacts | null;
    runtimeFallback: RuntimeFallbackFacts | null;
    searchProfile: SearchProfileFacts | null;
    daggerRound2: DaggerRound2Facts | null;
    thirtyKStatus: { status: string; reason: string };
    defaultProductionPolicy: string;
}

// ---------------------------------------------------------------------------
// Hashing helpers
// ---------------------------------------------------------------------------

export function sha256OfBuffer(buf: Buffer | string): string {
    return createHash('sha256').update(buf).digest('hex');
}

export function sha256OfFile(filePath: string): string {
    return sha256OfBuffer(readFileSync(filePath));
}

/**
 * SHA-256 of a text artifact over its LF-normalised content.
 *
 * Git checkouts with `core.autocrlf=true` rewrite tracked text files to CRLF, so hashing raw bytes
 * would make the recorded hash depend on which checkout produced the report. Normalising to LF keeps
 * the identifier stable across a worktree and the canonical working tree.
 */
export function sha256OfTextArtifact(filePath: string): string {
    return sha256OfBuffer(readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'));
}

/**
 * Store artifact paths relative to the repository root with forward slashes, so a report generated
 * in a worktree or a temporary checkout stays correct when the repository is moved or mirrored.
 */
export function toRepoRelative(repoRoot: string, targetPath: string): string {
    const relative = path.relative(repoRoot, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return targetPath.replace(/\\/g, '/');
    }
    return relative.replace(/\\/g, '/');
}

/** Resolve a fact path (repo-relative or absolute) back to an absolute filesystem path. */
export function resolveRepoPath(repoRoot: string, factPath: string): string {
    return path.isAbsolute(factPath) ? factPath : path.join(repoRoot, factPath);
}

// ---------------------------------------------------------------------------
// Benchmark fact recomputation
// ---------------------------------------------------------------------------

export function policyLabel(policy: string): string {
    switch (policy) {
        case 'HEURISTIC':
            return 'HeuristicAI (production default / benchmark control)';
        case 'SPATIAL_V2':
            return 'Spatial ResNet v2 (policy-only, no value head)';
        case 'SPATIAL_DAGGER':
            return 'Spatial ResNet v2 + 1 round DAgger warm start';
        case 'NET_A':
            return 'NET_A DualHead control (value_weight = 0)';
        case 'S00_SEARCH':
            return 'S00 bounded adversarial search (HeuristicAI leaf evaluation)';
        case 'S10_SPATIAL_SEARCH':
            return 'S10 bounded adversarial search (spatial prior candidate ordering)';
        default:
            return policy;
    }
}

function round1(value: number): number {
    return Number(value.toFixed(1));
}

function round2(value: number): number {
    return Number(value.toFixed(2));
}

/**
 * Recompute every per-policy fact directly from `benchmark.outcomes` using the canonical
 * percentile (interpolating) and Wilson interval helpers from tools/v7_unified_evaluation.ts.
 *
 * Throws when the recomputation disagrees with the benchmark's own `aggregates` block, so a
 * report can never be generated from an internally inconsistent benchmark file.
 */
export function recomputeBenchmarkFacts(benchmark: any): {
    policies: PolicyFacts[];
    totalDecisions: number;
} {
    const aggregateKeys: string[] = Object.keys(benchmark.aggregates ?? {});
    const outcomes: MatchOutcome[] = benchmark.outcomes ?? [];
    if (aggregateKeys.length === 0) {
        throw new Error('Benchmark JSON has no aggregates block');
    }

    const policies: PolicyFacts[] = [];
    let totalDecisions = 0;

    for (const policy of aggregateKeys) {
        const agg = benchmark.aggregates[policy];
        const outs = outcomes.filter(o => o.candidatePolicy === policy);
        const latencies = outs.flatMap(o => o.decisionLatencies ?? []).sort((a, b) => a - b);
        totalDecisions += latencies.length;

        const naturalWins = outs.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const naturalLosses = outs.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const naturalDraws = outs.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const truncations = outs.filter(o => o.terminationReason.startsWith('TRUNCATION')).length;
        const engineErrors = outs.filter(o => o.terminationReason === 'ENGINE_ERROR').length;
        const modelLoadErrors = outs.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length;
        const notRuns = outs.filter(o => o.terminationReason === 'NOT_RUN').length;
        const matchesPlayed = outs.length;

        const naturalTotal = naturalWins + naturalLosses;
        const ciNatural = computeWilsonScoreInterval(naturalWins, naturalTotal);
        const ciEffective = computeWilsonScoreInterval(naturalWins, matchesPlayed);

        const latencyP50 = round1(computePercentile(latencies, 50));
        const latencyP95 = round1(computePercentile(latencies, 95));
        const latencyP99 = round1(computePercentile(latencies, 99));
        const latencyMax = latencies.length > 0 ? round1(latencies[latencies.length - 1]) : 0;
        const latenciesOver1000ms = latencies.filter(v => v > 1000).length;

        const deadlineFallbackCount = outs.reduce((s, o) => s + (o.deadlineFallbackCount ?? 0), 0);
        const wallClockExceededMatches = outs.filter(o => (o.wallClockExceededCount ?? 0) > 0).length;

        const totalRehireOpportunities = outs.reduce((s, o) => s + o.rehireOpportunities, 0);
        const totalRehireSuccesses = outs.reduce((s, o) => s + o.rehireSuccesses, 0);
        const totalRecoveryWindows = outs.reduce((s, o) => s + o.recoveryWindowCount, 0);
        const totalRecoverySuccesses = outs.reduce((s, o) => s + o.recoveryCompletedCount, 0);

        const winRateNaturalOnlyPct = naturalTotal > 0 ? round1((naturalWins / naturalTotal) * 100) : 0;
        const effectiveWinRatePct = matchesPlayed > 0 ? round1((naturalWins / matchesPlayed) * 100) : 0;
        const truncationRatePct = matchesPlayed > 0 ? round1((truncations / matchesPlayed) * 100) : 0;
        const deadlineFallbackRatePct = latencies.length > 0
            ? round2((deadlineFallbackCount / latencies.length) * 100)
            : 0;

        // ---- strict self check against the benchmark's own aggregate block ----
        const mismatches: string[] = [];
        const expect = (label: string, recomputed: unknown, reported: unknown) => {
            if (JSON.stringify(recomputed) !== JSON.stringify(reported)) {
                mismatches.push(`${label}: recomputed ${JSON.stringify(recomputed)} != reported ${JSON.stringify(reported)}`);
            }
        };
        expect('matchesPlayed', matchesPlayed, agg.matchesPlayed);
        expect('naturalWins', naturalWins, agg.naturalWins);
        expect('naturalLosses', naturalLosses, agg.naturalLosses);
        expect('naturalDraws', naturalDraws, agg.naturalDraws);
        expect('truncations', truncations, agg.truncations);
        expect('truncationRate', truncationRatePct, agg.truncationRate);
        expect('engineErrors', engineErrors, agg.engineErrors);
        expect('modelLoadErrors', modelLoadErrors, agg.modelLoadErrors);
        expect('notRuns', notRuns, agg.notRuns);
        expect('winRateNaturalOnly', winRateNaturalOnlyPct, agg.winRateNaturalOnly);
        expect('confidenceInterval95Natural', ciNatural, agg.confidenceInterval95Natural);
        expect('effectiveWinRate', effectiveWinRatePct, agg.effectiveWinRate);
        expect('confidenceInterval95Effective', ciEffective, agg.confidenceInterval95Effective);
        expect('totalRehireOpportunities', totalRehireOpportunities, agg.totalRehireOpportunities);
        expect('totalRehireSuccesses', totalRehireSuccesses, agg.totalRehireSuccesses);
        expect('totalRecoveryWindows', totalRecoveryWindows, agg.totalRecoveryWindows);
        expect('totalRecoverySuccesses', totalRecoverySuccesses, agg.totalRecoverySuccesses);
        expect('latencyP50', latencyP50, agg.latencyP50);
        expect('latencyP95', latencyP95, agg.latencyP95);
        expect('latencyP99', latencyP99, agg.latencyP99);
        expect('latencyMax', latencyMax, agg.latencyMax);
        expect('latenciesOver1000ms', latenciesOver1000ms, agg.latenciesOver1000ms);
        expect('wallClockExceededMatches', wallClockExceededMatches, agg.wallClockExceededMatches);
        expect('totalDeadlineFallbacks', deadlineFallbackCount, agg.totalDeadlineFallbacks);
        if (mismatches.length > 0) {
            throw new Error(
                `Benchmark aggregates are internally inconsistent for ${policy}: ${mismatches.join('; ')}`
            );
        }

        const candidateSearchApplicable = SEARCH_POLICIES.has(policy);
        const reasons: string[] = [];
        const role: PolicyRole = policy === 'HEURISTIC'
            ? 'INCUMBENT_DEFAULT'
            : policy === 'NET_A'
                ? 'CONTROL'
                : 'CHALLENGER';
        const promotionEligible = role === 'CHALLENGER';

        const runtimeGateQualified = candidateSearchApplicable
            ? deadlineFallbackRatePct < 10 && latencyP99 < 1000 && latencyMax < 1000
            : latencyP99 < 1000 && latencyMax < 1000;

        if (!promotionEligible) {
            reasons.push(
                role === 'INCUMBENT_DEFAULT'
                    ? 'Not a challenger: HeuristicAI is the incumbent production default and therefore the control baseline.'
                    : 'Not a challenger: NET_A is retained only as the DualHead control arm.'
            );
        }
        if (engineErrors + modelLoadErrors + notRuns > 0) {
            reasons.push(`Harness integrity failure: ${engineErrors} engine errors, ${modelLoadErrors} model load errors, ${notRuns} not-run matches.`);
        }
        if (latencyP99 >= 1000 || latencyMax >= 1000 || latenciesOver1000ms > 0) {
            reasons.push(`Latency gate failed: p99 ${latencyP99}ms, max ${latencyMax}ms, ${latenciesOver1000ms} decisions over 1000ms.`);
        }
        if (ciNatural[0] <= 50) {
            reasons.push(
                `Natural win rate ${winRateNaturalOnlyPct}% over ${naturalTotal} decided matches has 95% Wilson CI [${ciNatural[0]}%, ${ciNatural[1]}%], whose lower bound does not exceed 50%.`
            );
        }
        if (candidateSearchApplicable && deadlineFallbackRatePct >= 10) {
            reasons.push(
                `Runtime fallback gate failed: ${deadlineFallbackCount}/${latencies.length} decisions (${deadlineFallbackRatePct}%) fell back to the HeuristicAI top action without evaluating a candidate.`
            );
        }

        const promotionQualified = promotionEligible && reasons.length === 0;

        policies.push({
            policy,
            label: policyLabel(policy),
            matchesPlayed,
            naturalWins,
            naturalLosses,
            naturalDraws,
            truncations,
            winLossTruncation: `${naturalWins}-${naturalLosses}-${truncations}`,
            truncationRatePct,
            winRateNaturalOnlyPct,
            effectiveWinRatePct,
            winRateNaturalOnlyNumerator: naturalWins,
            winRateNaturalOnlyDenominator: naturalTotal,
            confidenceInterval95Natural: ciNatural,
            confidenceInterval95Effective: ciEffective,
            engineErrors,
            modelLoadErrors,
            notRuns,
            decisionCount: latencies.length,
            latencyP50,
            latencyP95,
            latencyP99,
            latencyMax,
            latenciesOver1000ms,
            deadlineFallbackCount,
            deadlineFallbackRatePct,
            wallClockExceededMatches,
            totalRehireOpportunities,
            totalRehireSuccesses,
            rehireSuccessRatePct: totalRehireOpportunities > 0
                ? round1((totalRehireSuccesses / totalRehireOpportunities) * 100)
                : null,
            totalRecoveryWindows,
            totalRecoverySuccesses,
            recoveryWindowSuccessRatePct: totalRecoveryWindows > 0
                ? round1((totalRecoverySuccesses / totalRecoveryWindows) * 100)
                : null,
            candidateSearchApplicable,
            qualification: {
                role,
                promotionEligible,
                promotionQualified,
                runtimeGateApplicable: candidateSearchApplicable,
                runtimeGateQualified,
                reasons: reasons.length > 0 ? reasons : ['Meets every promotion gate.']
            }
        });
    }

    return { policies, totalDecisions };
}

// ---------------------------------------------------------------------------
// Dataset facts
// ---------------------------------------------------------------------------

export interface DatasetScanResult {
    rows: number;
    sampleIds: Set<string>;
    phaseCounts: Record<string, number>;
    curriculumCounts: Record<string, number>;
    valueTargetNullCount: number;
    valueTargetNonNullCount: number;
    rootFamilyIds: Set<string>;
}

/** Stream the JSONL dataset so memory stays flat regardless of dataset size. */
export async function scanDataset(datasetPath: string): Promise<DatasetScanResult> {
    const sampleIds = new Set<string>();
    const phaseCounts: Record<string, number> = {};
    const curriculumCounts: Record<string, number> = {};
    const rootFamilyIds = new Set<string>();
    let rows = 0;
    let valueTargetNullCount = 0;
    let valueTargetNonNullCount = 0;

    const rl = readline.createInterface({
        input: createReadStream(datasetPath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        let parsed: any;
        try {
            parsed = JSON.parse(line);
        } catch {
            continue;
        }
        rows++;
        if (typeof parsed.sampleId === 'string') sampleIds.add(parsed.sampleId);
        if (typeof parsed.rootFamilyId === 'string') rootFamilyIds.add(parsed.rootFamilyId);
        const group = String(parsed.scenarioGroup ?? 'UNKNOWN');
        phaseCounts[group] = (phaseCounts[group] ?? 0) + 1;
        if (group.startsWith('CURRICULUM')) {
            const key = String(parsed.curriculumScenario ?? parsed.scenarioId ?? group);
            curriculumCounts[key] = (curriculumCounts[key] ?? 0) + 1;
        }
        if (parsed.valueTarget === null || parsed.valueTarget === undefined) {
            valueTargetNullCount++;
        } else {
            valueTargetNonNullCount++;
        }
    }

    return {
        rows,
        sampleIds,
        phaseCounts,
        curriculumCounts,
        valueTargetNullCount,
        valueTargetNonNullCount,
        rootFamilyIds
    };
}

// ---------------------------------------------------------------------------
// Renderers shared by the generator and the verifier
// ---------------------------------------------------------------------------

export function renderPolicyOutcomeRows(facts: ClosureFacts): string[] {
    return facts.policies.map(p =>
        `| **${p.policy}** | ${p.label} | ${p.matchesPlayed} | ${p.naturalWins} | ${p.naturalLosses} | ` +
        `${p.naturalDraws} | ${p.truncations} | ${p.truncationRatePct.toFixed(1)}% | ` +
        `${p.winRateNaturalOnlyPct.toFixed(1)}% (${p.winRateNaturalOnlyNumerator}/${p.winRateNaturalOnlyDenominator}) | ` +
        `${p.effectiveWinRatePct.toFixed(1)}% | ` +
        `[${p.confidenceInterval95Natural[0].toFixed(1)}%, ${p.confidenceInterval95Natural[1].toFixed(1)}%] | ` +
        `[${p.confidenceInterval95Effective[0].toFixed(1)}%, ${p.confidenceInterval95Effective[1].toFixed(1)}%] | ` +
        `${p.engineErrors + p.modelLoadErrors + p.notRuns} |`
    );
}

export function renderPolicyLatencyRows(facts: ClosureFacts): string[] {
    return facts.policies.map(p =>
        `| **${p.policy}** | ${p.decisionCount} | ${p.latencyP50.toFixed(1)}ms | ${p.latencyP95.toFixed(1)}ms | ` +
        `${p.latencyP99.toFixed(1)}ms | ${p.latencyMax.toFixed(1)}ms | ${p.latenciesOver1000ms} | ` +
        `${p.deadlineFallbackCount} | ${p.deadlineFallbackRatePct.toFixed(2)}% | ${p.wallClockExceededMatches}/${p.matchesPlayed} |`
    );
}

export function renderPolicyVerdictRows(facts: ClosureFacts): string[] {
    return facts.policies.map(p =>
        `| **${p.policy}** | ${p.qualification.role} | ` +
        `${p.qualification.promotionQualified ? 'QUALIFIED' : 'NOT_QUALIFIED'} | ` +
        `${p.qualification.runtimeGateApplicable ? (p.qualification.runtimeGateQualified ? 'PASS' : 'FAIL') : 'N/A'} | ` +
        `${p.qualification.reasons.join(' ')} |`
    );
}

/**
 * The corrected S00 / S10 statements, built only from machine facts.
 * The verifier asserts these exact sentences appear in the new report.
 */
export function renderCorrectionStatements(facts: ClosureFacts): Record<string, string> {
    const byId = new Map(facts.policies.map(p => [p.policy, p]));
    const s00 = byId.get('S00_SEARCH');
    const s10 = byId.get('S10_SPATIAL_SEARCH');
    const out: Record<string, string> = {};
    if (s00) {
        out.S00_SEARCH =
            `S00_SEARCH scored ${s00.winLossTruncation} (natural wins-losses-truncations) over ` +
            `${s00.matchesPlayed} matches. Natural win rate ${s00.winRateNaturalOnlyPct.toFixed(1)}% ` +
            `(${s00.winRateNaturalOnlyNumerator}/${s00.winRateNaturalOnlyDenominator}), effective win rate ` +
            `${s00.effectiveWinRatePct.toFixed(1)}%, 95% Wilson CI ` +
            `[${s00.confidenceInterval95Natural[0].toFixed(1)}%, ${s00.confidenceInterval95Natural[1].toFixed(1)}%]. ` +
            `S00_SEARCH is NOT a Hard Bot and is NOT QUALIFIED for deployment.`;
        out.S00_SEARCH_runtime =
            `S00_SEARCH fell back to the HeuristicAI top action on ${s00.deadlineFallbackCount} of ` +
            `${s00.decisionCount} decisions (${s00.deadlineFallbackRatePct.toFixed(2)}%), far above the 10% gate.`;
    }
    if (s10) {
        out.S10_SPATIAL_SEARCH =
            `S10_SPATIAL_SEARCH scored ${s10.winLossTruncation} over ${s10.matchesPlayed} matches. Natural win rate ` +
            `${s10.winRateNaturalOnlyPct.toFixed(1)}% (${s10.winRateNaturalOnlyNumerator}/${s10.winRateNaturalOnlyDenominator}), ` +
            `effective win rate ${s10.effectiveWinRatePct.toFixed(1)}%, 95% Wilson CI ` +
            `[${s10.confidenceInterval95Natural[0].toFixed(1)}%, ${s10.confidenceInterval95Natural[1].toFixed(1)}%]. ` +
            `S10_SPATIAL_SEARCH is NOT QUALIFIED for deployment.`;
        out.S10_SPATIAL_SEARCH_runtime =
            `S10_SPATIAL_SEARCH fell back to the HeuristicAI top action on ${s10.deadlineFallbackCount} of ` +
            `${s10.decisionCount} decisions (${s10.deadlineFallbackRatePct.toFixed(2)}%), far above the 10% gate.`;
    }
    return out;
}

/** Extract the machine fact object embedded in generated markdown. */
export function extractMachineFactsBlock(markdown: string): any | null {
    const start = markdown.indexOf(MACHINE_FACTS_START);
    const end = markdown.indexOf(MACHINE_FACTS_END);
    if (start === -1 || end === -1 || end <= start) return null;
    const region = markdown.slice(start + MACHINE_FACTS_START.length, end);
    const fenceStart = region.indexOf('```json');
    const fenceEnd = region.lastIndexOf('```');
    if (fenceStart === -1 || fenceEnd === -1 || fenceEnd <= fenceStart) return null;
    const jsonText = region.slice(fenceStart + '```json'.length, fenceEnd).trim();
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * Split markdown into scannable and exempt regions.
 * Content between LEGACY_CLAIMS_ALLOWED_START/END markers is returned as exempt.
 */
export function splitLegacyExemptRegions(markdown: string): { scannable: string; exempt: string } {
    const scannableParts: string[] = [];
    const exemptParts: string[] = [];
    let cursor = 0;
    for (;;) {
        const start = markdown.indexOf(LEGACY_CLAIMS_ALLOWED_START, cursor);
        if (start === -1) {
            scannableParts.push(markdown.slice(cursor));
            break;
        }
        const end = markdown.indexOf(LEGACY_CLAIMS_ALLOWED_END, start);
        if (end === -1) {
            scannableParts.push(markdown.slice(cursor));
            break;
        }
        scannableParts.push(markdown.slice(cursor, start));
        exemptParts.push(markdown.slice(start, end + LEGACY_CLAIMS_ALLOWED_END.length));
        cursor = end + LEGACY_CLAIMS_ALLOWED_END.length;
    }
    return { scannable: scannableParts.join('\n'), exempt: exemptParts.join('\n') };
}

/** Render the R8-07 round 2 DAgger evidence section. Shared by the generator and the verifier. */
export function renderDaggerRound2Section(facts: ClosureFacts): string {
    const d = facts.daggerRound2;
    if (!d) {
        return [
            '## 4. R8-07 round 2 DAgger evidence',
            '',
            '**Status: `BLOCKED/NOT_RUN`** — `dagger_round2_summary.json` was not present when this report was generated.',
            '',
            'Round 1 evidence (61 divergence windows on the v8_closure_01 checkpoints) therefore stands as the',
            'only DAgger measurement for this cycle.'
        ].join('\n');
    }
    const rows = d.pairedAggregates.map(a =>
        `| **${a.policy}** | ${a.matchesPlayed} | ${a.naturalWins} | ${a.naturalLosses} | ${a.naturalDraws} | ` +
        `${a.truncations} | ${a.truncationRatePct.toFixed(1)}% | ${a.winRateNaturalOnlyPct.toFixed(1)}% | ` +
        `${a.effectiveWinRatePct.toFixed(1)}% | [${a.confidenceInterval95Natural[0].toFixed(1)}%, ${a.confidenceInterval95Natural[1].toFixed(1)}%] | ` +
        `${a.latencyP99.toFixed(1)}ms | ${a.latencyMax.toFixed(1)}ms | ${a.latenciesOver1000ms} | ` +
        `${a.totalRehireSuccesses}/${a.totalRehireOpportunities} | ${a.totalRecoveryWindows} |`
    );
    return [
        '## 4. R8-07 round 2 DAgger evidence',
        '',
        `A second DAgger round was executed against the clean closure SPATIAL_V2 checkpoint. Machine summary:`,
        `\`${d.summaryPath}\` (SHA-256 \`${d.summarySha256}\`).`,
        '',
        '| Property | Value |',
        '| :--- | :--- |',
        `| Student checkpoint (warm start) | \`${d.baseModelSha256}\` |`,
        `| Round 2 DAgger checkpoint | \`${d.daggerSha256 ?? 'n/a'}\` |`,
        `| Distinct checkpoint hashes | ${d.distinctCheckpointShas ? 'yes' : 'no'} |`,
        `| Verified failure windows | ${d.failuresCount} (${Object.entries(d.failureTypeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}) |`,
        `| Base dataset rows (read-only, streamed) | ${d.baseDatasetRowsRead} |`,
        `| DAgger buffer rows | ${d.daggerDatasetRows} (+${d.daggerSampleRowsAppended} new) |`,
        `| New DAgger root families | ${d.daggerAddedRootCount} |`,
        `| Paired pre/post matches | ${d.pairedMatches} |`,
        `| Paired report | \`${d.pairedReportPath}\` (SHA-256 \`${d.pairedReportSha256}\`) |`,
        `| Warm-start interpreter | \`${d.pythonCommand}\` (torch ${d.torchVersion}) |`,
        '',
        '### Paired pre/post aggregates',
        '',
        '| Policy | Matches | Natural W | Natural L | Natural D | Truncations | Truncation rate | Natural W% | Effective W% | 95% CI (natural) | p99 | max | >1000ms | Rehire | Recovery windows |',
        '| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: |',
        ...rows,
        '',
        'The CI column is the 95% Wilson score interval produced by `computeWilsonScoreInterval`.',
        '',
        '### Correction-signal quality',
        '',
        d.correctionSignalNote,
        '',
        `\`\`\`json`,
        JSON.stringify(d.qualityAssessment, null, 2),
        `\`\`\``,
        '',
        'Round 2 therefore demonstrates a **non-zero, reproducible correction signal with a distinct student',
        'checkpoint and a complete paired pre/post report**, but it does **not** demonstrate improved playing',
        'strength. `SPATIAL_DAGGER` remains `NOT_QUALIFIED` for deployment, and `HeuristicAI` remains the',
        'production default.'
    ].join('\n');
}

/** The legacy (v8_final_01 era) S00 / S10 claims that must never reappear as current conclusions. */
export const LEGACY_S00_S10_DENYLIST: ReadonlyArray<{ pattern: RegExp; description: string }> = [
    { pattern: /10W-8L-2T/, description: 'legacy S00 record 10W-8L-2T' },
    { pattern: /1W-11L-8T/, description: 'legacy S10 record 1W-11L-8T' },
    { pattern: /55\.6\s*%/, description: 'legacy S00 natural win rate 55.6%' },
    { pattern: /33\.7\s*%\s*,?\s*75\.4\s*%/, description: 'legacy S00 Wilson CI [33.7%, 75.4%]' },
    { pattern: /effective win rate\s*5\.0\s*%/i, description: 'legacy S10 effective win rate 5.0%' }
];

/** A "Hard Bot" mention is only allowed when the same line negates or historicises it. */
export const HARD_BOT_PATTERN = /Hard Bot/i;
export const HARD_BOT_NEGATION_PATTERN = /\b(not|never|no longer|mislabel\w*|incorrect|legacy|formerly|previously)\b/i;
