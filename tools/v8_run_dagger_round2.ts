/**
 * R8-07 round 2: a real two-seat counterfactual DAgger round on the clean closure checkpoint.
 *
 * Writes ONLY into the closure_02 run directory. The clean SPATIAL_V2 / SPATIAL_DAGGER / NET_A
 * checkpoints are copied read-only into a separate `checkpoints_dagger_round2` tree so the verified
 * clean SPATIAL_DAGGER checkpoint is never overwritten.
 *
 * Usage:
 *   node --loader <ts-loader> tools/v8_run_dagger_round2.ts [--match-count 6] [--max-steps 60]
 */

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runStudentDiagnosticAndDAgger } from './v7_counterfactual_dagger';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS } from './v7_unified_evaluation';
import { sha256OfFile } from './v8_closure_facts';

export const RUN_ID = 'agent_upgrade_20260921_v8_closure_02';
const BASE_DATASET = 'training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl';

async function main() {
    const argv = process.argv;
    const readFlag = (name: string): string | undefined => {
        const idx = argv.indexOf(name);
        return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
    };
    const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
    const matchCount = readFlag('--match-count') ? Number(readFlag('--match-count')) : 6;
    const maxSteps = readFlag('--max-steps') ? Number(readFlag('--max-steps')) : 60;

    const runDir = path.join(repoRoot, 'training_runs', RUN_ID);
    const reportDir = path.join(repoRoot, 'docs/training/reports', RUN_ID);
    const round2CheckpointDir = path.join(runDir, 'checkpoints_dagger_round2');
    const datasetDir = path.join(runDir, 'datasets');
    const failuresDir = path.join(runDir, 'failures_dagger_round2');

    const cleanV2 = path.join(runDir, 'checkpoints/spatial_resnet/spatial_resnet_v2_best.json');
    const cleanSplitManifest = path.join(runDir, 'split_manifest.json');
    const baseDatasetPath = path.join(repoRoot, BASE_DATASET);

    for (const required of [cleanV2, cleanSplitManifest, baseDatasetPath]) {
        if (!existsSync(required)) throw new Error(`Required read-only input missing: ${required}`);
    }

    // Mirror the clean base model into the round-2 checkpoint tree so the paired benchmark can
    // load both arms without touching the verified clean checkpoints.
    mkdirSync(path.join(round2CheckpointDir, 'spatial_resnet'), { recursive: true });
    copyFileSync(cleanV2, path.join(round2CheckpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'));
    mkdirSync(datasetDir, { recursive: true });
    mkdirSync(reportDir, { recursive: true });

    console.log('=======================================================');
    console.log(`[R8-07 Round 2] runId=${RUN_ID}`);
    console.log(`student (read-only): ${cleanV2}`);
    console.log(`base dataset (read-only): ${baseDatasetPath}`);
    console.log(`round2 checkpoints: ${round2CheckpointDir}`);
    console.log(`matches=${matchCount} maxSteps=${maxSteps}`);
    console.log('=======================================================');

    const res = await runStudentDiagnosticAndDAgger({
        studentModelPath: path.join(round2CheckpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'),
        matchCount,
        maxStepsPerMatch: maxSteps,
        directories: {
            runId: RUN_ID,
            runDir,
            reportDir,
            failuresDir,
            datasetDir,
            checkpointDir: round2CheckpointDir
        },
        baseDatasetPath,
        splitManifestPath: cleanSplitManifest,
        daggerDatasetFileName: 'd_v7_dagger_round2.jsonl',
        roundLabel: 'round2',
        maps: ['(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Icy Paths.aem'],
        opponentSeedBase: 7000,
        replaySeedBase: 91000,
        seatOffset: 1,
        fineTuneEpochs: 2,
        fineTuneBatchSize: 64
    });

    if (!res.fineTunedModelPath) throw new Error('Round 2 did not produce a fine-tuned checkpoint');

    // Paired pre/post evaluation on the full benchmark grid.
    const pairedReportPath = path.join(reportDir, 'dagger_round2_paired_evaluation.json');
    const bench = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['SPATIAL_V2', 'SPATIAL_DAGGER'],
        maps: BENCHMARK_MAPS,
        seeds: [42, 1337],
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: pairedReportPath,
        directories: {
            runId: RUN_ID,
            runDir,
            reportDir,
            checkpointDir: round2CheckpointDir
        }
    });

    const paired = JSON.parse(readFileSync(pairedReportPath, 'utf8'));
    const failuresPath = path.join(failuresDir, 'failure_windows.json');

    const keyAggregate = (policy: string) => {
        const a = paired.aggregates[policy];
        return {
            policy,
            matchesPlayed: a.matchesPlayed,
            naturalWins: a.naturalWins,
            naturalLosses: a.naturalLosses,
            naturalDraws: a.naturalDraws,
            truncations: a.truncations,
            truncationRatePct: a.truncationRate,
            winRateNaturalOnlyPct: a.winRateNaturalOnly,
            effectiveWinRatePct: a.effectiveWinRate,
            confidenceInterval95Natural: a.confidenceInterval95Natural,
            confidenceInterval95Effective: a.confidenceInterval95Effective,
            latencyP50: a.latencyP50,
            latencyP95: a.latencyP95,
            latencyP99: a.latencyP99,
            latencyMax: a.latencyMax,
            latenciesOver1000ms: a.latenciesOver1000ms,
            wallClockExceededMatches: a.wallClockExceededMatches,
            totalRehireOpportunities: a.totalRehireOpportunities,
            totalRehireSuccesses: a.totalRehireSuccesses,
            totalRecoveryWindows: a.totalRecoveryWindows,
            totalRecoverySuccesses: a.totalRecoverySuccesses,
            checkpointSha256: paired.outcomes.find((o: any) => o.candidatePolicy === policy)?.checkpointSha256 ?? null
        };
    };

    const matchRows = paired.outcomes.map((o: any) => ({
        matchId: o.matchId,
        mapName: o.mapName,
        seed: o.seed,
        candidatePolicy: o.candidatePolicy,
        actualPolicy: o.actualPolicy,
        terminationReason: o.terminationReason,
        turns: o.turns,
        steps: o.steps,
        decisionCount: (o.decisionLatencies ?? []).length,
        latencyP99: o.latencyP99,
        latencyMax: o.latencyMax,
        latenciesOver1000ms: (o.decisionLatencies ?? []).filter((v: number) => v > 1000).length,
        wallClockExceededCount: o.wallClockExceededCount ?? 0,
        deadlineFallbackCount: o.deadlineFallbackCount ?? 0,
        rehireOpportunities: o.rehireOpportunities,
        rehireSuccesses: o.rehireSuccesses,
        recoveryWindowCount: o.recoveryWindowCount,
        recoveryCompletedCount: o.recoveryCompletedCount
    }));

    const summary = {
        runId: RUN_ID,
        roundLabel: res.roundLabel,
        generatedAt: new Date().toISOString(),
        studentModelPath: path.join(round2CheckpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'),
        studentModelSha256: res.baseModelSha256,
        baseDatasetPath: res.baseDatasetPath,
        baseDatasetRowsRead: res.baseDatasetRowsRead,
        baseTrainRowsRetained: res.baseTrainRowsRetained,
        baseValRowsRetained: res.baseValRowsRetained,
        daggerDatasetPath: res.daggerDatasetPath,
        daggerDatasetRows: res.daggerDatasetRows,
        daggerSampleRowsAppended: res.daggerSampleRowsAppended,
        daggerDatasetSha256: sha256OfFile(res.daggerDatasetPath),
        daggerAddedRootCount: res.daggerAddedRootCount,
        splitManifestPath: res.splitManifestPath,
        daggerSplitManifestPath: res.daggerSplitManifestPath,
        failuresPath,
        failuresSha256: existsSync(failuresPath) ? sha256OfFile(failuresPath) : null,
        failuresCount: res.failures.length,
        failureTypeCounts: res.failureTypeCounts,
        policyDivergenceOnly: res.policyDivergenceOnly,
        correctionSignalNote: res.correctionSignalNote,
        fineTunedModelPath: res.fineTunedModelPath,
        daggerSha256: res.daggerSha256,
        distinctCheckpointShas: res.daggerSha256 !== null && res.daggerSha256 !== res.baseModelSha256,
        pythonCommand: res.pythonCommand,
        torchVersion: res.torchVersion,
        pairedReportPath,
        pairedReportSha256: sha256OfFile(pairedReportPath),
        pairedMatches: paired.outcomes.length,
        pairedAggregates: {
            SPATIAL_V2: keyAggregate('SPATIAL_V2'),
            SPATIAL_DAGGER: keyAggregate('SPATIAL_DAGGER')
        },
        pairedMatchesDetail: matchRows,
        qualityAssessment: {
            nonZeroCorrections: res.failures.length > 0,
            distinctShas: res.daggerSha256 !== null && res.daggerSha256 !== res.baseModelSha256,
            datasetGrew: res.daggerDatasetRows > res.baseDatasetRowsRead,
            addedRootFamilies: res.daggerAddedRootCount > 0,
            pairedReportComplete: paired.outcomes.length > 0,
            verdict: res.policyDivergenceOnly
                ? 'Correction signal is divergence-only. Each window is confirmed by counterfactual replay, but no structural blunder class fired, so this round demonstrates behaviour change and label coverage rather than proven tactical blunder repair.'
                : 'Correction signal includes structural blunder classes.'
        }
    };

    const summaryPath = path.join(reportDir, 'dagger_round2_summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log('\n=======================================================');
    console.log(`[R8-07 Round 2] failures=${res.failures.length} types=${JSON.stringify(res.failureTypeCounts)}`);
    console.log(`[R8-07 Round 2] base rows=${res.baseDatasetRowsRead} -> dagger rows=${res.daggerDatasetRows}`);
    console.log(`[R8-07 Round 2] base SHA=${res.baseModelSha256}`);
    console.log(`[R8-07 Round 2] dagger SHA=${res.daggerSha256}`);
    console.log(`[R8-07 Round 2] paired matches=${bench.outcomes.length}`);
    console.log(`[R8-07 Round 2] summary=${summaryPath}`);
    console.log('=======================================================');
}

main().catch(err => {
    console.error('DAgger round 2 failed:', err);
    process.exit(1);
});
