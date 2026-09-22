/**
 * S8-2 / S8-3 driver: one protocol, frozen weights, new runId.
 *
 * Stages
 *   A. connectivity pilot  - one map x two seats x one seed, to prove the pipeline runs end to end
 *                            before spending the full matrix. Not a strength result.
 *   B. main re-measurement - the same 5 maps x 2 seats x 2 seeds development matrix the v7 report
 *                            used, so the new numbers are comparable to it.
 *
 * Both stages record the exact code commit / dirty patch hash / model SHA / seeds / budget per match,
 * and archive every failure and truncation trajectory plus the commander re-hire failure windows.
 */

import path from 'node:path';
import { mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
    runFullV7BenchmarkSuite,
    computeWilsonScoreInterval,
    collectMatchProvenance,
    BENCHMARK_MAPS,
    DEFAULT_BENCHMARK_PROTOCOL,
    type PolicyType,
    type MatchOutcome,
    type BenchmarkProtocol
} from './v7_unified_evaluation';

const RUN_ID = 'agent_upgrade_20260922_v8_reeval_02';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
// Historical note: v8_reeval_02 evaluated against the initial v7_01 checkpoint baseline.
// Overridable via CHECKPOINT_DIR env var for reproducible re-evaluation across checkpoints.
const CHECKPOINT_DIR = path.resolve(process.env.CHECKPOINT_DIR || 'training_runs/agent_upgrade_20260921_v7_01/checkpoints');

const PILOT_POLICIES: PolicyType[] = [
    'HEURISTIC',
    'SPATIAL_V2',
    'S00_SEARCH',
    'S10_SPATIAL_SEARCH'
];

const MAIN_POLICIES: PolicyType[] = [
    'HEURISTIC',
    'SPATIAL_V2',
    'SPATIAL_DAGGER',
    'NET_A',
    'S00_SEARCH',
    'S10_SPATIAL_SEARCH'
];

function report(line: string): void {
    console.log(line);
}

/** Archive every non-clean match plus the per-window re-hire failures the taskbook asks for. */
function archiveFailures(outcomes: MatchOutcome[], outDir: string, label: string): {
    failureWindows: unknown[];
    truncationTrajectories: string[];
} {
    const failureWindows: unknown[] = [];
    const truncationTrajectories: string[] = [];

    for (const o of outcomes) {
        const isTruncation = o.terminationReason.startsWith('TRUNCATION');
        const isError = o.terminationReason === 'ENGINE_ERROR'
            || o.terminationReason === 'MODEL_LOAD_ERROR'
            || o.terminationReason === 'NOT_RUN';

        if (isTruncation || isError) {
            const src = o.trajectoryLogPath;
            try {
                if (src) {
                    const dest = path.join(outDir, path.basename(src));
                    copyFileSync(src, dest);
                    truncationTrajectories.push(path.relative(process.cwd(), dest).replace(/\\/g, '/'));
                }
            } catch {
                /* trajectory archiving is best effort; the path is still recorded below */
            }
            failureWindows.push({
                matchId: o.matchId,
                failureType: o.terminationReason,
                policy: o.candidatePolicy,
                mapName: o.mapName,
                seed: o.seed,
                seat: o.candidateSeat,
                turns: o.turns,
                steps: o.steps,
                errorDetails: o.errorDetails ?? null,
                trajectoryLogPath: o.trajectoryLogPath
            });
        }

        // A recovery window that never completed is a real re-hire failure and is archived on its own
        // account, regardless of how the match ended.
        const openWindows = o.recoveryWindowCount - o.recoveryCompletedCount;
        if (o.recoveryWindowCount > 0) {
            failureWindows.push({
                matchId: o.matchId,
                failureType: 'REHIRE_WINDOW',
                policy: o.candidatePolicy,
                mapName: o.mapName,
                seed: o.seed,
                seat: o.candidateSeat,
                recoveryWindows: o.recoveryWindowCount,
                recoveryCompleted: o.recoveryCompletedCount,
                recoveryUncompleted: openWindows,
                decisionsInWindows: o.recoveryWindowDurations ?? [],
                decisionOpportunities: o.decisionOpportunityCount,
                rehireSuccesses: o.rehireSuccesses,
                rehireRate: o.rehireRate,
                recoveryWindowCompletionRate: o.recoveryWindowCompletionRate,
                confirmedFailure: openWindows > 0
            });
        }
    }

    writeFileSync(
        path.join(outDir, 'failure_windows.json'),
        JSON.stringify(failureWindows, null, 2),
        'utf8'
    );
    writeFileSync(
        path.join(outDir, 'truncation_trajectories.json'),
        JSON.stringify({ runId: RUN_ID, stage: label, count: truncationTrajectories.length, files: truncationTrajectories }, null, 2),
        'utf8'
    );
    return { failureWindows, truncationTrajectories };
}

async function runStage(opts: {
    stage: string;
    policies: PolicyType[];
    maps: typeof BENCHMARK_MAPS;
    seeds: number[];
    maxTurns: number;
    maxAtomicSteps: number;
    protocol: Partial<BenchmarkProtocol>;
}): Promise<{ outcomes: MatchOutcome[]; reportPath: string }> {
    const stageDir = path.join(RUN_DIR, opts.stage);
    const trajDir = path.join(stageDir, 'trajectories');
    mkdirSync(trajDir, { recursive: true });

    report(`\n=== STAGE ${opts.stage}: ${opts.maps.length} maps x 2 seats x ${opts.seeds.length} seeds x ${opts.policies.length} policies = ${opts.maps.length * 2 * opts.seeds.length * opts.policies.length} matches ===`);

    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: opts.policies,
        maps: opts.maps,
        seeds: opts.seeds,
        maxTurns: opts.maxTurns,
        maxAtomicSteps: opts.maxAtomicSteps,
        protocol: opts.protocol,
        reportPath: path.join(stageDir, 'comparison.json'),
        directories: {
            runId: RUN_ID,
            reportDir: REPORT_DIR,
            runDir: RUN_DIR,
            checkpointDir: CHECKPOINT_DIR,
            trajectoryDir: trajDir
        }
    });

    // Mirror the stage report into the reviewed evidence directory.
    mkdirSync(REPORT_DIR, { recursive: true });
    copyFileSync(path.join(stageDir, 'comparison.json'), path.join(REPORT_DIR, `${opts.stage}_comparison.json`));

    const archived = archiveFailures(res.outcomes, stageDir, opts.stage);
    report(`  archived failure/truncation records: ${archived.failureWindows.length}`);
    report(`  archived truncation trajectories:    ${archived.truncationTrajectories.length}`);

    for (const p of opts.policies) {
        const outs = res.outcomes.filter(o => o.candidatePolicy === p);
        const w = outs.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const l = outs.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const d = outs.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const t = outs.filter(o => o.terminationReason.startsWith('TRUNCATION')).length;
        const e = outs.filter(o => o.terminationReason === 'ENGINE_ERROR').length;
        const ml = outs.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length;
        const nr = outs.filter(o => o.terminationReason === 'NOT_RUN').length;
        const nat = w + l;
        const ci = computeWilsonScoreInterval(w, nat);
        report(
            `  ${p.padEnd(20)} n=${outs.length} W=${w} L=${l} D=${d} T=${t} ERR=${e} LOAD=${ml} NOTRUN=${nr} ` +
            `winNat=${nat > 0 ? (100 * w / nat).toFixed(1) : 'n/a'}% CI=[${ci[0]},${ci[1]}]`
        );
    }

    return { outcomes: res.outcomes, reportPath: path.join(stageDir, 'comparison.json') };
}

async function main(): Promise<void> {
    const provenance = collectMatchProvenance();
    const startedAt = new Date().toISOString();

    report('=======================================================');
    report(`[V8 S8-2/S8-3 Frozen-Weights Same-Protocol Re-Measurement]`);
    report(`Run ID:   ${RUN_ID}`);
    report(`Commit:   ${provenance.codeCommit} (dirty=${provenance.workspaceDirty})`);
    report(`Patch:    ${provenance.dirtyPatchHash ?? '(clean tree)'}`);
    report(`Node:     ${provenance.node} on ${provenance.platform}`);
    report(`Weights:  FROZEN (no training in this run)`);
    report('=======================================================');

    mkdirSync(REPORT_DIR, { recursive: true });
    mkdirSync(RUN_DIR, { recursive: true });

    // ---- Stage A: connectivity pilot (one map, two seats, one seed) ----------------------------
    const pilot = await runStage({
        stage: 'pilot',
        policies: PILOT_POLICIES,
        maps: BENCHMARK_MAPS.slice(0, 1),
        seeds: [42],
        maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
        maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
        protocol: { deterministicReplay: false }
    });

    // ---- Stage B: main comparable re-measurement (the historical 5x2x2 matrix) ------------------
    const main = await runStage({
        stage: 'main',
        policies: MAIN_POLICIES,
        maps: BENCHMARK_MAPS,
        seeds: [42, 1337],
        maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
        maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
        protocol: { deterministicReplay: false }
    });

    // ---- Stage C: fixed-node-budget replay ablation (S8-2) --------------------------------------
    // Same maps/seeds as the pilot, but the search consults no clock, so node consumption is a pure
    // function of the state. This is the replayability check, deliberately kept small.
    const deterministic = await runStage({
        stage: 'deterministic_node_budget',
        policies: ['S00_SEARCH', 'S10_SPATIAL_SEARCH'],
        maps: BENCHMARK_MAPS.slice(0, 1),
        seeds: [42],
        maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
        maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
        protocol: { deterministicReplay: true, searchMaxNodes: 20 }
    });

    // ---- Replay equality check: run stage C's configuration a second time and compare ------------
    const deterministicRepeat = await runStage({
        stage: 'deterministic_node_budget_repeat',
        policies: ['S00_SEARCH', 'S10_SPATIAL_SEARCH'],
        maps: BENCHMARK_MAPS.slice(0, 1),
        seeds: [42],
        maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
        maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
        protocol: { deterministicReplay: true, searchMaxNodes: 20 }
    });

    const key = (o: MatchOutcome): string =>
        `${o.matchId}|${o.terminationReason}|${o.steps}|${o.turns}|${o.searchTotalNodes ?? -1}|${o.searchCandidatesEvaluated ?? -1}|${JSON.stringify(o.decisionLatencies ?? [])}`;
    const first = deterministic.outcomes.map(key).sort();
    const second = deterministicRepeat.outcomes.map(key).sort();
    const replayIdentical = first.length === second.length && first.every((v, i) => v === second[i]);
    report(`\n[Deterministic replay] ${first.length} matches replayed: identical=${replayIdentical}`);
    if (!replayIdentical) {
        for (let i = 0; i < first.length; i++) {
            if (first[i] !== second[i]) {
                report(`  MISMATCH at ${deterministic.outcomes[i]?.matchId}:`);
                report(`    run1: ${first[i]}`);
                report(`    run2: ${second[i]}`);
            }
        }
    }

    // ---- Consolidate --------------------------------------------------------------------------
    const summary = {
        runId: RUN_ID,
        startedAt,
        finishedAt: new Date().toISOString(),
        provenance,
        checkpointDir: CHECKPOINT_DIR,
        protocol: DEFAULT_BENCHMARK_PROTOCOL,
        stages: {
            pilot: { matches: pilot.outcomes.length, report: path.relative(process.cwd(), pilot.reportPath).replace(/\\/g, '/') },
            main: { matches: main.outcomes.length, report: path.relative(process.cwd(), main.reportPath).replace(/\\/g, '/') },
            deterministic_node_budget: { matches: deterministic.outcomes.length },
            deterministic_node_budget_repeat: { matches: deterministicRepeat.outcomes.length }
        },
        deterministicReplayIdentical: replayIdentical
        };
    writeFileSync(path.join(RUN_DIR, 'reeval_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    // Mirror the final stage report the reviewer reads first.
    copyFileSync(path.join(RUN_DIR, 'main/comparison.json'), path.join(REPORT_DIR, 'comparison.json'));

    const mirrored = readdirSync(path.join(RUN_DIR, 'main', 'trajectories'));
    report(`\nMain-stage trajectories written: ${mirrored.length}`);
    report(`Report: ${path.relative(process.cwd(), path.join(REPORT_DIR, 'comparison.json'))}`);
    report(`Deterministic replay identical: ${replayIdentical}`);
}

main().catch(err => {
    console.error('Re-measurement failed:', err);
    process.exit(1);
});
