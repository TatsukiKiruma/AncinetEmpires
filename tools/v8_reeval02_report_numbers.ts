/** Compute the exact numbers that go into the evidence package (no hand-arithmetic). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('docs/training/reports/agent_upgrade_20260922_v8_reeval_02');
const RUN = path.resolve('training_runs/agent_upgrade_20260922_v8_reeval_02');
const main = JSON.parse(readFileSync(path.join(RUN, 'main/comparison.json'), 'utf8'));
const pilot = JSON.parse(readFileSync(path.join(RUN, 'pilot/comparison.json'), 'utf8'));

interface O {
    candidatePolicy: string;
    terminationReason: string;
    recoveryWindowCount: number;
    recoveryCompletedCount: number;
    recoveryWindowCompletionRate: number | null;
    rehireOpportunities: number;
    rehireSuccesses: number;
    rehireRate: number | null;
    recoveryWindowDurations?: number[];
    latencyP50: number; latencyP95: number; latencyP99: number; latencyMax: number;
    avgMsPerAction: number;
    wallClockExceededCount?: number;
    searchTotalNodes?: number;
    searchCandidatesEvaluated?: number;
    searchShallowEvaluations?: number;
    decisionOpportunityCount: number;
    steps: number;
}

const policies = ['HEURISTIC', 'SPATIAL_V2', 'SPATIAL_DAGGER', 'NET_A', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];

const lines: string[] = [];
const rows: Record<string, unknown> = {};

for (const p of policies) {
    const outs = main.outcomes.filter((o: O) => o.candidatePolicy === p) as O[];
    const agg = main.aggregates[p];
    const windowDurations = outs.flatMap(o => o.recoveryWindowDurations ?? []);
    const latAll = outs.flatMap((o: O & { decisionLatencies?: number[] }) => o.decisionLatencies ?? []);
    const over1000 = latAll.filter((v: number) => v > 1000).length;
    const maxLat = latAll.length ? Math.max(...latAll) : 0;
    const wcExceeded = outs.filter(o => (o.wallClockExceededCount ?? 0) > 0).length;
    const totalNodes = outs.reduce((a, o) => a + (o.searchTotalNodes ?? 0), 0);
    const totalCands = outs.reduce((a, o) => a + (o.searchCandidatesEvaluated ?? 0), 0);
    const totalDecisions = latAll.length;

    rows[p] = {
        matchesPlayed: agg.matchesPlayed,
        naturalWins: agg.naturalWins,
        naturalLosses: agg.naturalLosses,
        naturalDraws: agg.naturalDraws,
        truncations: agg.truncations,
        truncationRatePct: agg.truncationRate,
        engineErrors: agg.engineErrors,
        modelLoadErrors: agg.modelLoadErrors,
        notRuns: agg.notRuns,
        winRateNaturalOnlyPct: agg.winRateNaturalOnly,
        ci95Natural: agg.confidenceInterval95Natural,
        effectiveWinRatePct: agg.effectiveWinRate,
        ci95Effective: agg.confidenceInterval95Effective,
        rehireOpportunities: agg.totalRehireOpportunities,
        rehireSuccesses: agg.totalRehireSuccesses,
        rehireRatePct: agg.rehireSuccessRate,
        recoveryWindows: agg.totalRecoveryWindows,
        recoveryCompleted: agg.totalRecoverySuccesses,
        recoveryWindowCompletionRatePct: agg.recoveryWindowSuccessRate,
        meanRecoveryWindowDurationDecisions: agg.meanRecoveryWindowDuration,
        recoveryWindowDurations: windowDurations,
        latencyP50: agg.latencyP50,
        latencyP95: agg.latencyP95,
        latencyP99: agg.latencyP99,
        latencyMax: agg.latencyMax,
        observedMaxDecisionMs: Number(maxLat.toFixed(1)),
        decisionsOver1000ms: over1000,
        matchesBreachingSoftBudget: wcExceeded,
        totalSearchNodes: totalNodes,
        totalCandidatesEvaluated: totalCands,
        decisions: totalDecisions,
        avgNodesPerDecision: totalDecisions ? Number((totalNodes / totalDecisions).toFixed(2)) : 0,
        avgCandidatesPerDecision: totalDecisions ? Number((totalCands / totalDecisions).toFixed(2)) : 0
    };

    lines.push(
        `| ${p} | ${agg.matchesPlayed} | ${agg.naturalWins} | ${agg.naturalLosses} | ${agg.naturalDraws} | ${agg.truncations} | ${agg.truncationRate}% | ${agg.engineErrors} | ${agg.modelLoadErrors} | ${agg.notRuns} | ${agg.winRateNaturalOnly}% | [${agg.confidenceInterval95Natural.join(', ')}] | ${agg.effectiveWinRate}% | ${agg.totalRehireOpportunities} | ${agg.totalRehireSuccesses} | ${agg.rehireSuccessRate ?? 'null'} | ${agg.totalRecoveryWindows} | ${agg.totalRecoverySuccesses} | ${agg.recoveryWindowSuccessRate ?? 'null'} | ${agg.meanRecoveryWindowDuration ?? 'null'} | ${agg.latencyP99} | ${Number(maxLat.toFixed(1))} | ${over1000} |`
    );
}

const pilotRows = ['HEURISTIC', 'SPATIAL_V2', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'].map(p => {
    const agg = pilot.aggregates[p];
    return `| ${p} | ${agg.matchesPlayed} | ${agg.naturalWins} | ${agg.naturalLosses} | ${agg.truncations} | ${agg.winRateNaturalOnly}% |`;
});

const out = {
    mainTable: lines,
    pilotTable: pilotRows,
    perPolicy: rows,
    mainProtocol: main.protocol,
    mainProvenance: main.provenance,
    stageSizes: {
        pilot: pilot.outcomes.length,
        main: main.outcomes.length
    }
};

writeFileSync(path.join(RUN, 'report_numbers.json'), JSON.stringify(out, null, 2), 'utf8');

console.log('MAIN TABLE ROWS');
for (const l of lines) console.log(l);
console.log('\nPILOT TABLE ROWS');
for (const l of pilotRows) console.log(l);
console.log('\nPROTOCOL:', JSON.stringify(main.protocol));
console.log('PROVENANCE:', JSON.stringify(main.provenance));
console.log('\nSOFT-BUDGET BREACHES / LATENCY');
for (const p of policies) {
    const r = rows[p] as Record<string, number>;
    console.log(`  ${p.padEnd(20)} matchesBreachingSoft=${r.matchesBreachingSoftBudget}/20 p99=${r.latencyP99} observedMax=${r.observedMaxDecisionMs} over1000=${r.decisionsOver1000ms} avgNodes/dec=${r.avgNodesPerDecision} avgCands/dec=${r.avgCandidatesPerDecision}`);
}
