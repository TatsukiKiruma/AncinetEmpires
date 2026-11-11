import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, createReadStream } from 'node:fs';
import readline from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runStudentDiagnosticAndDAgger } from './v7_counterfactual_dagger';
import { runFullV7BenchmarkSuite } from './v7_unified_evaluation';

/**
 * R8-07: two-seat counterfactual DAgger loop, re-based on the clean closure checkpoints.
 *
 * Everything this test writes goes into a fresh directory under os.tmpdir() and is removed in
 * afterAll. No formal run directory is ever touched: the clean checkpoint, the split manifest and
 * the 7,832-row base dataset are opened read-only.
 */

const REPO_ROOT = path.resolve(process.cwd());
const RUN_ID = 'agent_upgrade_20260921_v8_closure_02';

const CLEAN_STUDENT_MODEL = path.join(
    REPO_ROOT,
    'training_runs',
    RUN_ID,
    'checkpoints/spatial_resnet/spatial_resnet_v2_best.json'
);
const CLEAN_SPLIT_MANIFEST = path.join(REPO_ROOT, 'training_runs', RUN_ID, 'split_manifest.json');
const BASE_DATASET = path.join(
    REPO_ROOT,
    'training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl'
);

const CLEAN_SPATIAL_V2_SHA = '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92';

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'v8_r8_07_dagger_'));
const tmpRunDir = path.join(tmpRoot, 'run');
const tmpReportDir = path.join(tmpRoot, 'report');
const tmpCheckpointDir = path.join(tmpRunDir, 'checkpoints');

const directories = {
    runId: 'r8_07_tmp',
    runDir: tmpRunDir,
    reportDir: tmpReportDir,
    failuresDir: path.join(tmpRunDir, 'failures'),
    datasetDir: path.join(tmpRunDir, 'datasets'),
    checkpointDir: tmpCheckpointDir
};

function sha256File(file: string): string {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function countLines(file: string): Promise<number> {
    let count = 0;
    const rl = readline.createInterface({
        input: createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        if (line.trim()) count++;
    }
    return count;
}

let daggerResult: Awaited<ReturnType<typeof runStudentDiagnosticAndDAgger>> | null = null;

afterAll(() => {
    try {
        rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
        /* best effort cleanup */
    }
});

describe('R8-07 Two-seat counterfactual DAgger loop on the clean closure checkpoint', () => {
    it('R8-07-A: runs a real DAgger round from the clean SPATIAL_V2 checkpoint into a temp directory', async () => {
        expect(existsSync(CLEAN_STUDENT_MODEL)).toBe(true);
        expect(sha256File(CLEAN_STUDENT_MODEL)).toBe(CLEAN_SPATIAL_V2_SHA);
        expect(existsSync(BASE_DATASET)).toBe(true);

        daggerResult = await runStudentDiagnosticAndDAgger({
            studentModelPath: CLEAN_STUDENT_MODEL,
            matchCount: 3,
            maxStepsPerMatch: 24,
            directories,
            baseDatasetPath: BASE_DATASET,
            splitManifestPath: CLEAN_SPLIT_MANIFEST,
            daggerDatasetFileName: 'd_v7_dagger_round2.jsonl',
            roundLabel: 'round2',
            maps: ['(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Duel.aem'],
            opponentSeedBase: 7000,
            replaySeedBase: 91000,
            seatOffset: 1,
            fineTuneEpochs: 1,
            fineTuneBatchSize: 128
        });

        expect(daggerResult.failures.length).toBeGreaterThan(0);
        expect(daggerResult.failureTypeCounts).toBeDefined();
        expect(Object.values(daggerResult.failureTypeCounts).reduce((a, b) => a + b, 0)).toBe(
            daggerResult.failures.length
        );

        // Never write into a formal run directory.
        expect(daggerResult.daggerDatasetPath.startsWith(tmpRoot)).toBe(true);
        if (daggerResult.fineTunedModelPath) {
            expect(daggerResult.fineTunedModelPath.startsWith(tmpRoot)).toBe(true);
        }
        expect(daggerResult.daggerDatasetPath.startsWith(path.join(REPO_ROOT, 'training_runs'))).toBe(false);
    }, 900000);

    it('R8-07-B: the DAgger buffer is strictly larger than the base dataset and adds new root families', async () => {
        expect(daggerResult).not.toBeNull();
        const res = daggerResult!;

        expect(existsSync(res.daggerDatasetPath)).toBe(true);
        expect(res.baseDatasetPath).toBe(BASE_DATASET);
        expect(res.baseDatasetRowsRead).toBeGreaterThan(0);
        expect(res.daggerSampleRowsAppended).toBeGreaterThan(0);

        // Base rows are replayed verbatim, so the DAgger buffer is the base split plus corrections.
        expect(res.daggerDatasetRows).toBe(res.baseDatasetRowsRead + res.daggerSampleRowsAppended);
        expect(res.daggerDatasetRows).toBeGreaterThan(res.baseDatasetRowsRead);

        // Independently recount the written file.
        const writtenRows = await countLines(res.daggerDatasetPath);
        expect(writtenRows).toBe(res.daggerDatasetRows);
        expect(writtenRows).toBeGreaterThan(res.baseDatasetRowsRead);

        // Zero validation leakage: base val rows are retained, never replaced.
        expect(res.baseValRowsRetained).toBeGreaterThan(0);

        const daggerManifest = JSON.parse(readFileSync(res.daggerSplitManifestPath, 'utf8'));
        expect(daggerManifest.daggerAddedRoots.length).toBeGreaterThan(0);
        expect(res.daggerAddedRootCount).toBe(daggerManifest.daggerAddedRoots.length);

        const trainFamilies = new Set<string>(daggerManifest.trainRootFamilies);
        const valFamilies = new Set<string>(daggerManifest.valRootFamilies);
        const leak = [...trainFamilies].filter(f => valFamilies.has(f));
        expect(leak).toEqual([]);
    }, 300000);

    it('R8-07-C: warm-start fine-tuning produces a distinct, loadable DAgger checkpoint', () => {
        expect(daggerResult).not.toBeNull();
        const res = daggerResult!;

        expect(res.fineTunedModelPath).toBeDefined();
        expect(existsSync(res.fineTunedModelPath!)).toBe(true);
        expect(res.baseModelSha256).toBe(CLEAN_SPATIAL_V2_SHA);
        expect(res.daggerSha256).not.toBeNull();
        expect(res.daggerSha256).not.toBe(res.baseModelSha256);

        // The metrics file must exist and report finite losses.
        const metricsPath = path.join(path.dirname(res.fineTunedModelPath!), 'spatial_resnet_dagger_metrics.json');
        expect(existsSync(metricsPath)).toBe(true);
        const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
        expect(JSON.stringify(metrics)).not.toMatch(/NaN|Infinity/);

        // Honest reporting of what the correction signal actually is.
        if (res.policyDivergenceOnly) {
            expect(res.correctionSignalNote).toMatch(/POLICY_DIVERGENCE/);
            expect(res.correctionSignalNote).toMatch(/weaker signal|does not by itself prove/i);
        }
    });

    it('R8-07-D: a paired pre/post evaluation report is produced with complete per-match and per-policy fields', async () => {
        expect(daggerResult).not.toBeNull();
        const res = daggerResult!;

        // Expose the freshly fine-tuned model to the benchmark loader, alongside the clean base model.
        mkdirSync(path.join(tmpCheckpointDir, 'spatial_resnet'), { recursive: true });
        mkdirSync(path.join(tmpCheckpointDir, 'spatial_resnet_dagger'), { recursive: true });
        copyFileSync(CLEAN_STUDENT_MODEL, path.join(tmpCheckpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'));
        copyFileSync(
            res.fineTunedModelPath!,
            path.join(tmpCheckpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json')
        );

        const pairedReportPath = path.join(tmpReportDir, 'dagger_round2_paired_evaluation.json');
        const bench = await runFullV7BenchmarkSuite({
            policiesToEvaluate: ['SPATIAL_V2', 'SPATIAL_DAGGER'],
            maps: [
                { name: '(2) Duel.aem', label: 'Duel' },
                { name: '(2) Liberty Port.aem', label: 'Liberty Port' }
            ],
            seeds: [42],
            maxTurns: 45,
            maxAtomicSteps: 800,
            reportPath: pairedReportPath,
            directories: {
                runId: 'r8_07_tmp',
                runDir: tmpRunDir,
                reportDir: tmpReportDir,
                checkpointDir: tmpCheckpointDir
            }
        });

        expect(existsSync(pairedReportPath)).toBe(true);
        const report = JSON.parse(readFileSync(pairedReportPath, 'utf8'));

        expect(Array.isArray(report.outcomes)).toBe(true);
        expect(report.outcomes.length).toBe(8);
        expect(Object.keys(report.aggregates).sort()).toEqual(['SPATIAL_DAGGER', 'SPATIAL_V2']);

        for (const outcome of report.outcomes) {
            for (const field of [
                'matchId',
                'mapName',
                'seed',
                'candidatePolicy',
                'actualPolicy',
                'terminationReason',
                'turns',
                'steps',
                'decisionLatencies',
                'latencyP99',
                'latencyMax',
                'wallClockExceededCount',
                'deadlineFallbackCount',
                'rehireOpportunities',
                'rehireSuccesses',
                'recoveryWindowCount',
                'trajectoryLogPath'
            ]) {
                expect(outcome[field], `outcome ${outcome.matchId} missing ${field}`).toBeDefined();
            }
            expect(outcome.terminationReason).not.toBe('NOT_RUN');
            expect(outcome.terminationReason).not.toBe('MODEL_LOAD_ERROR');
        }

        for (const policy of ['SPATIAL_V2', 'SPATIAL_DAGGER']) {
            const agg = report.aggregates[policy];
            for (const field of [
                'matchesPlayed',
                'naturalWins',
                'naturalLosses',
                'naturalDraws',
                'truncations',
                'truncationRate',
                'winRateNaturalOnly',
                'confidenceInterval95Natural',
                'effectiveWinRate',
                'confidenceInterval95Effective',
                'latencyP50',
                'latencyP95',
                'latencyP99',
                'latencyMax',
                'latenciesOver1000ms',
                'wallClockExceededMatches',
                'totalDeadlineFallbacks',
                'totalRehireOpportunities',
                'totalRehireSuccesses',
                'totalRecoveryWindows',
                'totalRecoverySuccesses'
            ]) {
                expect(agg[field], `aggregate ${policy} missing ${field}`).toBeDefined();
            }
            expect(agg.matchesPlayed).toBe(4);
        }

        // The paired report is a real pre/post pair: identical seeds/maps, two distinct checkpoints.
        expect(report.aggregates.SPATIAL_V2.matchesPlayed).toBe(report.aggregates.SPATIAL_DAGGER.matchesPlayed);
        expect(bench.outcomes.length).toBe(8);
    }, 600000);
});
