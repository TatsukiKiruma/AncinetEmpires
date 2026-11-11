/**
 * Re-verify the fixed-node-budget replay equality with a gameplay-only fingerprint.
 *
 * The first comparison inside the driver included `decisionLatencies`, which are wall-clock
 * measurements and therefore vary by construction. The determinism claim that matters is that the
 * *game* is reproducible: same actions, same length, same search effort. This script re-checks the
 * two persisted runs on those fields and reports the timing deltas separately.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

interface Outcome {
    matchId: string;
    terminationReason: string;
    steps: number;
    turns: number;
    candidateFinalUnits: number;
    opponentFinalUnits: number;
    searchTotalNodes?: number;
    searchCandidatesEvaluated?: number;
    searchShallowEvaluations?: number;
    wallClockExceededCount?: number;
    deadlineFallbackCount?: number;
    decisionLatencies?: number[];
    candidateSeat: number;
    seed: number;
    actualPolicy: string;
}

const RUN_DIR = path.resolve('training_runs/agent_upgrade_20260922_v8_reeval_02');
const a = JSON.parse(readFileSync(path.join(RUN_DIR, 'deterministic_node_budget/comparison.json'), 'utf8'));
const b = JSON.parse(readFileSync(path.join(RUN_DIR, 'deterministic_node_budget_repeat/comparison.json'), 'utf8'));

const gameplayKey = (o: Outcome): string => JSON.stringify({
    matchId: o.matchId,
    terminationReason: o.terminationReason,
    steps: o.steps,
    turns: o.turns,
    candidateFinalUnits: o.candidateFinalUnits,
    opponentFinalUnits: o.opponentFinalUnits,
    searchTotalNodes: o.searchTotalNodes ?? null,
    searchCandidatesEvaluated: o.searchCandidatesEvaluated ?? null,
    searchShallowEvaluations: o.searchShallowEvaluations ?? null,
    deadlineFallbackCount: o.deadlineFallbackCount ?? 0,
    actualPolicy: o.actualPolicy
});

const keyOf = (list: Outcome[]): string[] => list.map(gameplayKey).sort();

const ka = keyOf(a.outcomes);
const kb = keyOf(b.outcomes);
const identical = ka.length === kb.length && ka.every((v, i) => v === kb[i]);

const mismatches: Array<{ matchId: string; run1: string; run2: string }> = [];
for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) {
        mismatches.push({ matchId: a.outcomes[i]?.matchId ?? `#${i}`, run1: ka[i], run2: kb[i] });
    }
}

// Timing telemetry is expected to differ; quantify it rather than asserting on it.
const timingDeltas: Array<{ matchId: string; meanAbsDeltaMs: number; maxAbsDeltaMs: number; samples: number }> = [];
for (const oa of a.outcomes as Outcome[]) {
    const ob = (b.outcomes as Outcome[]).find(o => o.matchId === oa.matchId);
    if (!ob || !oa.decisionLatencies || !ob.decisionLatencies) continue;
    const n = Math.min(oa.decisionLatencies.length, ob.decisionLatencies.length);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
        const d = Math.abs(oa.decisionLatencies[i] - ob.decisionLatencies[i]);
        sum += d;
        if (d > max) max = d;
    }
    timingDeltas.push({
        matchId: oa.matchId,
        meanAbsDeltaMs: Number((sum / Math.max(1, n)).toFixed(3)),
        maxAbsDeltaMs: Number(max.toFixed(3)),
        samples: n
    });
}

const report = {
    generatedBy: 'reviewing/implementing agent - fixed-node-budget replay re-verification',
    stageA: 'training_runs/agent_upgrade_20260922_v8_reeval_02/deterministic_node_budget/comparison.json',
    stageB: 'training_runs/agent_upgrade_20260922_v8_reeval_02/deterministic_node_budget_repeat/comparison.json',
    protocol: a.protocol ?? null,
    matchesCompared: ka.length,
    gameplayFingerprintFields: [
        'matchId', 'terminationReason', 'steps', 'turns', 'candidateFinalUnits', 'opponentFinalUnits',
        'searchTotalNodes', 'searchCandidatesEvaluated', 'searchShallowEvaluations',
        'deadlineFallbackCount', 'actualPolicy'
    ],
    gameplayIdentical: identical,
    gameplayMismatches: mismatches,
    timingTelemetryExcludedReason:
        'decisionLatencies are wall-clock measurements (performance.now) and are not a reproducible quantity; '
        + 'including them makes any replay comparison fail by construction.',
    timingTelemetryDeltas: timingDeltas,
    conclusion: identical
        ? 'With the search clock removed, two independent runs of the same 4 matches agree on every gameplay and search-effort field; only wall-clock latency telemetry differs.'
        : 'Replay is NOT reproducible even after excluding timing telemetry; see gameplayMismatches.'
};

mkdirSync(path.join(RUN_DIR, 'deterministic_replay_check'), { recursive: true });
writeFileSync(
    path.join(RUN_DIR, 'deterministic_replay_check/replay_equality.json'),
    JSON.stringify(report, null, 2),
    'utf8'
);

console.log(`matches compared:            ${report.matchesCompared}`);
console.log(`gameplay fingerprint equal:  ${identical}`);
console.log(`gameplay mismatches:         ${mismatches.length}`);
for (const t of timingDeltas) {
    console.log(`  timing delta ${t.matchId}: meanAbs=${t.meanAbsDeltaMs}ms maxAbs=${t.maxAbsDeltaMs}ms over ${t.samples} decisions`);
}
console.log(report.conclusion);
