/**
 * V10-fix staged runner.
 *
 * Node child_process is not permitted in this environment, so every phase is
 * split into:
 *   - prepare-*: Node-only data preparation, emits a Python job manifest
 *   - external:  PowerShell runs the emitted python jobs
 *   - eval-*:    Node-only evaluation, reads the resulting models/metrics
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
    RUN_ID, RUN_DIR, REPORT_DIR, V10_DIR,
    ensureDir, getSha256, readJson, writeJson, appendJsonlSync, countLinesSync, readJsonl
} from '../v10_common';
import { collectOnPolicySamples, buildArmDatasets } from '../v10_dagger_controlled';
import { extractEndgameValueSamples, buildValueTrainingDataset, createUnifiedSplitManifest, evaluateValuePredictions, getSamplePartition } from '../v10_value_learning';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS, computeWilsonScoreInterval } from '../v7_unified_evaluation';
import { auditFeatureCollisions } from '../v10_representation_ablation';
import { TurnAwareSearchEngine, runTacticalFixtures } from '../v10_turn_aware_search';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { getBehavioralStateHash } from '../v7_training_pipeline';

const BASE_MODEL_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json');
const BASE_SPLIT_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/split_manifest.json');
const BASE_DATASET_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/datasets/d_v7_spatial.jsonl');
const FIX_DIR = path.resolve('v10/fix_01');
const JOBS_DIR = path.join(FIX_DIR, 'jobs');

interface PythonJob {
    label: string;
    script: string;
    args: string[];
    outputs: string[];
}

function loadPredictor(modelPath: string): SpatialResNetPredictor {
    return new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(modelPath, 'utf8')));
}

function writeJobs(name: string, jobs: PythonJob[]): string {
    ensureDir(JOBS_DIR);
    const file = path.join(JOBS_DIR, `${name}.json`);
    writeJson(file, { generatedAt: new Date().toISOString(), runId: RUN_ID, python: process.env.V10_PYTHON || process.env.PYTHON || 'python', jobs });
    return file;
}

function wilson(wins: number, total: number): [number, number] {
    return computeWilsonScoreInterval(wins, total);
}

function outcomeStats(outcomes: any[], label: string) {
    const wins = outcomes.filter(o => o.terminationReason === 'NATURAL_WIN').length;
    const losses = outcomes.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
    const draws = outcomes.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
    const truncations = outcomes.length - wins - losses - draws;
    const naturalTotal = wins + losses;
    return {
        label,
        matches: outcomes.length,
        wins, losses, draws, truncations,
        naturalWinRate: naturalTotal > 0 ? Number(((wins / naturalTotal) * 100).toFixed(1)) : null,
        winRateAllMatches: outcomes.length > 0 ? Number(((wins / outcomes.length) * 100).toFixed(1)) : null,
        ci95All: wilson(wins, outcomes.length),
        ci95Natural: wilson(wins, Math.max(1, naturalTotal)),
        truncationRate: outcomes.length > 0 ? Number(((truncations / outcomes.length) * 100).toFixed(1)) : null
    };
}

/** T10-01 corrected reading of the historical benchmark. */
function runT10_01Report(): void {
    const historical = readJson<any>(path.resolve('v10/new_checkpoint_benchmark.json'));
    const byPolicy: Record<string, any[]> = {};
    for (const o of historical.outcomes as any[]) {
        (byPolicy[o.candidatePolicy] ||= []).push(o);
    }
    const pureOld = outcomeStats(byPolicy['SPATIAL_V2_OLD'] || [], 'SPATIAL_V2_OLD (pure policy)');
    const pureBest = outcomeStats(byPolicy['SPATIAL_V2_BEST'] || [], 'SPATIAL_V2_BEST (pure policy)');
    const pureLast = outcomeStats(byPolicy['SPATIAL_V2_LAST'] || [], 'SPATIAL_V2_LAST (pure policy)');
    const searchS00 = outcomeStats(byPolicy['S00_SEARCH'] || [], 'S00_SEARCH');
    const searchS10 = outcomeStats(byPolicy['S10_SEARCH_BEST'] || [], 'S10_SEARCH_BEST');
    const heuristic = outcomeStats(byPolicy['HEURISTIC'] || [], 'HEURISTIC');
    const report = {
        task: 'T10-01',
        source: 'v10/new_checkpoint_benchmark.json',
        correctedAt: new Date().toISOString(),
        goal: 'verified playing strength improvement, not documentation volume',
        purePolicyFinding: {
            oldModel: pureOld,
            newBest: pureBest,
            newLast: pureLast,
            netBestMinusOldNaturalWinRate: ((pureBest.naturalWinRate ?? 0) - (pureOld.naturalWinRate ?? 0)).toFixed(1),
            verdict: (pureBest.naturalWinRate ?? 0) > (pureOld.naturalWinRate ?? 0)
                ? 'new best is point-estimate better than old model'
                : 'NO verified pure-policy improvement: new best is not better than the old model on natural terminals'
        },
        searchFinding: {
            s00: searchS00,
            s10: searchS10,
            heuristic,
            verdict: (searchS10.naturalWinRate ?? 0) > (searchS00.naturalWinRate ?? 0)
                ? 'S10(new best + search) point-estimate better than S00'
                : 'NO verified search improvement: S10(new best + search) does not beat S00 on natural terminals'
        },
        baselineRecommendation: {
            strengthBaselineForComparisons: 'S00_SEARCH or HEURISTIC',
            reason: 'The new best checkpoint is weak as a pure policy. S00/Heuristic remain the strength references until a trained student beats them in a frozen protocol.',
            studentInitForLearningLine: 'SPATIAL_V2_BEST',
            studentInitReason: 'The learning line needs a neural student; this does not imply it is already a strength upgrade.'
        },
        caveats: [
            '20 matches per arm is a development sample, not a confirmation set.',
            'S10 truncation rate is high; W/(W+L) ignores truncations and must be read with truncationRate.',
            'seeds only change policy/heuristic RNG; they do not create different initial positions.'
        ]
    };
    writeJson(path.join(V10_DIR, 'T10-01_corrected_report.json'), report);
    console.log('[T10-01 corrected]', JSON.stringify({
        pureBest: pureBest.naturalWinRate,
        pureOld: pureOld.naturalWinRate,
        s00: searchS00.naturalWinRate,
        s10: searchS10.naturalWinRate
    }));
}

/** T10-03 prepare: sample students, build C oversampling, emit python jobs. */
async function prepareT10_03(): Promise<void> {
    ensureDir(FIX_DIR); ensureDir(JOBS_DIR);
    const matches = Number(process.env.V10_DAGGER_MATCHES || 48);
    const maxSteps = Number(process.env.V10_DAGGER_MAX_STEPS || 400);
    const baseTrainRows = 11011;
    const maxTrainSteps = Number(process.env.V10_DAGGER_MAX_TRAIN_STEPS || Math.max(1, Math.ceil(baseTrainRows / 128)));
    const datasetDir = path.join(RUN_DIR, 'dagger_controlled_fix/datasets');
    const ckptDir = path.join(RUN_DIR, 'dagger_controlled_fix/checkpoints');
    ensureDir(datasetDir); ensureDir(ckptDir);

    const baseSha = getSha256(fs.readFileSync(BASE_MODEL_PATH));
    const expected = 'f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153';
    if (baseSha !== expected) throw new Error(`base model SHA mismatch: ${baseSha}`);

    const predictor = loadPredictor(BASE_MODEL_PATH);
    console.log(`[T10-03 prepare] sampling ${matches} matches x ${maxSteps} steps...`);
    const samples = await collectOnPolicySamples(predictor, matches, maxSteps) as any;
    const built = buildArmDatasets(samples, datasetDir);
    const bModel = path.join(ckptDir, 'spatial_resnet_b_best.json');
    const cModel = path.join(ckptDir, 'spatial_resnet_c_best.json');
    const bMetrics = path.join(ckptDir, 'spatial_resnet_b_metrics.json');
    const cMetrics = path.join(ckptDir, 'spatial_resnet_c_metrics.json');
    const bConsumed = path.join(ckptDir, 'spatial_resnet_b_consumed_samples_manifest.json');
    const cConsumed = path.join(ckptDir, 'spatial_resnet_c_consumed_samples_manifest.json');
    const commonArgs = (dataset: string, outModel: string, outMetrics: string, consumed: string) => [
        '--dataset', dataset,
        '--init-checkpoint', BASE_MODEL_PATH,
        '--split-manifest', BASE_SPLIT_PATH,
        '--epochs', '1',
        '--batch-size', '128',
        '--lr', '0.0005',
        '--value-weight', '0.0',
        '--seed', '42',
        '--max-steps', String(maxTrainSteps),
        '--model-version', 'spatial-resnet-v2',
        '--num-blocks', '2',
        '--out-model', outModel,
        '--out-metrics', outMetrics,
        '--consumed-manifest', consumed
    ];
    const jobs: PythonJob[] = [
        { label: 't10-03-arm-b', script: 'python/train_spatial_resnet.py', args: commonArgs(built.armBPath, bModel, bMetrics, bConsumed), outputs: [bModel, bMetrics, bConsumed] },
        { label: 't10-03-arm-c', script: 'python/train_spatial_resnet.py', args: commonArgs(built.armCPath, cModel, cMetrics, cConsumed), outputs: [cModel, cMetrics, cConsumed] }
    ];
    const jobFile = writeJobs('t10_03_jobs', jobs);
    const meta = {
        task: 'T10-03',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        baseModelPath: BASE_MODEL_PATH,
        baseModelSha: baseSha,
        baseSplitPath: BASE_SPLIT_PATH,
        baseDatasetPath: BASE_DATASET_PATH,
        matches, maxSteps, maxTrainSteps,
        samplesCollected: samples.length,
        sampleBreakdown: {
            critical: samples.filter((s: any) => s.category === 'CRITICAL_TACTICAL').length,
            divergence: samples.filter((s: any) => s.category === 'POLICY_DIVERGENCE').length,
            audit: samples.filter((s: any) => s.category === 'AUDIT_STABILITY').length
        },
        datasets: built,
        models: { b: bModel, c: cModel },
        metrics: { b: bMetrics, c: cMetrics },
        consumed: { b: bConsumed, c: cConsumed },
        newSampleIdsFile: path.join(datasetDir, 'new_sample_ids.json'),
        jobFile
    };
    writeJson(meta.newSampleIdsFile, samples.map((s: any) => s.sampleId));
    writeJson(path.join(FIX_DIR, 'T10-03_prepare.json'), meta);
    console.log('[T10-03 prepare] samples=', samples.length, 'C repeat=', built.newSampleRepeat, 'jobs=', jobFile);
}

/** T10-03 evaluate: validate consumption and run 4-seed 3-arm benchmark. */
async function evalT10_03(): Promise<void> {
    const meta = readJson<any>(process.env.V10_T10_03_PREPARE || path.join(FIX_DIR, 'T10-03_prepare.json'));
    for (const file of [meta.models.b, meta.models.c, meta.metrics.b, meta.metrics.c, meta.consumed.b, meta.consumed.c]) {
        if (!fs.existsSync(file)) throw new Error(`T10-03 evaluate missing artifact: ${file}`);
    }
    const bSha = getSha256(fs.readFileSync(meta.models.b));
    const cSha = getSha256(fs.readFileSync(meta.models.c));
    if (bSha === cSha) throw new Error('T10-03 invalid: Arm B and Arm C checkpoint SHA are identical');
    const newIds: string[] = readJson(meta.newSampleIdsFile);
    const cConsumed = readJson<any>(meta.consumed.c);
    const cSet = new Set<string>(cConsumed.train_sample_ids || []);
    const missing = newIds.filter(id => !cSet.has(id));
    if (missing.length > 0) throw new Error(`T10-03 invalid: C consumed manifest missing ${missing.length}/${newIds.length} new sampleIds`);

    const evalReportPath = path.join(REPORT_DIR, 'dagger_controlled_fix_benchmark.json');
    const evalSeeds = (process.env.V10_T10_03_EVAL_SEEDS || '42,1337')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(Number.isFinite);
    console.log(`[T10-03 evaluate] running 3 arms x 5 maps x ${evalSeeds.length} seeds x 2 seats...`);
    const evalRes = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['SPATIAL_V2_BEST', 'SPATIAL_V2_OLD', 'SPATIAL_V2_LAST'],
        maps: BENCHMARK_MAPS,
        seeds: evalSeeds,
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: evalReportPath,
        directories: { runId: RUN_ID },
        checkpointMap: { SPATIAL_V2_BEST: meta.baseModelPath, SPATIAL_V2_OLD: meta.models.b, SPATIAL_V2_LAST: meta.models.c }
    });
    const statsOf = (p: string) => outcomeStats(evalRes.outcomes.filter(o => o.candidatePolicy === p), p);
    const a = statsOf('SPATIAL_V2_BEST');
    const b = statsOf('SPATIAL_V2_OLD');
    const c = statsOf('SPATIAL_V2_LAST');
    const delta = (c.naturalWinRate ?? 0) - (b.naturalWinRate ?? 0);
    const report = {
        task: 'T10-03', title: 'Heuristic教师受控在策略分布纠错 (v10 fix 01)',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        baseModel: { path: meta.baseModelPath, sha256: meta.baseModelSha },
        dataPipeline: {
            matches: meta.matches, maxStepsPerMatch: meta.maxSteps, samplesCollected: meta.samplesCollected,
            sampleBreakdown: meta.sampleBreakdown, newSampleRepeat: meta.datasets.newSampleRepeat,
            baseRows: meta.datasets.baseRows, armCRows: meta.datasets.armCRows,
            maxTrainSteps: meta.maxTrainSteps
        },
        consumptionAudit: {
            newSampleIds: newIds.length,
            missingNewSampleIds: missing.length,
            consumedNewIds: newIds.length - missing.length,
            armBManifest: meta.consumed.b, armCManifest: meta.consumed.c,
            armBTrainSamples: readJson<any>(meta.consumed.b).train_sample_count,
            armCTrainSamples: readJson<any>(meta.consumed.c).train_sample_count,
            invariantPassed: missing.length === 0 && bSha !== cSha
        },
        armB_controlOldData: { sha256: bSha, path: meta.models.b, metrics: readJson<any>(meta.metrics.b) },
        armC_daggerNewData: { sha256: cSha, path: meta.models.c, metrics: readJson<any>(meta.metrics.c) },
        evaluationResults: { armA_baseline: a, armB_control: b, armC_dagger: c },
        findings: {
            deltaArmC_vs_ArmB_naturalWinRate: Number(delta.toFixed(1)),
            verdict: missing.length > 0
                ? 'INVALID: new samples were not consumed.'
                : (delta > 0 ? 'C point-estimate better than B on natural terminals; still development evidence only.'
                    : 'C did not improve over B on natural terminals under equal optimizer steps. Report as no verified gain.')
        }
    };
    writeJson(path.join(V10_DIR, 'dagger_controlled_report.json'), report);
    writeJson(path.join(REPORT_DIR, 'dagger_controlled_report.json'), report);
    console.log('[T10-03 eval]', JSON.stringify({ a: a.naturalWinRate, b: b.naturalWinRate, c: c.naturalWinRate, delta }));
}

const OOD_MAPS = ['(2) Duel.aem', '(2) Liberty Port.aem'];
const SEEN_MAPS = ['(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Mourningstar.aem'];
const RESERVED_TEST_SEEDS = Array.from({ length: 20 }, (_, i) => 9001 + i);

function slugMap(mapName: string): string {
    return mapName.replace(/[^a-zA-Z0-9]/g, '_');
}

function partitionForRoot(mapName: string, seed: number): 'train' | 'val_id' | 'val_ood' | 'test' {
    if (RESERVED_TEST_SEEDS.includes(seed)) return 'test';
    if (OOD_MAPS.includes(mapName)) return 'val_ood';
    const digest = createHash('sha256').update(`${mapName}|${seed}`).digest('hex');
    const bucket = parseInt(digest.slice(0, 8), 16) % 10;
    return bucket < 7 ? 'train' : 'val_id';
}

function toEpisodeRecord(o: any) {
    const isWin = o.terminationReason === 'NATURAL_WIN';
    const isLoss = o.terminationReason === 'NATURAL_LOSS';
    const isDraw = o.terminationReason === 'NATURAL_DRAW';
    const isCensored = !isWin && !isLoss && !isDraw;
    const winnerSeat = isWin ? o.candidateSeat : isLoss ? (1 - o.candidateSeat) : isDraw ? null : null;
    return {
        episodeId: o.matchId,
        rootFamilyId: `root_${slugMap(o.mapName)}_s${o.seed}`,
        mapName: o.mapName,
        mapLabel: (BENCHMARK_MAPS.find((m: any) => m.name === o.mapName) as any)?.label ?? o.mapName,
        seed: o.seed,
        candidateSeat: o.candidateSeat,
        candidatePolicy: o.candidatePolicy,
        opponentPolicy: o.opponentPolicy,
        engineStepCount: o.steps,
        turns: o.turns,
        terminationReason: o.terminationReason,
        winnerSeat,
        candidateOutcome: isWin ? 'WIN' : isLoss ? 'LOSS' : isDraw ? 'DRAW' : 'CENSORED',
        z: isWin ? 1 : isLoss ? -1 : isDraw ? 0 : null,
        isCensored,
        rehireOpportunityCount: o.rehireOpportunities ?? 0,
        rehireSuccessCount: o.rehireSuccesses ?? 0,
        trajectoryLogPath: o.trajectoryLogPath ? path.relative(process.cwd(), o.trajectoryLogPath).split(path.sep).join('/') : ''
    };
}

function replayEpisodeCoverage(ep: any, globalStateHashes: Set<string>): any {
    const coverage = { canRehire: 0, castleBlocked: 0, commanderLowHp: 0, goldHigh: 0, states: 0, replayError: null as string | null };
    if (!ep.trajectoryLogPath || !fs.existsSync(ep.trajectoryLogPath)) {
        coverage.replayError = 'MISSING_TRAJECTORY';
        return coverage;
    }
    try {
        const traj = readJson<any>(ep.trajectoryLogPath);
        const state = createAppApkSkirmishGameState(ep.mapName, 'SD');
        const engine = new GameEngine(state);
        for (const step of (traj.actionHistory || [])) {
            if (engine.isTerminal()) break;
            const cur = engine.getState();
            const player = ep.candidateSeat;
            const hash = getBehavioralStateHash(cur, cur.currentPlayer);
            globalStateHashes.add(hash);
            coverage.states++;
            const playerState = (cur as any).players?.[player];
            if (playerState && playerState.gold > 500) coverage.goldHigh++;
            const commander = (cur.units || []).find((u: any) => u.ownerId === player && u.unitClass === 'commander' && u.hp > 0);
            if (!commander) {
                const legal = engine.getLegalActions(player);
                if (legal.some((a: any) => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && a.unitClass === 'commander')) {
                    coverage.canRehire++;
                }
                // Castle blocked approximation: a friendly non-commander unit stands on owned castle tile.
                for (const u of (cur.units || [])) {
                    if (u.ownerId !== player || u.unitClass === 'commander') continue;
                    const tile = (cur as any).map?.tiles?.[u.pos.y]?.[u.pos.x];
                    if (tile && tile.terrainId === 10 && tile.ownerId === player) {
                        coverage.castleBlocked++;
                        break;
                    }
                }
            } else if (commander.hp < 70) {
                coverage.commanderLowHp++;
            }
            engine.step(step.action);
        }
    } catch (e: any) {
        coverage.replayError = String(e?.message ?? e);
    }
    return coverage;
}

async function collectT10_02(): Promise<void> {
    ensureDir(FIX_DIR); ensureDir(path.join(FIX_DIR, 'raw'));
    const seeds = [1001, 1002, 1003, 1004];
    console.log('[T10-02 collect] running SPATIAL_V2_BEST pure-policy collection', seeds);
    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['SPATIAL_V2_BEST'],
        maps: BENCHMARK_MAPS,
        seeds,
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: path.join(REPORT_DIR, 't10_02_collection_benchmark.json'),
        directories: { runId: RUN_ID },
        checkpointMap: { SPATIAL_V2_BEST: BASE_MODEL_PATH }
    });
    writeJson(path.join(FIX_DIR, 'raw', 't10_02_collection_outcomes.json'), res.outcomes);
    console.log('[T10-02 collect] collected', res.outcomes.length, 'matches');
}

async function buildT10_02(): Promise<void> {
    ensureDir(V10_DIR); ensureDir(path.join(V10_DIR, 'raw'));
    const historical = readJson<any>(path.resolve('v10/new_checkpoint_benchmark.json')).outcomes as any[];
    const collectedPath = path.join(FIX_DIR, 'raw', 't10_02_collection_outcomes.json');
    const collected = fs.existsSync(collectedPath) ? readJson<any>(collectedPath) : [];
    const extraSources: any[] = [];
    const confirmOutcomesPath = path.join(RUN_DIR, 'confirmation', 'outcomes.json');
    if (fs.existsSync(confirmOutcomesPath)) extraSources.push(...readJson<any>(confirmOutcomesPath));
    for (const progressFile of [
        path.join(RUN_DIR, 'confirmation', 'progress.jsonl'),
        path.join(RUN_DIR, 't10_04_formal', 'progress.jsonl'),
        path.join(RUN_DIR, 'value_search', 'progress.jsonl'),
        path.join(RUN_DIR, 'value_extra', 'progress.jsonl')
    ]) {
        if (fs.existsSync(progressFile)) {
            for (const rec of readJsonl<any>(progressFile)) {
                if (Array.isArray(rec.outcomes)) extraSources.push(...rec.outcomes);
            }
        }
    }
    const byMatch = new Map<string, any>();
    for (const o of [...historical, ...collected, ...extraSources]) byMatch.set(o.matchId, o);
    const all = Array.from(byMatch.values());
    const episodes = all.map(toEpisodeRecord);

    // Compute actual root partitions from the collected outcomes only.
    const roots = new Map<string, { mapName: string; seed: number; partition: string }>();
    for (const ep of episodes) {
        if (!roots.has(ep.rootFamilyId)) {
            roots.set(ep.rootFamilyId, { mapName: ep.mapName, seed: ep.seed, partition: partitionForRoot(ep.mapName, ep.seed) });
        }
    }
    const partitions: Record<string, { rootFamilies: string[]; episodeCount: number; naturalTerminalEpisodes: number }> = {
        train: { rootFamilies: [], episodeCount: 0, naturalTerminalEpisodes: 0 },
        val_id: { rootFamilies: [], episodeCount: 0, naturalTerminalEpisodes: 0 },
        val_ood: { rootFamilies: [], episodeCount: 0, naturalTerminalEpisodes: 0 },
        test: { rootFamilies: [], episodeCount: 0, naturalTerminalEpisodes: 0 }
    };
    for (const [root, info] of roots.entries()) {
        partitions[info.partition].rootFamilies.push(root);
    }
    for (const ep of episodes) {
        const part = roots.get(ep.rootFamilyId)!.partition;
        partitions[part].episodeCount++;
        if (!ep.isCensored) partitions[part].naturalTerminalEpisodes++;
    }
    const testRoots: string[] = [];
    for (const mapName of BENCHMARK_MAPS.map((m: any) => m.name)) {
        for (const seed of RESERVED_TEST_SEEDS) {
            testRoots.push(`root_${slugMap(mapName)}_s${seed}`);
        }
    }
    partitions.test.rootFamilies = testRoots;

    // Replay for unique-state / curriculum accounting.
    const globalStateHashes = new Set<string>();
    const curriculum = { canRehire: 0, castleBlocked: 0, commanderLowHp: 0, goldHigh: 0 };
    let replayErrors = 0;
    let engineStepCount = 0;
    for (const ep of episodes) {
        engineStepCount += ep.engineStepCount || 0;
        const cov = replayEpisodeCoverage(ep, globalStateHashes);
        if (cov.replayError) replayErrors++;
        curriculum.canRehire += cov.canRehire;
        curriculum.castleBlocked += cov.castleBlocked;
        curriculum.commanderLowHp += cov.commanderLowHp;
        curriculum.goldHigh += cov.goldHigh;
    }
    for (const ep of episodes) partitions[roots.get(ep.rootFamilyId)!.partition].rootFamilies = Array.from(new Set(partitions[roots.get(ep.rootFamilyId)!.partition].rootFamilies));

    const naturalEpisodes = episodes.filter(e => !e.isCensored).length;
    const manifest = {
        manifestVersion: 'v10-fix-01',
        runId: RUN_ID,
        generatedAt: new Date().toISOString(),
        source: 'historical T10-01 outcomes + T10-02 collection outcomes',
        accounting: {
            engineStepCount,
            scenarioAttemptCount: episodes.length,
            uniqueStateCount: globalStateHashes.size,
            naturalTerminalEpisodes: naturalEpisodes,
            censoredEpisodes: episodes.length - naturalEpisodes,
            trainConsumedCount: 0,
            replayErrors,
            targetNaturalTerminalEpisodes: 100,
            shortfall: Math.max(0, 100 - naturalEpisodes)
        },
        splits: {
            train: { rootFamilyCount: partitions.train.rootFamilies.length, episodeCount: partitions.train.episodeCount, naturalTerminalEpisodes: partitions.train.naturalTerminalEpisodes, roots: partitions.train.rootFamilies.sort() },
            val_id: { rootFamilyCount: partitions.val_id.rootFamilies.length, episodeCount: partitions.val_id.episodeCount, naturalTerminalEpisodes: partitions.val_id.naturalTerminalEpisodes, roots: partitions.val_id.rootFamilies.sort() },
            val_ood: { rootFamilyCount: partitions.val_ood.rootFamilies.length, episodeCount: partitions.val_ood.episodeCount, naturalTerminalEpisodes: partitions.val_ood.naturalTerminalEpisodes, roots: partitions.val_ood.rootFamilies.sort() },
            test: { rootFamilyCount: testRoots.length, episodeCount: 0, naturalTerminalEpisodes: 0, roots: testRoots.sort() }
        },
        curriculumCoverage: {
            mode: 'state replay counts (development instrumentation; not all quota categories are exact)',
            canRehire: { count: curriculum.canRehire, minQuota: 150 },
            castleBlocked: { count: curriculum.castleBlocked, minQuota: 150 },
            commanderLowHp: { count: curriculum.commanderLowHp, minQuota: 150 },
            goldHigh: { count: curriculum.goldHigh, minQuota: 150 }
        },
        endgameOutcomes: {
            naturalWins: episodes.filter(e => e.candidateOutcome === 'WIN').length,
            naturalLosses: episodes.filter(e => e.candidateOutcome === 'LOSS').length,
            naturalDraws: episodes.filter(e => e.candidateOutcome === 'DRAW').length,
            truncations: episodes.filter(e => e.isCensored).length
        }
    };

    // Hard integrity checks.
    const seen = new Map<string, string>();
    for (const part of ['train', 'val_id', 'val_ood', 'test'] as const) {
        const list = part === 'test' ? testRoots : partitions[part].rootFamilies;
        for (const root of list) {
            if (seen.has(root)) throw new Error(`T10-02 split overlap: ${root} in ${seen.get(root)} and ${part}`);
            seen.set(root, part);
        }
    }
    for (const ep of episodes) {
        if (!seen.has(ep.rootFamilyId)) throw new Error(`T10-02 episode root not in split: ${ep.rootFamilyId}`);
    }

    fs.mkdirSync(path.join(V10_DIR), { recursive: true });
    fs.writeFileSync(path.join(V10_DIR, 'episodes.jsonl'), episodes.map(e => JSON.stringify(e)).join('\n') + (episodes.length ? '\n' : ''), 'utf8');
    writeJson(path.join(V10_DIR, 'split_v10.json'), {
        splitVersion: 'v10-fix-01',
        generatedAt: new Date().toISOString(),
        rules: { rootIsolation: true, oodMaps: OOD_MAPS, testSeeds: RESERVED_TEST_SEEDS },
        partitions: manifest.splits
    });
    writeJson(path.join(V10_DIR, 'dataset_v10_manifest.json'), manifest);
    writeJson(path.join(V10_DIR, 'T10-02_summary.json'), manifest);
    console.log('[T10-02 build]', JSON.stringify({
        episodes: episodes.length,
        natural: naturalEpisodes,
        uniqueStates: globalStateHashes.size,
        trainRoots: partitions.train.rootFamilies.length,
        valIdRoots: partitions.val_id.rootFamilies.length,
        valOodRoots: partitions.val_ood.rootFamilies.length,
        replayErrors
    }));
}

async function prepareT10_06(): Promise<void> {
    ensureDir(FIX_DIR); ensureDir(JOBS_DIR);
    const datasetDir = path.join(RUN_DIR, 'value_learning_fix/datasets');
    const ckptDir = path.join(RUN_DIR, 'value_learning_fix/checkpoints');
    ensureDir(datasetDir); ensureDir(ckptDir);

    const valueSamples = extractEndgameValueSamples();
    const datasetPath = path.join(datasetDir, 'd_v10_value_dataset.jsonl');
    const splitManifestPath = path.join(datasetDir, 'v10_value_split_manifest.json');
    const accounting = await buildValueTrainingDataset(valueSamples, datasetPath);
    createUnifiedSplitManifest(splitManifestPath, valueSamples);

    const armDefs = [
        { label: 't10-06-arm1-policy-only', cv: 0.0, model: path.join(ckptDir, 'spatial_resnet_cv0.json'), metrics: path.join(ckptDir, 'spatial_resnet_cv0_metrics.json') },
        { label: 't10-06-arm2-value-01', cv: 0.1, model: path.join(ckptDir, 'spatial_resnet_cv01.json'), metrics: path.join(ckptDir, 'spatial_resnet_cv01_metrics.json') },
        { label: 't10-06-arm3-value-025', cv: 0.25, model: path.join(ckptDir, 'spatial_resnet_cv025.json'), metrics: path.join(ckptDir, 'spatial_resnet_cv025_metrics.json') }
    ];
    const jobs: PythonJob[] = armDefs.map(arm => {
        const consumed = path.join(ckptDir, `${path.basename(arm.model, '.json')}_consumed_samples_manifest.json`);
        return {
            label: arm.label,
            script: 'python/train_spatial_resnet.py',
            args: [
                '--dataset', datasetPath,
                '--init-checkpoint', BASE_MODEL_PATH,
                '--split-manifest', splitManifestPath,
                '--epochs', '1',
                '--batch-size', '128',
                '--lr', '0.0005',
                '--value-weight', String(arm.cv),
                '--seed', '42',
                '--model-version', 'spatial-resnet-v2',
                '--num-blocks', '2',
                '--out-model', arm.model,
                '--out-metrics', arm.metrics,
                '--consumed-manifest', consumed
            ],
            outputs: [arm.model, arm.metrics, consumed]
        };
    });
    const jobFile = writeJobs('t10_06_jobs', jobs);
    const meta = {
        task: 'T10-06',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        datasetPath, splitManifestPath, jobFile,
        datasetAccounting: accounting,
        valueSamples: valueSamples.length,
        naturalSamples: valueSamples.filter(s => s.z !== null).length,
        censoredSamples: valueSamples.filter(s => s.z === null).length,
        arms: armDefs.map((arm, i) => ({ ...arm, consumed: jobs[i].args[jobs[i].args.indexOf('--consumed-manifest') + 1] }))
    };
    writeJson(path.join(FIX_DIR, 'T10-06_prepare.json'), meta);
    console.log('[T10-06 prepare]', JSON.stringify({ samples: valueSamples.length, natural: meta.naturalSamples, trainCount: accounting.trainCount, valId: accounting.valIdCount, valOod: accounting.valOodCount, jobs: jobFile }));
}

async function evalT10_06(): Promise<void> {
    const meta = readJson<any>(path.join(FIX_DIR, 'T10-06_prepare.json'));
    for (const arm of meta.arms) {
        if (!fs.existsSync(arm.model) || !fs.existsSync(arm.metrics)) {
            throw new Error(`T10-06 evaluate missing artifact for ${arm.label}: ${arm.model}`);
        }
    }
    const valueSamples = extractEndgameValueSamples();
    const testSamples = valueSamples.filter(s => {
        const p = getSamplePartition(s);
        return p === 'val_id' || p === 'val_ood';
    });
    if (testSamples.length === 0) throw new Error('T10-06 evaluate found zero held-out value samples');

    const predictors = meta.arms.map((arm: any) => loadPredictor(arm.model));
    const cal = predictors.map((p: any) => evaluateValuePredictions(p, testSamples));
    const metrics = meta.arms.map((arm: any) => readJson<any>(arm.metrics));

    const qualifies = (c: any) => c.pearsonCorrelation > 0.25 && c.overallMse < 0.65 && c.ece < 0.30;
    const arm2Qualified = qualifies(cal[1]);
    const arm3Qualified = qualifies(cal[2]);
    const valueHeadQualified = arm2Qualified || arm3Qualified;
    const selectedIdx = arm3Qualified && !arm2Qualified ? 2 : 1;

    const calibrationReport = {
        task: 'T10-06',
        title: 'Natural Terminal Value Calibration Report (v10 fix 01)',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        splitManifest: meta.splitManifestPath,
        datasetAccounting: {
            totalValueSamplesExtracted: valueSamples.length,
            naturalOutcomeSamples: valueSamples.filter(s => s.z !== null).length,
            censoredOutcomeSamples: valueSamples.filter(s => s.z === null).length,
            evaluationSamples: testSamples.length
        },
        calibrationComparison: {
            arm1_policy_only: { cv: 0.0, sha256: getSha256(fs.readFileSync(meta.arms[0].model)), ...cal[0] },
            arm2_value_weight_01: { cv: 0.1, sha256: getSha256(fs.readFileSync(meta.arms[1].model)), ...cal[1] },
            arm3_value_weight_025: { cv: 0.25, sha256: getSha256(fs.readFileSync(meta.arms[2].model)), ...cal[2] }
        },
        qualificationAudit: {
            valueHeadQualified,
            recommendedForDownstream: valueHeadQualified
                ? { arm: meta.arms[selectedIdx].label, valueWeight: meta.arms[selectedIdx].cv, checkpoint: meta.arms[selectedIdx].model, sha256: getSha256(fs.readFileSync(meta.arms[selectedIdx].model)) }
                : null,
            statusReason: valueHeadQualified
                ? 'Value head passed pre-registered thresholds; still only eligible for search/UI use behind the registry gate.'
                : 'Value head did not meet pre-registered thresholds (pearson > 0.25, MSE < 0.65, ECE < 0.30); valueHeadQualified must remain false and downstream must not use V.',
            productionPolicyImpact: 'UI must not label V output as a confirmed win-rate while valueHeadQualified is false.'
        }
    };
    const ablationReport = {
        task: 'T10-06',
        title: 'Policy vs Value Joint Learning Ablation Report (v10 fix 01)',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        arms: {
            arm1_policy_only: { cv: 0.0, sha256: getSha256(fs.readFileSync(meta.arms[0].model)), valAcc: metrics[0].best_val_acc, valMse: cal[0].overallMse, brierScore: cal[0].brierScore, pearson: cal[0].pearsonCorrelation, ece: cal[0].ece },
            arm2_value_weight_01: { cv: 0.1, sha256: getSha256(fs.readFileSync(meta.arms[1].model)), valAcc: metrics[1].best_val_acc, valMse: cal[1].overallMse, brierScore: cal[1].brierScore, pearson: cal[1].pearsonCorrelation, ece: cal[1].ece },
            arm3_value_weight_025: { cv: 0.25, sha256: getSha256(fs.readFileSync(meta.arms[2].model)), valAcc: metrics[2].best_val_acc, valMse: cal[2].overallMse, brierScore: cal[2].brierScore, pearson: cal[2].pearsonCorrelation, ece: cal[2].ece }
        },
        findings: [
            `Policy-only val_acc=${(metrics[0].best_val_acc * 100).toFixed(2)}%; value MSE=${cal[0].overallMse.toFixed(4)}.`,
            `cv=0.1 val_acc=${(metrics[1].best_val_acc * 100).toFixed(2)}%; value MSE=${cal[1].overallMse.toFixed(4)}; pearson=${cal[1].pearsonCorrelation.toFixed(4)}; ECE=${cal[1].ece.toFixed(4)}.`,
            `cv=0.25 val_acc=${(metrics[2].best_val_acc * 100).toFixed(2)}%; value MSE=${cal[2].overallMse.toFixed(4)}; pearson=${cal[2].pearsonCorrelation.toFixed(4)}; ECE=${cal[2].ece.toFixed(4)}.`,
            valueHeadQualified
                ? 'A value head passed qualification; do not enable UI/search use until it is registered and re-validated in matches.'
                : 'No value head passed qualification; do not use V in UI or search, and do not use this value model as the expert-iteration initial student.'
        ],
        recommendedSetting: valueHeadQualified
            ? { valueWeight: meta.arms[selectedIdx].cv, selectedCheckpoint: meta.arms[selectedIdx].model, selectedSha256: getSha256(fs.readFileSync(meta.arms[selectedIdx].model)) }
            : null
    };

    writeJson(path.join(V10_DIR, 'value_calibration.json'), calibrationReport);
    writeJson(path.join(V10_DIR, 'policy_value_ablation.json'), ablationReport);
    writeJson(path.join(REPORT_DIR, 'value_calibration.json'), calibrationReport);
    writeJson(path.join(REPORT_DIR, 'policy_value_ablation.json'), ablationReport);
    writeJson(path.join(V10_DIR, 'value_gate.json'), {
        valueHeadQualified,
        recommendedForDownstream: calibrationReport.qualificationAudit.recommendedForDownstream,
        policyValueAblationReport: path.join(V10_DIR, 'policy_value_ablation.json'),
        valueCalibrationReport: path.join(V10_DIR, 'value_calibration.json')
    });
    console.log('[T10-06 eval]', JSON.stringify({ qualified: valueHeadQualified, arm1: { mse: cal[0].overallMse, pearson: cal[0].pearsonCorrelation }, arm2: { mse: cal[1].overallMse, pearson: cal[1].pearsonCorrelation }, arm3: { mse: cal[2].overallMse, pearson: cal[2].pearsonCorrelation } }));
}

function splitRootMapForEval(manifestPath?: string): Map<string, string> {
    const map = new Map<string, string>();
    const splitPath = manifestPath || path.join(V10_DIR, 'split_v10.json');
    if (!fs.existsSync(splitPath)) return map;
    const split = readJson<any>(splitPath);
    if (split?.partitions) {
        for (const part of ['train', 'val_id', 'val_ood', 'test'] as const) {
            const roots = split.partitions?.[part]?.roots ?? split.partitions?.[part]?.rootFamilies ?? [];
            for (const root of roots) map.set(String(root), part);
        }
        return map;
    }
    for (const root of (split.trainRootFamilies || [])) map.set(String(root), 'train');
    for (const root of (split.valRootFamilies || [])) map.set(String(root), 'val_id');
    for (const root of (split.testRootFamilies || [])) map.set(String(root), 'test');
    return map;
}

async function evaluatePolicyAccuracy(
    modelPath: string,
    datasetPath: string,
    rootMap: Map<string, string>,
    targetPartition: 'train' | 'val_id' | 'val_ood',
    maxSamples: number
): Promise<{ partition: string; samples: number; accuracy: number | null }> {
    const predictor = loadPredictor(modelPath);
    let seen = 0;
    let correct = 0;
    const stream = fs.createReadStream(datasetPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (seen >= maxSamples) break;
        if (!line.trim()) continue;
        let sample: any;
        try { sample = JSON.parse(line); } catch { continue; }
        const rootPart = rootMap.get(String(sample.rootFamilyId));
        if (targetPartition === 'train' && rootPart !== 'train') continue;
        if (targetPartition === 'val_id' && rootPart !== 'val_id') continue;
        if (targetPartition === 'val_ood' && rootPart !== 'val_ood') continue;
        const encoded = {
            spatialTensor: new Float32Array(sample.spatialTensor),
            globalFeatures: new Float32Array(sample.globalFeatures),
            mapWidth: 20,
            mapHeight: 20,
            subjectPlayerId: Number(sample.playerId ?? 0),
            version: 'v2' as const
        };
        const cand = (sample.candidateActions || []).map((c: any) => ({
            actorCoord: c.actorCoord,
            landingCoord: c.landingCoord,
            targetCoord: c.targetCoord,
            semantics: new Float32Array(c.semantics)
        }));
        if (cand.length === 0) continue;
        const out = predictor.predict(encoded as any, cand);
        seen++;
        if (out.bestActionIndex === sample.targetActionIndex) correct++;
    }
    return { partition: targetPartition, samples: seen, accuracy: seen > 0 ? Number(((correct / seen) * 100).toFixed(2)) : null };
}

async function prepareT10_05(): Promise<void> {
    ensureDir(FIX_DIR); ensureDir(JOBS_DIR);
    const ckptDir = path.join(RUN_DIR, 'representation_fix/checkpoints');
    ensureDir(ckptDir);
    const t1006MetaPath = path.join(FIX_DIR, 'T10-06_prepare.json');
    const splitManifest = fs.existsSync(t1006MetaPath)
        ? readJson<any>(t1006MetaPath).splitManifestPath
        : BASE_SPLIT_PATH;
    const datasetPath = BASE_DATASET_PATH;
    const arms = [
        { label: 't10-05-arm1-2block', blocks: 2, gap: false },
        { label: 't10-05-arm2-2block-gap', blocks: 2, gap: true },
        { label: 't10-05-arm3-4block', blocks: 4, gap: false }
    ];
    const jobs: PythonJob[] = arms.map(arm => {
        const model = path.join(ckptDir, `${arm.label}.json`);
        const metrics = path.join(ckptDir, `${arm.label}_metrics.json`);
        return {
            label: arm.label,
            script: 'python/train_spatial_resnet.py',
            args: [
                '--dataset', datasetPath,
                '--init-checkpoint', BASE_MODEL_PATH,
                '--split-manifest', splitManifest,
                '--epochs', '1',
                '--batch-size', '128',
                '--lr', '0.0005',
                '--value-weight', '0.0',
                '--seed', '42',
                '--model-version', 'spatial-resnet-v2',
                '--num-blocks', String(arm.blocks),
                ...(arm.gap ? ['--global-policy-pool'] : []),
                '--out-model', model,
                '--out-metrics', metrics,
                '--consumed-manifest', path.join(ckptDir, `${arm.label}_consumed_samples_manifest.json`)
            ],
            outputs: [model, metrics]
        };
    });
    const jobFile = writeJobs('t10_05_jobs', jobs);
    const meta = {
        task: 'T10-05', generatedAt: new Date().toISOString(), runId: RUN_ID,
        datasetPath, splitManifest, jobFile,
        arms: arms.map((arm, i) => ({ ...arm, model: jobs[i].args[jobs[i].args.indexOf('--out-model') + 1], metrics: jobs[i].args[jobs[i].args.indexOf('--out-metrics') + 1] }))
    };
    writeJson(path.join(FIX_DIR, 'T10-05_prepare.json'), meta);
    console.log('[T10-05 prepare] jobs=', jobFile, 'split=', splitManifest);
}

async function evalT10_05(): Promise<void> {
    const meta = readJson<any>(path.join(FIX_DIR, 'T10-05_prepare.json'));
    for (const arm of meta.arms) {
        if (!fs.existsSync(arm.model) || !fs.existsSync(arm.metrics)) throw new Error(`T10-05 missing artifact: ${arm.model}`);
    }
    const rootMap = splitRootMapForEval(path.join(V10_DIR, 'split_v10.json'));
    const t1006MetaPath = path.join(FIX_DIR, 'T10-06_prepare.json');
    const evalDatasetPath = fs.existsSync(t1006MetaPath) ? readJson<any>(t1006MetaPath).datasetPath : meta.datasetPath;
    const maxSamples = Number(process.env.V10_T10_05_EVAL_SAMPLES || 400);
    const evaluations: any = {};
    for (const arm of meta.arms) {
        const metrics = readJson<any>(arm.metrics);
        const valId = await evaluatePolicyAccuracy(arm.model, evalDatasetPath, rootMap, 'val_id', maxSamples);
        const valOod = await evaluatePolicyAccuracy(arm.model, evalDatasetPath, rootMap, 'val_ood', maxSamples);
        evaluations[arm.label] = {
            blocks: arm.blocks,
            globalPolicyPool: arm.gap,
            checkpointSha256: getSha256(fs.readFileSync(arm.model)),
            trainAcc: metrics.history?.[0]?.train_acc ?? null,
            pythonValAcc: metrics.best_val_acc,
            valIdAcc: valId.accuracy,
            valIdSamples: valId.samples,
            valOodAcc: valOod.accuracy,
            valOodSamples: valOod.samples
        };
    }
    const labels = Object.keys(evaluations);
    const arm1 = evaluations[labels[0]];
    const arm2 = evaluations[labels[1]];
    const arm3 = evaluations[labels[2]];
    const collisionAudit = auditFeatureCollisions();
    const report = {
        task: 'T10-05',
        title: '有限表示/损失对照与特征碰撞审查报告 (v10 fix 01)',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        collisionAudit,
        representationArms: evaluations,
        evaluationProtocol: { dataset: evalDatasetPath, splitManifest: path.join(V10_DIR, 'split_v10.json'), maxSamplesPerPartition: maxSamples, metric: 'policy top-1 accuracy' },
        keyFindings: [
            `Arm1 2-block: val_id=${arm1.valIdAcc}%, val_ood=${arm1.valOodAcc}%.`,
            `Arm2 2-block+GAP: val_id=${arm2.valIdAcc}%, val_ood=${arm2.valOodAcc}%.`,
            `Arm3 4-block: val_id=${arm3.valIdAcc}%, val_ood=${arm3.valOodAcc}%.`,
            (Number(arm2.valOodAcc ?? 0) > Number(arm3.valOodAcc ?? 0))
                ? 'GAP Arm2 OOD point-estimate is higher than deeper Arm3; treat as development evidence only.'
                : 'GAP Arm2 did not beat deeper Arm3 on this OOD sample; no architecture winner is declared.',
            'Equivalence/soft-ranking loss and teacherQ are not yet implemented; do not claim them as done.'
        ],
        recommendedNextStep: 'Keep 2-block as production inference baseline until a representation change wins with multiple seeds and an independent confirmation set.'
    };
    writeJson(path.join(V10_DIR, 'representation_ablation.json'), report);
    writeJson(path.join(REPORT_DIR, 'representation_ablation.json'), report);
    console.log('[T10-05 eval]', JSON.stringify({ arm1: arm1.valOodAcc, arm2: arm2.valOodAcc, arm3: arm3.valOodAcc }));
}

async function gateT10_07(): Promise<void> {
    ensureDir(V10_DIR);
    const daggerPath = path.join(V10_DIR, 'dagger_controlled_report.json');
    const valueGatePath = path.join(V10_DIR, 'value_gate.json');
    const dagger = fs.existsSync(daggerPath) ? readJson<any>(daggerPath) : null;
    const valueGate = fs.existsSync(valueGatePath) ? readJson<any>(valueGatePath) : null;
    const reasons: string[] = [];
    let learningGain = false;
    let valueQualified = false;
    if (!dagger) {
        reasons.push('T10-03 corrected report missing.');
    } else {
        const consumed = dagger.consumptionAudit?.invariantPassed === true;
        const delta = Number(dagger.findings?.deltaArmC_vs_ArmB_naturalWinRate ?? 0);
        learningGain = consumed && delta > 0;
        if (!consumed) reasons.push('T10-03 consumption invariant failed.');
        if (!(delta > 0)) reasons.push(`T10-03 has no positive natural-terminal gain (delta=${delta}).`);
    }
    if (!valueGate) {
        reasons.push('T10-06 value qualification gate missing.');
    } else {
        valueQualified = valueGate.valueHeadQualified === true;
        if (!valueQualified) reasons.push('T10-06 value head is not qualified.');
    }

    const allowed = learningGain || valueQualified;
    const deliverable = {
        task: 'T10-07',
        title: 'Offline Planning to Student Expert Iteration Round 1',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        status: allowed ? 'PREREQUISITES_MET_IMPLEMENTATION_PENDING' : 'NOT_RUN',
        prerequisites: {
            t10_03_verified_learning_gain: learningGain,
            t10_06_value_head_qualified: valueQualified,
            conditionalDependency: 'Requires at least one verified learning improvement from T10-03 or T10-06.'
        },
        reasons: allowed ? [] : reasons,
        note: allowed
            ? 'Prerequisites passed. The corrected expert-iteration run must still be implemented and executed; nothing is claimed here yet.'
            : 'Correctly skipped instead of producing an invalid expert-iteration claim.'
    };
    writeJson(path.join(V10_DIR, 'expert_iteration_round1.json'), deliverable);
    writeJson(path.join(REPORT_DIR, 'expert_iteration_round1.json'), deliverable);
    console.log('[T10-07 gate]', JSON.stringify({ allowed, learningGain, valueQualified, reasons }));
}

async function gateT10_08(): Promise<void> {
    ensureDir(V10_DIR);
    const valueGatePath = path.join(V10_DIR, 'value_gate.json');
    const daggerPath = path.join(V10_DIR, 'dagger_controlled_report.json');
    const valueGate = fs.existsSync(valueGatePath) ? readJson<any>(valueGatePath) : null;
    const dagger = fs.existsSync(daggerPath) ? readJson<any>(daggerPath) : null;
    const blockerReasons: string[] = [];
    if (!dagger || dagger.consumptionAudit?.invariantPassed !== true) blockerReasons.push('T10-03 is not a verified controlled result.');
    if (!valueGate?.valueHeadQualified) blockerReasons.push('No qualified value head (option not required for deployment, but cannot claim value-based strength).');
    blockerReasons.push('No frozen candidate has passed the P0 gates and no 400-match confirmation run has been executed.');

    const confirmation = {
        task: 'T10-08',
        title: '冻结确认与真实浏览器验收',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        status: 'NOT_RUN',
        reasons: blockerReasons,
        requiredBeforeRun: [
            'P0 correctness fixes complete and reports marked with their true status.',
            'A candidate is frozen by a pre-registered rule after T10-01/T10-03/T10-06.',
            'Test roots used by the frozen protocol have not been used in training or model selection.',
            '400-match paired confirmation budget is available.'
        ],
        defaultProductionPolicyUnchanged: true
    };
    const browser = {
        task: 'T10-08',
        title: 'Browser E2E acceptance',
        executedAt: new Date().toISOString(),
        status: 'NOT_RUN',
        reason: 'Offline candidate gates did not pass; starting browser deployment acceptance would imply a release that is not justified.',
        requiredChecks: ['new SHA loads', 'cold/warm start', 'long turn', 'cancel/restart/map change', 'timeout fallback including fallback timing']
    };
    writeJson(path.join(V10_DIR, 'confirmation_results.json'), confirmation);
    writeJson(path.join(V10_DIR, 'browser_e2e.json'), browser);
    writeJson(path.join(REPORT_DIR, 'confirmation_results.json'), confirmation);
    writeJson(path.join(REPORT_DIR, 'browser_e2e.json'), browser);
    console.log('[T10-08 gate] NOT_RUN:', blockerReasons.join(' | '));
}

function t10_04CorrectedReport(): void {
    const profile = readJson<any>(path.resolve('v10/turn_search_profile.json'));
    const comparison = readJson<any>(path.resolve('v10/search_comparison.json'));
    const corrected = {
        task: 'T10-04',
        correctedAt: new Date().toISOString(),
        status: 'PARTIAL_NOT_COMPLETE',
        realFixtureResults: profile.tacticalFixtures,
        fixtureAssessment: {
            fixture_1_lethal_depth_defense: 'INVALID as a threat test: it never placed a genuine lethal enemy unit; passed only required a non-end-turn action.',
            fixture_2_multi_unit_handover: 'Observed handover, but it is near-trivial on the default opening position.',
            fixture_3_equal_work_transition_scan: 'INVALID as a quality comparison: budgets 256 and 1024 both completed after 160 transitions / 29 candidate macros, so the higher budget was never exercised.'
        },
        comparison: {
            status: 'NOT_RUN',
            reason: 'No old-search vs new-search 80-match development comparison exists. The code path also never used a network prior, so the real/off/shuffled prior ablation and prior-candidate adoption rate were not produced.',
            historicalComparisonReport: comparison
        },
        requiredToComplete: [
            'Use the predictor in TurnAwareSearchEngine for real/off/shuffled prior proposals.',
            'Run a paired 80-match old-search vs new equal-work search comparison.',
            'Instrument dangerous action rank >= 9, move-then-attack chains, and candidate-level transition accounting.',
            'Replace the fixture booleans with pass conditions that fail on the old serializer.'
        ]
    };
    writeJson(path.join(V10_DIR, 'turn_search_profile.json'), corrected);
    writeJson(path.join(V10_DIR, 'search_comparison.json'), corrected.comparison);
    writeJson(path.join(REPORT_DIR, 'turn_search_profile.json'), corrected);
    writeJson(path.join(REPORT_DIR, 'search_comparison.json'), corrected.comparison);
    console.log('[T10-04 corrected] status=', corrected.status);
}

async function runT10_04(): Promise<void> {
    ensureDir(V10_DIR);
    const predictor = loadPredictor(BASE_MODEL_PATH);
    const searcher = new TurnAwareSearchEngine(new HeuristicAI(), predictor);
    const fixtures = runTacticalFixtures(searcher);
    const comparison = {
        task: 'T10-04',
        status: 'NOT_RUN_FOR_MATCH_COMPARISON',
        reason: 'Fixtures and prior instrumentation were executed, but the full paired old-search vs new-search 80-match comparison has not yet been run in this session.',
        priorModesInstrumented: ['off', 'real', 'shuffled']
    };
    const report = {
        task: 'T10-04',
        title: 'Turn-Aware Search Fixture & Prior Instrumentation (v10 fix 01)',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        realFixtureResults: fixtures,
        matchComparison: comparison,
        caveats: [
            'Fixture pass conditions are now non-trivial for fixture 1 (adjacent lethal threat) but should still be expanded with rank>=9 and two-unit combo fixtures.',
            'The match comparison is intentionally marked NOT_RUN rather than overclaimed.'
        ]
    };
    writeJson(path.join(V10_DIR, 'turn_search_profile.json'), report);
    writeJson(path.join(REPORT_DIR, 'turn_search_profile.json'), report);
    writeJson(path.join(V10_DIR, 'search_comparison.json'), comparison);
    writeJson(path.join(REPORT_DIR, 'search_comparison.json'), comparison);
    console.log('[T10-04 run] fixtures=', JSON.stringify(fixtures).slice(0, 500));
}

async function compareT10_04(): Promise<void> {
    ensureDir(V10_DIR);
    const evalSeeds = (process.env.V10_T10_04_SEEDS || '42,1337').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['S00_SEARCH', 'T10_TURN_SEARCH'],
        maps: BENCHMARK_MAPS,
        seeds: evalSeeds,
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: path.join(REPORT_DIR, 't10_04_search_comparison_benchmark.json'),
        directories: { runId: RUN_ID }
    });
    const stats = (policy: string) => outcomeStats(res.outcomes.filter(o => o.candidatePolicy === policy), policy);
    const s00 = stats('S00_SEARCH');
    const turn = stats('T10_TURN_SEARCH');
    const report = {
        task: 'T10-04',
        status: 'DEV_20_MATCHES_PER_ARM',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        protocol: { maps: BENCHMARK_MAPS.map(m => m.name), seeds: evalSeeds, matchesPerArm: 20, maxTransitions: 128 },
        results: { s00_search: s00, turn_aware_search: turn },
        verdict: (turn.naturalWinRate ?? 0) > (s00.naturalWinRate ?? 0)
            ? 'Turn-aware search point-estimate is above S00; this is development evidence only, not an 80-match confirmation.'
            : 'Turn-aware search did not beat S00 in this 20-match development run; do not claim a search upgrade.',
        caveat: 'This is 20 matches/arm, not the 80-match comparison specified by T10-04; treat as a smoke comparison only.'
    };
    writeJson(path.join(V10_DIR, 'search_comparison.json'), report);
    writeJson(path.join(REPORT_DIR, 'search_comparison.json'), report);
    console.log('[T10-04 compare]', JSON.stringify({ s00: s00.naturalWinRate, turn: turn.naturalWinRate, s00W: s00.wins, turnW: turn.wins }));
}

async function main(): Promise<void> {
    const cmd = process.argv[2];
    if (cmd === 't10-01-report') return runT10_01Report();
    if (cmd === 'prepare-t10-03') return prepareT10_03();
    if (cmd === 'eval-t10-03') return evalT10_03();
    if (cmd === 'collect-t10-02') return collectT10_02();
    if (cmd === 'build-t10-02') return buildT10_02();
    if (cmd === 'prepare-t10-06') return prepareT10_06();
    if (cmd === 'eval-t10-06') return evalT10_06();
    if (cmd === 'prepare-t10-05') return prepareT10_05();
    if (cmd === 'eval-t10-05') return evalT10_05();
    if (cmd === 'gate-t10-07') return gateT10_07();
    if (cmd === 'gate-t10-08') return gateT10_08();
    if (cmd === 't10-04-report') return t10_04CorrectedReport();
    if (cmd === 't10-04-run') return runT10_04();
    if (cmd === 't10-04-compare') return compareT10_04();
    throw new Error(`Unknown command: ${cmd}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
