/**
 * V10 T10-03: Controlled On-Policy DAgger with Heuristic Teacher
 *
 * Implements:
 * 1. Student on-policy rollouts starting from SPATIAL_V2_BEST (f4c8f14b...)
 * 2. Multi-category label collection:
 *    - CRITICAL_TACTICAL_ERROR: Verified blunder (missed rehire, castle blocked, suicide attack, lethal ignore)
 *    - POLICY_DIVERGENCE: Student differs from Heuristic teacher
 *    - AUDIT_STABILITY: Agreement states sampled to preserve baseline skills
 * 3. Strict 3-arm comparison:
 *    - Arm A: Baseline (unfine-tuned f4c8f14b...)
 *    - Arm B: Continued fine-tuning on OLD data only
 *    - Arm C: Continued fine-tuning on OLD + NEW on-policy data (25% target mix)
 *    Same initial weights, same learning rate (0.0005), same batch size (128), same optimizer, same seed.
 * 4. Paired evaluation comparing Arm A vs Arm B vs Arm C with tactical blunder accounting.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState } from '../src/game/types';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { predictSpatialAction } from '../src/game/ai/shared_spatial_policy';
import { evaluatePositionHeuristic } from './v7_heuristic_bounded_search';
import { getBehavioralStateHash } from './v7_training_pipeline';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS, DEFAULT_BENCHMARK_PROTOCOL, computeWilsonScoreInterval } from './v7_unified_evaluation';
import { appendJsonlSync, assert, isMain, readJson, runPythonScript } from './v10_common';

export const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260923_v10_fix_01';
export const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
export const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
export const V10_DIR = path.resolve(process.env.V10_OUT_DIR || 'v10/fix_01');

const BASE_MODEL_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json');
const BASE_DATASET_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/datasets/d_v7_spatial.jsonl');
const BASE_SPLIT_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/split_manifest.json');

function getSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

export interface CollectedSample {
    sampleId: string;
    category: 'CRITICAL_TACTICAL' | 'POLICY_DIVERGENCE' | 'AUDIT_STABILITY';
    mapName: string;
    turn: number;
    step: number;
    stateHash: string;
    studentAction: Action;
    teacherAction: Action;
    rawSample: any;
}

export function detectTacticalCategory(
    state: GameState,
    playerId: number,
    studentAct: Action,
    teacherAct: Action,
    legalActions: Action[]
): 'CRITICAL_TACTICAL' | 'POLICY_DIVERGENCE' | 'AUDIT_STABILITY' {
    if (JSON.stringify(studentAct) === JSON.stringify(teacherAct)) {
        return 'AUDIT_STABILITY';
    }

    // 1. Missed rehire check
    const canRehire = legalActions.some(a =>
        (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') &&
        (a as any).unitClass === 'commander'
    );
    if (canRehire) {
        const studentRehired = (studentAct.type === 'recruit_to_castle' || studentAct.type === 'recruit_and_deploy') && (studentAct as any).unitClass === 'commander';
        if (!studentRehired) {
            return 'CRITICAL_TACTICAL';
        }
    }

    // 2. Castle blocked check: friendly unit on castle when commander dead & rehire ready
    const hasCommander = state.units.some(u => u.ownerId === playerId && u.unitClass === 'commander' && u.hp > 0);
    if (!hasCommander) {
        let castlePos: { x: number; y: number } | null = null;
        for (let y = 0; y < state.map.height; y++) {
            for (let x = 0; x < state.map.width; x++) {
                if (state.map.tiles[y][x].terrainId === 10 && state.map.tiles[y][x].ownerId === playerId) {
                    castlePos = { x, y };
                    break;
                }
            }
            if (castlePos) break;
        }
        if (castlePos) {
            const occupier = state.units.find(u => u.pos.x === castlePos!.x && u.pos.y === castlePos!.y && u.hp > 0);
            if (occupier && occupier.ownerId === playerId && occupier.unitClass !== 'commander') {
                if (studentAct.type === 'wait' && (studentAct as any).unitId === occupier.id) {
                    return 'CRITICAL_TACTICAL';
                }
            }
        }
    }

    // 3. Commander safety: student moves commander into enemy attack range unnecessarily
    if ((studentAct.type === 'move' || studentAct.type === 'wait') && (studentAct as any).unitId) {
        const actingUnit = state.units.find(u => u.id === (studentAct as any).unitId);
        if (actingUnit && actingUnit.unitClass === 'commander') {
            const oppId = 1 - playerId;
            const enemyAttackers = state.units.filter(u => u.ownerId === oppId && u.hp > 0);
            const targetPos = studentAct.type === 'move' ? (studentAct as any).to : actingUnit.pos;
            const inDirectLethalRange = enemyAttackers.some(eu => Math.abs(eu.pos.x - targetPos.x) + Math.abs(eu.pos.y - targetPos.y) <= 1);
            if (inDirectLethalRange) {
                return 'CRITICAL_TACTICAL';
            }
        }
    }

    return 'POLICY_DIVERGENCE';
}

export async function collectOnPolicySamples(
    predictor: SpatialResNetPredictor,
    matchCount: number = 48,
    maxSteps: number = 400
): Promise<CollectedSample[]> {
    console.log(`\n[T10-03 Sampling] Collecting on-policy samples across ${matchCount} matches (maxSteps=${maxSteps})...`);
    const samples: CollectedSample[] = [];
    const seenHashes = new Set<string>();
    const sampleSeed = Number(process.env.V10_SAMPLE_SEED || 20260923) >>> 0;
    let rngState = sampleSeed;
    const rng = () => {
        rngState = (rngState + 0x6D2B79F5) >>> 0;
        let t = rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const maps = ['(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Mourningstar.aem', '(2) Duel.aem', '(2) Liberty Port.aem'];
    const keepAll = process.env.V10_DAGGER_KEEP_ALL === '1';
    const divergenceRate = Number(process.env.V10_DAGGER_DIVERGENCE_RATE || 0.40);
    const auditRate = Number(process.env.V10_DAGGER_AUDIT_RATE || 0.10);
    const matchOffset = Number(process.env.V10_DAGGER_MATCH_OFFSET || 0);
    let criticalCount = 0;
    let divergenceCount = 0;
    let auditCount = 0;

    for (let m = 0; m < matchCount; m++) {
        const mapName = maps[m % maps.length];
        const studentSeat = (m % 2) as (0 | 1);
        const seed = 5000 + (matchOffset + m) * 37;

        const state = createAppApkSkirmishGameState(mapName, 'SD');
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();
        let step = 0;

        while (!engine.isTerminal() && step < maxSteps) {
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            const legals = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
            if (legals.length === 0) {
                engine.step({ type: 'end_turn' });
                step++;
                continue;
            }

            if (curPlayer === studentSeat) {
                // Student decision
                const pred = predictSpatialAction(predictor, curState, curPlayer, legals, 'v2');
                const studentAct = pred.action;
                const teacherAct = heuristicAi.getAction(engine, curPlayer, legals);

                const category = detectTacticalCategory(curState, curPlayer, studentAct, teacherAct, legals);
                const stHash = getBehavioralStateHash(curState, curPlayer);

                let shouldKeep = false;
                if (category === 'CRITICAL_TACTICAL') {
                    shouldKeep = true;
                    criticalCount++;
                } else if (category === 'POLICY_DIVERGENCE') {
                    // Sample ~40% of divergence states
                    if (keepAll || rng() < divergenceRate) {
                        shouldKeep = true;
                        divergenceCount++;
                    }
                } else if (category === 'AUDIT_STABILITY') {
                    // Sample ~10% of agreement states to avoid catastrophic forgetting
                    if (keepAll || rng() < auditRate) {
                        shouldKeep = true;
                        auditCount++;
                    }
                }

                if (shouldKeep && !seenHashes.has(stHash)) {
                    seenHashes.add(stHash);
                    const encSpatial = encodeGameStateSpatial(curState, curPlayer, 'v2');
                    const candSpatial = legals.map(a => encodeCandidateActionSpatial(curState, curPlayer, a, 'v2'));
                    const targetIdx = legals.findIndex(a => JSON.stringify(a) === JSON.stringify(teacherAct));

                    if (targetIdx !== -1) {
                        const rawSample = {
                            sampleId: `v10_onpolicy_m${m}_s${step}_${category}`,
                            rootFamilyId: `root_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}_m${m}`,
                            episodeId: `ep_v10_dagger_m${m}`,
                            playerId: curPlayer,
                            spatialTensor: Array.from(encSpatial.spatialTensor),
                            globalFeatures: Array.from(encSpatial.globalFeatures),
                            candidateActions: candSpatial.map(c => ({
                                actorCoord: c.actorCoord,
                                landingCoord: c.landingCoord,
                                targetCoord: c.targetCoord,
                                semantics: Array.from(c.semantics)
                            })),
                            targetActionIndex: targetIdx,
                            valueTarget: null,
                            category
                        };

                        samples.push({
                            sampleId: rawSample.sampleId,
                            category,
                            mapName,
                            turn: curState.turn,
                            step,
                            stateHash: stHash,
                            studentAction: studentAct,
                            teacherAction: teacherAct,
                            rawSample
                        });
                    }
                }

                engine.step(studentAct);
            } else {
                // Opponent turn
                const oppAct = heuristicAi.getAction(engine, curPlayer, legals);
                engine.step(oppAct);
            }
            step++;
        }
    }

    console.log(`[T10-03 Sampling Complete] Collected ${samples.length} unique states:`);
    console.log(`  CRITICAL_TACTICAL: ${criticalCount}`);
    console.log(`  POLICY_DIVERGENCE: ${divergenceCount}`);
    console.log(`  AUDIT_STABILITY:   ${auditCount}`);

    return samples;
}

function countFileLinesSync(file: string): number {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1 << 20);
    let bytes = 0;
    let count = 0;
    try {
        while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
            for (let i = 0; i < bytes; i++) {
                if (buf[i] === 10) count++;
            }
        }
    } finally {
        fs.closeSync(fd);
    }
    return count;
}

export function buildArmDatasets(
    onPolicySamples: CollectedSample[],
    datasetDir: string
): {
    armBPath: string;
    armCPath: string;
    newSampleCount: number;
    newSampleRepeat: number;
    baseRows: number;
    armBRows: number;
    armCRows: number;
    expectedNewRowFraction: number;
} {
    fs.mkdirSync(datasetDir, { recursive: true });
    const armBPath = path.join(datasetDir, 'd_v10_fix_arm_b_control.jsonl');
    const armCPath = path.join(datasetDir, 'd_v10_fix_arm_c_dagger.jsonl');

    // Synchronous copies guarantee the dataset exists before python is spawned.
    fs.copyFileSync(BASE_DATASET_PATH, armBPath);
    fs.copyFileSync(BASE_DATASET_PATH, armCPath);
    const baseRows = countFileLinesSync(BASE_DATASET_PATH);

    const newSampleCount = onPolicySamples.length;
    const targetNewRowFraction = Number(process.env.V10_DAGGER_TARGET_NEW_FRACTION || 0.25);
    // The old run split trains on about 11011 of 16231 rows. Use that as the
    // reference so the C training stream lands in the requested 20%-30% band.
    const baseTrainRowsHint = Number(process.env.V10_DAGGER_BASE_TRAIN_ROWS || 11011);
    const newSampleRepeat = newSampleCount > 0
        ? Math.max(1, Math.round((baseTrainRowsHint * targetNewRowFraction) / (newSampleCount * (1 - targetNewRowFraction))))
        : 0;

    const repeatedNewRows: any[] = [];
    for (let r = 0; r < newSampleRepeat; r++) {
        for (const sample of onPolicySamples) {
            repeatedNewRows.push(sample.rawSample);
        }
    }
    // appendJsonlSync flushes before return; this is the fix for the original
    // createWriteStream race that produced identical Arm B / Arm C checkpoints.
    appendJsonlSync(armCPath, repeatedNewRows);

    const armBRows = baseRows;
    const armCRows = baseRows + repeatedNewRows.length;
    return {
        armBPath,
        armCPath,
        newSampleCount,
        newSampleRepeat,
        baseRows,
        armBRows,
        armCRows,
        expectedNewRowFraction: armCRows > 0 ? repeatedNewRows.length / armCRows : 0
    };
}

export function executePythonFineTuning(
    datasetPath: string,
    outModelPath: string,
    outMetricsPath: string,
    splitManifestPath: string,
    armLabel: string,
    maxSteps?: number
): { sha256: string; bestEpoch: number; bestValAcc: number; metrics: any; consumedManifestPath: string } {
    console.log(`\n=======================================================`);
    console.log(`[T10-03 Training] Fine-tuning ${armLabel}...`);
    console.log(`Init checkpoint: ${BASE_MODEL_PATH}`);
    console.log(`Dataset: ${datasetPath}`);
    console.log(`Out model: ${outModelPath}`);
    console.log(`Max steps: ${maxSteps ?? 'full-epoch'}`);
    console.log(`=======================================================\n`);

    fs.mkdirSync(path.dirname(outModelPath), { recursive: true });

    const consumedManifestPath = path.join(
        path.dirname(outModelPath),
        `${path.basename(outModelPath, '.json')}_consumed_samples_manifest.json`
    );
    const args = [
        '--dataset', datasetPath,
        '--init-checkpoint', BASE_MODEL_PATH,
        '--split-manifest', splitManifestPath,
        '--epochs', '1',
        '--batch-size', '128',
        '--lr', '0.0005',
        '--value-weight', '0.0',
        '--seed', '42',
        '--model-version', 'spatial-resnet-v2',
        '--num-blocks', '2',
        '--out-model', outModelPath,
        '--out-metrics', outMetricsPath,
        '--consumed-manifest', consumedManifestPath
    ];
    if (maxSteps !== undefined && maxSteps > 0) {
        args.push('--max-steps', String(maxSteps));
    }
    runPythonScript('python/train_spatial_resnet.py', args);

    if (!fs.existsSync(outModelPath)) {
        throw new Error(`Training failed to produce checkpoint: ${outModelPath}`);
    }
    if (!fs.existsSync(consumedManifestPath)) {
        throw new Error(`Training did not produce consumed manifest: ${consumedManifestPath}`);
    }

    const content = fs.readFileSync(outModelPath, 'utf8');
    const sha = getSha256(content);
    const metrics = JSON.parse(fs.readFileSync(outMetricsPath, 'utf8'));

    console.log(`[${armLabel} Finished] SHA-256: ${sha}`);
    console.log(`  Best Epoch: ${metrics.best_epoch} | Best Val Acc: ${(metrics.best_val_acc * 100).toFixed(2)}%`);

    return { sha256: sha, bestEpoch: metrics.best_epoch, bestValAcc: metrics.best_val_acc, metrics, consumedManifestPath };
}

export async function runDaggerControlledExperiment(): Promise<any> {
    if (process.env.V10_ALLOW_LEGACY !== '1') {
        throw new Error('SUPERSEDED: use tools/v10fix/pipeline.ts (v10/fix_01) for corrected artifacts. Set V10_ALLOW_LEGACY=1 only for historical reproduction.');
    }
    const datasetDir = path.join(RUN_DIR, 'dagger_controlled/datasets');
    const ckptDir = path.join(RUN_DIR, 'dagger_controlled/checkpoints');
    fs.mkdirSync(datasetDir, { recursive: true });
    fs.mkdirSync(ckptDir, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.mkdirSync(V10_DIR, { recursive: true });

    // 1. Verify base model identity before doing any work.
    const baseContent = fs.readFileSync(BASE_MODEL_PATH, 'utf8');
    const baseSha = getSha256(baseContent);
    const expectedBaseSha = 'f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153';
    assert(baseSha === expectedBaseSha, `T10-03 base checkpoint SHA mismatch: ${baseSha}`);
    console.log(`[T10-03 Base Model] ${BASE_MODEL_PATH} (SHA: ${baseSha})`);

    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(baseContent));

    // 2. Collect on-policy samples with a deterministic seed.
    const matchCount = Number(process.env.V10_DAGGER_MATCHES || 48);
    const maxSampleSteps = Number(process.env.V10_DAGGER_MAX_STEPS || 400);
    const onPolicySamples = await collectOnPolicySamples(predictor, matchCount, maxSampleSteps);
    assert(onPolicySamples.length > 0, 'T10-03 collected zero on-policy samples');

    // 3. Build equal-work B/C datasets. C repeats new samples to reach ~25% of
    // the training stream; appendJsonlSync guarantees the file is flushed.
    const built = buildArmDatasets(onPolicySamples, datasetDir);
    const baseTrainRowsHint = Number(process.env.V10_DAGGER_BASE_TRAIN_ROWS || 11011);
    const maxTrainSteps = Number(process.env.V10_DAGGER_MAX_TRAIN_STEPS || Math.max(1, Math.ceil(baseTrainRowsHint / 128)));

    // 4. Arm B: old data only, same number of optimizer updates as C.
    const armBModelPath = path.join(ckptDir, 'spatial_resnet_b_best.json');
    const armBMetricsPath = path.join(ckptDir, 'spatial_resnet_b_metrics.json');
    const armBRes = executePythonFineTuning(
        built.armBPath, armBModelPath, armBMetricsPath, BASE_SPLIT_PATH,
        'Arm B (Old Data Only)', maxTrainSteps
    );

    // 5. Arm C: old data + repeated on-policy samples.
    const armCModelPath = path.join(ckptDir, 'spatial_resnet_c_best.json');
    const armCMetricsPath = path.join(ckptDir, 'spatial_resnet_c_metrics.json');
    const armCRes = executePythonFineTuning(
        built.armCPath, armCModelPath, armCMetricsPath, BASE_SPLIT_PATH,
        'Arm C (Old + DAgger Data)', maxTrainSteps
    );

    // 6. Hard consumption invariant: every new sampleId must appear at least
    // once in the C train manifest. This is what the original run silently missed.
    const bConsumed = readJson<any>(armBRes.consumedManifestPath);
    const cConsumed = readJson<any>(armCRes.consumedManifestPath);
    const cTrainIds = new Set<string>(Array.isArray(cConsumed.train_sample_ids) ? cConsumed.train_sample_ids : []);
    const newIds = onPolicySamples.map(s => s.sampleId);
    const missingNewIds = newIds.filter(id => !cTrainIds.has(id));
    assert(
        missingNewIds.length === 0,
        `T10-03 invalid: Arm C consumed manifest is missing ${missingNewIds.length}/${newIds.length} new sampleIds`
    );
    assert(armBRes.sha256 !== armCRes.sha256, 'T10-03 invalid: Arm B and Arm C produced identical checkpoints');
    const cNewTrainRows = newIds.reduce(
        (sum, id) => sum + (cConsumed.train_sample_ids as string[]).filter((x: string) => x === id).length,
        0
    );

    // 7. 3-Arm controlled evaluation: 5 maps x 4 seeds x 2 seats = 40 pairs/arm.
    console.log(`\n=======================================================`);
    console.log(`[T10-03 Evaluation] 3-Arm Evaluation (Arm A vs Arm B vs Arm C)...`);
    console.log(`=======================================================\n`);

    const evalCheckpointMap = {
        SPATIAL_V2_BEST: BASE_MODEL_PATH,
        SPATIAL_V2_OLD: armBModelPath,
        SPATIAL_V2_LAST: armCModelPath
    };

    const evalReportPath = path.join(REPORT_DIR, 'dagger_controlled_benchmark.json');
    const evalRes = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['SPATIAL_V2_BEST', 'SPATIAL_V2_OLD', 'SPATIAL_V2_LAST'],
        maps: BENCHMARK_MAPS,
        seeds: [42, 1337, 2026, 4242],
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: evalReportPath,
        directories: { runId: RUN_ID },
        checkpointMap: evalCheckpointMap
    });

    const armAOutcomes = evalRes.outcomes.filter(o => o.candidatePolicy === 'SPATIAL_V2_BEST');
    const armBOutcomes = evalRes.outcomes.filter(o => o.candidatePolicy === 'SPATIAL_V2_OLD');
    const armCOutcomes = evalRes.outcomes.filter(o => o.candidatePolicy === 'SPATIAL_V2_LAST');

    const getStats = (os: any[]) => {
        const wins = os.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const losses = os.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const draws = os.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const trunc = os.length - wins - losses - draws;
        const naturalTotal = wins + losses;
        const lats = os.flatMap(o => o.decisionLatencies ?? []).sort((a: number, b: number) => a - b);
        const wilsonAll = computeWilsonScoreInterval(wins, os.length);
        const wilsonNatural = computeWilsonScoreInterval(wins, Math.max(1, naturalTotal));
        const totalRehireOpp = os.reduce((a, o) => a + (o.rehireOpportunities ?? 0), 0);
        const totalRehireSucc = os.reduce((a, o) => a + (o.rehireSuccesses ?? 0), 0);
        return {
            matchesPlayed: os.length,
            naturalWins: wins,
            naturalLosses: losses,
            naturalDraws: draws,
            truncations: trunc,
            truncationRate: os.length ? Number(((trunc / os.length) * 100).toFixed(1)) : 0,
            winRateAllMatches: Number(((wins / os.length) * 100).toFixed(1)),
            naturalWinRate: naturalTotal > 0 ? Number(((wins / naturalTotal) * 100).toFixed(1)) : null,
            confidenceInterval95All: wilsonAll,
            confidenceInterval95Natural: wilsonNatural,
            rehireOpportunities: totalRehireOpp,
            rehireSuccesses: totalRehireSucc,
            rehireRate: totalRehireOpp > 0 ? Number(((totalRehireSucc / totalRehireOpp) * 100).toFixed(1)) : null,
            avgDecisionMs: lats.length ? Number((lats.reduce((a: number, b: number) => a + b, 0) / lats.length).toFixed(1)) : null
        };
    };

    const armAStats = getStats(armAOutcomes);
    const armBStats = getStats(armBOutcomes);
    const armCStats = getStats(armCOutcomes);
    const deltaNaturalCvsB = (armCStats.naturalWinRate ?? 0) - (armBStats.naturalWinRate ?? 0);

    const report = {
        task: 'T10-03',
        title: 'Heuristic教师受控在策略分布纠错',
        executedAt: new Date().toISOString(),
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        codeState: 'v10_fix_01 uncommitted worktree; report generated from tools/v10_dagger_controlled.ts',
        baselineModel: {
            policy: 'SPATIAL_V2_BEST (Arm A)',
            sha256: baseSha,
            path: BASE_MODEL_PATH
        },
        dataPipeline: {
            onPolicyMatches: matchCount,
            maxStepsPerMatch: maxSampleSteps,
            newSamplesCollected: onPolicySamples.length,
            newSampleRepeat: built.newSampleRepeat,
            expectedNewRowFraction: Number(built.expectedNewRowFraction.toFixed(4)),
            baseRows: built.baseRows,
            armBRows: built.armBRows,
            armCRows: built.armCRows,
            maxTrainSteps,
            baseSplitManifest: BASE_SPLIT_PATH
        },
        consumptionAudit: {
            armBManifest: armBRes.consumedManifestPath,
            armCManifest: armCRes.consumedManifestPath,
            armBTrainSamples: bConsumed.train_sample_count,
            armCTrainSamples: cConsumed.train_sample_count,
            newSampleIdsInCTrain: newIds.length - missingNewIds.length,
            newSampleTrainRows: cNewTrainRows,
            missingNewSampleIds: missingNewIds.length,
            invariantPassed: missingNewIds.length === 0 && armBRes.sha256 !== armCRes.sha256
        },
        armB_controlOldData: {
            sha256: armBRes.sha256,
            datasetRows: built.armBRows,
            trainSamples: armBRes.metrics.train_samples,
            valSamples: armBRes.metrics.val_samples,
            valAcc: armBRes.bestValAcc,
            path: armBModelPath
        },
        armC_daggerNewData: {
            sha256: armCRes.sha256,
            newOnPolicySamplesAdded: onPolicySamples.length,
            totalDatasetRows: built.armCRows,
            trainSamples: armCRes.metrics.train_samples,
            valSamples: armCRes.metrics.val_samples,
            valAcc: armCRes.bestValAcc,
            path: armCModelPath
        },
        onPolicySampleBreakdown: {
            totalCollected: onPolicySamples.length,
            criticalTactical: onPolicySamples.filter(s => s.category === 'CRITICAL_TACTICAL').length,
            policyDivergence: onPolicySamples.filter(s => s.category === 'POLICY_DIVERGENCE').length,
            auditStability: onPolicySamples.filter(s => s.category === 'AUDIT_STABILITY').length
        },
        evaluationProtocol: {
            maps: BENCHMARK_MAPS.map(m => m.name),
            seeds: [42, 1337, 2026, 4242],
            matchesPerArm: armAStats.matchesPlayed,
            primaryMetric: 'natural terminations only: 100 * wins / (wins + losses)',
            truncationsReportedSeparately: true
        },
        evaluationResults: {
            armA_baseline: armAStats,
            armB_control: armBStats,
            armC_dagger: armCStats
        },
        findings: {
            deltaArmC_vs_ArmB_naturalWinRate: Number(deltaNaturalCvsB.toFixed(1)),
            deltaArmC_vs_ArmA_naturalWinRate: Number(((armCStats.naturalWinRate ?? 0) - (armAStats.naturalWinRate ?? 0)).toFixed(1)),
            rehireComparison: {
                armA_rehireRate: armAStats.rehireRate,
                armB_rehireRate: armBStats.rehireRate,
                armC_rehireRate: armCStats.rehireRate
            },
            conclusion: missingNewIds.length > 0
                ? 'INVALID: C did not consume every new on-policy sample.'
                : (deltaNaturalCvsB > 0
                    ? 'Arm C improved natural-terminal win rate over Arm B under equal optimizer steps.'
                    : 'Arm C did not improve natural-terminal win rate over Arm B under equal optimizer steps; report shortfall honestly and do not call this a verified learning gain.')
        }
    };

    const repJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(path.join(REPORT_DIR, 'dagger_controlled_report.json'), repJson, 'utf8');
    fs.writeFileSync(path.join(V10_DIR, 'dagger_controlled_report.json'), repJson, 'utf8');

    console.log(`\n=======================================================`);
    console.log(`[T10-03 Report Written] -> ${path.join(V10_DIR, 'dagger_controlled_report.json')}`);
    console.log(`  Arm A (Base f4c8...): ${armAStats.naturalWins}W/${armAStats.naturalLosses}L/${armAStats.truncations}T | W/(W+L)=${armAStats.naturalWinRate}%`);
    console.log(`  Arm B (Old Data):     ${armBStats.naturalWins}W/${armBStats.naturalLosses}L/${armBStats.truncations}T | W/(W+L)=${armBStats.naturalWinRate}% | SHA: ${armBRes.sha256.slice(0, 8)}`);
    console.log(`  Arm C (DAgger Mix):   ${armCStats.naturalWins}W/${armCStats.naturalLosses}L/${armCStats.truncations}T | W/(W+L)=${armCStats.naturalWinRate}% | SHA: ${armCRes.sha256.slice(0, 8)}`);
    console.log(`  New samples consumed by C: ${newIds.length - missingNewIds.length}/${newIds.length} (rows=${cNewTrainRows})`);
    console.log(`=======================================================\n`);

    return report;
}

if (process.argv[1]?.endsWith('v10_dagger_controlled.ts')) {
    runDaggerControlledExperiment().catch(e => {
        console.error('Fatal in T10-03:', e);
        process.exit(1);
    });
}
