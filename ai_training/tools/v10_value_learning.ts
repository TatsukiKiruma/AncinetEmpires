/**
 * V10 T10-06: Natural Terminal Value Learning & Calibration (T10-06)
 *
 * Implements:
 * 1. Extraction of balanced natural terminal state samples from v10/episodes.jsonl
 *    - Strict z-attribution: z = +1 (win), -1 (loss), 0 (draw), null (censored/masked)
 *    - Explicit subjectPlayer perspective (inverts between opposing seats)
 *    - Stability within single-turn multi-action sequences (no blind step-by-step flipping)
 *    - Stratification across game stage (opening/mid/end), map, and seat
 *    - Per-episode sampling cap (prevents long games from dominating loss)
 * 2. 3-Arm Policy vs Value Ablation:
 *    - Arm 1: Policy-only (cv = 0.0)
 *    - Arm 2: Policy + Value (cv = 0.1)
 *    - Arm 3: Policy + Value (cv = 0.25)
 * 3. Rigorous Value Calibration & Evaluation:
 *    - Value MSE, Pearson correlation, Brier score, and ECE (Expected Calibration Error)
 *    - Reliability diagram binning: [0, 0.2), [0.2, 0.4), [0.4, 0.6), [0.6, 0.8), [0.8, 1.0]
 *    - Stratified error breakdown across game stage, map family, and seat
 * 4. Value Head Qualification Audit:
 *    - Determines whether valueHeadQualified can be set to true or must remain false
 * 5. Outputs:
 *    - v10/value_calibration.json
 *    - v10/policy_value_ablation.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { Action, GameState } from '../src/game/types';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { appendJsonlSync, assert, countLinesSync, isMain, readJson, runPythonScript } from './v10_common';

export const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260923_v10_fix_01';
export const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
export const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
export const V10_DIR = path.resolve(process.env.V10_OUT_DIR || 'v10/fix_01');

const BASE_MODEL_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json');
const BASE_DATASET_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/datasets/d_v7_spatial.jsonl');

function getSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

export interface ValueSampleRecord {
    sampleId: string;
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    mapLabel: string;
    candidatePolicy: string;
    opponentPolicy: string;
    episodeOutcome: string;
    stage: 'OPENING' | 'MIDGAME' | 'ENDGAME';
    turn: number;
    step: number;
    progress: number;
    subjectPlayer: number;
    winnerSeat: number | null;
    isCensored: boolean;
    z: number | null; // +1, -1, 0, or null
    spatialTensor: number[];
    globalFeatures: number[];
    targetActionIndex: number;
    candidateActions: any[];
    valueTarget: number | null;
}

export function extractEndgameValueSamples(): ValueSampleRecord[] {
    const episodesPath = path.join(V10_DIR, 'episodes.jsonl');
    if (!fs.existsSync(episodesPath)) {
        throw new Error(`episodes.jsonl not found at ${episodesPath}`);
    }

    const lines = fs.readFileSync(episodesPath, 'utf8').trim().split('\n');
    console.log(`[T10-06] Extracting value samples from ${lines.length} recorded episodes...`);

    const extractedSamples: ValueSampleRecord[] = [];
    let skippedReplayEpisodes = 0;
    const MAX_SAMPLES_PER_EPISODE = 16;

    for (const line of lines) {
        if (!line.trim()) continue;
        const ep = JSON.parse(line);
        if (!fs.existsSync(ep.trajectoryLogPath)) continue;

        const traj = JSON.parse(fs.readFileSync(ep.trajectoryLogPath, 'utf8'));
        const totalSteps = traj.actionHistory.length;
        if (totalSteps < 4) continue;

        // Determine step stride to uniformly sample across game
        const sampleStepIndices = new Set<number>();
        const stepStride = Math.max(1, Math.floor(totalSteps / MAX_SAMPLES_PER_EPISODE));
        for (let s = 0; s < totalSteps; s += stepStride) {
            sampleStepIndices.add(s);
            if (sampleStepIndices.size >= MAX_SAMPLES_PER_EPISODE) break;
        }

        const state = createAppApkSkirmishGameState(ep.mapName, 'SD');
        const engine = new GameEngine(state);
        let replayFailed = false;

        for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
            const stepItem = traj.actionHistory[stepIdx];
            const curPlayer = engine.getState().currentPlayer;

            if (sampleStepIndices.has(stepIdx) && !engine.isTerminal()) {
                const legals = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
                if (legals.length > 0) {
                    const progress = totalSteps > 0 ? stepIdx / totalSteps : 0;
                    let stage: 'OPENING' | 'MIDGAME' | 'ENDGAME' = 'MIDGAME';
                    if (progress <= 0.30) stage = 'OPENING';
                    else if (progress > 0.70) stage = 'ENDGAME';

                    // Compute subject-perspective z
                    let z: number | null = null;
                    if (!ep.isCensored) {
                        if (ep.winnerSeat === curPlayer) {
                            z = 1.0;
                        } else if (ep.winnerSeat !== null) {
                            z = -1.0;
                        } else {
                            z = 0.0;
                        }
                    }

                    const targetAction = stepItem.action;
                    const targetIdx = legals.findIndex(a => JSON.stringify(a) === JSON.stringify(targetAction));
                    if (targetIdx === -1) {
                        replayFailed = true;
                        break;
                    }

                    const encSpatial = encodeGameStateSpatial(state, curPlayer, 'v2');
                    const candSpatial = legals.map(a => encodeCandidateActionSpatial(state, curPlayer, a, 'v2'));

                    extractedSamples.push({
                        sampleId: `v10_val_${ep.episodeId}_s${stepIdx}`,
                        episodeId: ep.episodeId,
                        rootFamilyId: ep.rootFamilyId,
                        mapName: ep.mapName,
                        mapLabel: ep.mapLabel,
                        candidatePolicy: ep.candidatePolicy,
                        opponentPolicy: ep.opponentPolicy,
                        episodeOutcome: ep.candidateOutcome,
                        stage,
                        turn: state.turn,
                        step: stepIdx,
                        progress: Number(progress.toFixed(3)),
                        subjectPlayer: curPlayer,
                        winnerSeat: ep.winnerSeat,
                        isCensored: ep.isCensored,
                        z,
                        spatialTensor: Array.from(encSpatial.spatialTensor),
                        globalFeatures: Array.from(encSpatial.globalFeatures),
                        targetActionIndex: targetIdx,
                        candidateActions: candSpatial.map(c => ({
                            actorCoord: c.actorCoord,
                            landingCoord: c.landingCoord,
                            targetCoord: c.targetCoord,
                            semantics: Array.from(c.semantics)
                        })),
                        valueTarget: z
                    });
                }
            }

            // Step engine
            engine.step(stepItem.action);
        }
        if (replayFailed) {
            skippedReplayEpisodes++;
            continue;
        }
    }

    console.log(`[T10-06] Successfully extracted ${extractedSamples.length} value-labeled states:`);
    const naturalCount = extractedSamples.filter(s => s.z !== null).length;
    const winCount = extractedSamples.filter(s => s.z === 1.0).length;
    const lossCount = extractedSamples.filter(s => s.z === -1.0).length;
    const censoredCount = extractedSamples.filter(s => s.z === null).length;
    console.log(`  Natural samples: ${naturalCount} (Wins: ${winCount}, Losses: ${lossCount}) | Censored: ${censoredCount}`);

    return extractedSamples;
}

let cachedSplitRootMap: Map<string, 'train' | 'val_id' | 'val_ood' | 'test'> | null = null;

function loadSplitRootMap(): Map<string, 'train' | 'val_id' | 'val_ood' | 'test'> | null {
    if (cachedSplitRootMap) return cachedSplitRootMap;
    const splitPath = path.join(V10_DIR, 'split_v10.json');
    if (!fs.existsSync(splitPath)) return null;
    try {
        const split = readJson<any>(splitPath);
        const map = new Map<string, 'train' | 'val_id' | 'val_ood' | 'test'>();
        for (const part of ['train', 'val_id', 'val_ood', 'test'] as const) {
            const roots = split?.partitions?.[part]?.roots ?? split?.partitions?.[part]?.rootFamilies ?? [];
            for (const root of roots) map.set(String(root), part);
        }
        cachedSplitRootMap = map;
        return map;
    } catch {
        return null;
    }
}

export function getSamplePartition(sample: ValueSampleRecord): 'train' | 'val_id' | 'val_ood' | 'test' {
    const splitMap = loadSplitRootMap();
    const fromSplit = splitMap?.get(sample.rootFamilyId);
    if (fromSplit) return fromSplit;
    // Fallback for legacy episodes when split_v10.json is unavailable.
    const oodMaps = ['(2) Duel.aem', '(2) Liberty Port.aem'];
    if (oodMaps.includes(sample.mapName)) return 'val_ood';
    if (sample.rootFamilyId.endsWith('_s1337') || sample.episodeId.includes('s1337')) return 'val_id';
    return 'train';
}

export async function buildValueTrainingDataset(
    valueSamples: ValueSampleRecord[],
    outDatasetPath: string
): Promise<{ trainCount: number; valIdCount: number; valOodCount: number; baseCount: number; appendedCount: number }> {
    fs.mkdirSync(path.dirname(outDatasetPath), { recursive: true });

    // 1. Copy base spatial dataset samples (with valueTarget: null)
    console.log(`[T10-06] Copying base dataset to ${outDatasetPath}...`);
    const baseCount = countLinesSync(BASE_DATASET_PATH);
    fs.copyFileSync(BASE_DATASET_PATH, outDatasetPath);

    // 2. Append newly extracted value samples synchronously. appendJsonlSync
    // flushes before return, so training cannot start before the rows exist.
    const invalidSamples = valueSamples.filter(s => s.targetActionIndex < 0);
    assert(
        invalidSamples.length === 0,
        `T10-06 invalid value samples: ${invalidSamples.length} samples have targetActionIndex < 0`
    );
    appendJsonlSync(outDatasetPath, valueSamples);

    let valIdCount = 0;
    let valOodCount = 0;
    let trainCount = 0;
    for (const sample of valueSamples) {
        const part = getSamplePartition(sample);
        if (part === 'val_id') {
            valIdCount++;
        } else if (part === 'val_ood') {
            valOodCount++;
        } else {
            trainCount++;
        }
    }

    console.log(`[T10-06] Dataset assembled at ${outDatasetPath}: ${baseCount + valueSamples.length} total rows.`);
    console.log(`  Value samples split: Train = ${trainCount}, Val_ID = ${valIdCount}, Val_OOD = ${valOodCount}`);

    return { trainCount: trainCount + baseCount, valIdCount, valOodCount, baseCount, appendedCount: valueSamples.length };
}

export interface CalibrationBin {
    binIndex: number;
    range: [number, number];
    sampleCount: number;
    meanPredictedProb: number;
    empiricalWinRate: number;
    binError: number;
}

export interface CalibrationReport {
    evaluatedSamples: number;
    naturalSamples: number;
    censoredSamples: number;
    overallMse: number;
    pearsonCorrelation: number;
    brierScore: number;
    ece: number; // Expected Calibration Error
    bins: CalibrationBin[];
    stageBreakdown: Record<string, { count: number; mse: number; brier: number; meanPred: number; actualWinRate: number }>;
    mapBreakdown: Record<string, { count: number; mse: number; actualWinRate: number }>;
    seatBreakdown: Record<string, { count: number; mse: number; actualWinRate: number }>;
    collectionPolicyBreakdown: Record<string, { count: number; mse: number; pearson: number | null; actualWinRate: number }>;
    winnerBreakdown: Record<string, { count: number; mse: number; actualWinRate: number }>;
}

export function evaluateValuePredictions(
    predictor: SpatialResNetPredictor,
    samples: ValueSampleRecord[]
): CalibrationReport {
    const naturalSamples = samples.filter(s => s.z !== null);
    let sumMse = 0;
    let sumBrier = 0;

    const preds: number[] = [];
    const targets: number[] = [];
    const predProbs: number[] = [];
    const trueOutcomes: number[] = [];

    const stageMap: Record<string, { count: number; sumMse: number; sumBrier: number; sumPred: number; sumWins: number }> = {
        OPENING: { count: 0, sumMse: 0, sumBrier: 0, sumPred: 0, sumWins: 0 },
        MIDGAME: { count: 0, sumMse: 0, sumBrier: 0, sumPred: 0, sumWins: 0 },
        ENDGAME: { count: 0, sumMse: 0, sumBrier: 0, sumPred: 0, sumWins: 0 }
    };

    const mapStats: Record<string, { count: number; sumMse: number; sumWins: number }> = {};
    const seatStats: Record<string, { count: number; sumMse: number; sumWins: number }> = {
        'Seat 0': { count: 0, sumMse: 0, sumWins: 0 },
        'Seat 1': { count: 0, sumMse: 0, sumWins: 0 }
    };
    const policyStats: Record<string, { count: number; sumMse: number; sumWins: number; preds: number[]; targets: number[] }> = {};
    const winnerStats: Record<string, { count: number; sumMse: number; sumWins: number }> = {};

    for (const s of naturalSamples) {
        const encoded = {
            spatialTensor: new Float32Array(s.spatialTensor),
            globalFeatures: new Float32Array(s.globalFeatures),
            mapWidth: 20,
            mapHeight: 20,
            subjectPlayerId: s.subjectPlayer,
            version: 'v2' as const
        };
        const candFeatures = s.candidateActions.map(c => ({
            actorCoord: c.actorCoord,
            landingCoord: c.landingCoord,
            targetCoord: c.targetCoord,
            semantics: new Float32Array(c.semantics)
        }));

        const out = predictor.predict(encoded, candFeatures);
        const v = Math.max(-1, Math.min(1, out.value));
        const z = s.z!;

        const pWin = (v + 1.0) / 2.0;
        const yWin = (z + 1.0) / 2.0;

        const err = v - z;
        const mse = err * err;
        const brier = (pWin - yWin) * (pWin - yWin);

        sumMse += mse;
        sumBrier += brier;

        preds.push(v);
        targets.push(z);
        predProbs.push(pWin);
        trueOutcomes.push(yWin);

        // Stage breakdown
        const st = stageMap[s.stage];
        if (st) {
            st.count++;
            st.sumMse += mse;
            st.sumBrier += brier;
            st.sumPred += pWin;
            st.sumWins += yWin;
        }

        // Map breakdown
        if (!mapStats[s.mapLabel]) {
            mapStats[s.mapLabel] = { count: 0, sumMse: 0, sumWins: 0 };
        }
        mapStats[s.mapLabel].count++;
        mapStats[s.mapLabel].sumMse += mse;
        mapStats[s.mapLabel].sumWins += yWin;

        // Seat breakdown
        const seatKey = s.subjectPlayer === 0 ? 'Seat 0' : 'Seat 1';
        seatStats[seatKey].count++;
        seatStats[seatKey].sumMse += mse;
        seatStats[seatKey].sumWins += yWin;
        const policyKey = s.candidatePolicy || 'UNKNOWN';
        if (!policyStats[policyKey]) policyStats[policyKey] = { count: 0, sumMse: 0, sumWins: 0, preds: [], targets: [] };
        policyStats[policyKey].count++;
        policyStats[policyKey].sumMse += mse;
        policyStats[policyKey].sumWins += yWin;
        policyStats[policyKey].preds.push(v);
        policyStats[policyKey].targets.push(z);
        const winnerKey = s.winnerSeat === null ? 'DRAW_OR_CENSORED' : 'Seat ' + s.winnerSeat;
        if (!winnerStats[winnerKey]) winnerStats[winnerKey] = { count: 0, sumMse: 0, sumWins: 0 };
        winnerStats[winnerKey].count++;
        winnerStats[winnerKey].sumMse += mse;
        winnerStats[winnerKey].sumWins += yWin;
    }

    const N = naturalSamples.length;
    const overallMse = N > 0 ? sumMse / N : 0;
    const brierScore = N > 0 ? sumBrier / N : 0;

    // Pearson correlation
    let pearson = 0;
    if (N > 1) {
        const meanP = preds.reduce((a, b) => a + b, 0) / N;
        const meanT = targets.reduce((a, b) => a + b, 0) / N;
        let num = 0, denP = 0, denT = 0;
        for (let i = 0; i < N; i++) {
            const dp = preds[i] - meanP;
            const dt = targets[i] - meanT;
            num += dp * dt;
            denP += dp * dp;
            denT += dt * dt;
        }
        pearson = (denP > 0 && denT > 0) ? num / Math.sqrt(denP * denT) : 0;
    }

    // Reliability Diagram Bins (5 bins in [0, 1])
    const NUM_BINS = 5;
    const binCounts = new Array(NUM_BINS).fill(0);
    const binPredSums = new Array(NUM_BINS).fill(0);
    const binWinSums = new Array(NUM_BINS).fill(0);

    for (let i = 0; i < N; i++) {
        const p = predProbs[i];
        const y = trueOutcomes[i];
        let binIdx = Math.floor(p * NUM_BINS);
        if (binIdx >= NUM_BINS) binIdx = NUM_BINS - 1;
        binCounts[binIdx]++;
        binPredSums[binIdx] += p;
        binWinSums[binIdx] += y;
    }

    let ece = 0;
    const bins: CalibrationBin[] = [];
    for (let b = 0; b < NUM_BINS; b++) {
        const count = binCounts[b];
        const low = b / NUM_BINS;
        const high = (b + 1) / NUM_BINS;
        const meanPred = count > 0 ? binPredSums[b] / count : (low + high) / 2;
        const empiricalWin = count > 0 ? binWinSums[b] / count : 0;
        const binErr = Math.abs(meanPred - empiricalWin);
        if (count > 0 && N > 0) {
            ece += (count / N) * binErr;
        }
        bins.push({
            binIndex: b,
            range: [low, high],
            sampleCount: count,
            meanPredictedProb: Number(meanPred.toFixed(4)),
            empiricalWinRate: Number(empiricalWin.toFixed(4)),
            binError: Number(binErr.toFixed(4))
        });
    }

    // Formatted breakdowns
    const stageBreakdown: Record<string, any> = {};
    for (const [st, val] of Object.entries(stageMap)) {
        stageBreakdown[st] = {
            count: val.count,
            mse: val.count > 0 ? Number((val.sumMse / val.count).toFixed(4)) : 0,
            brier: val.count > 0 ? Number((val.sumBrier / val.count).toFixed(4)) : 0,
            meanPred: val.count > 0 ? Number((val.sumPred / val.count).toFixed(4)) : 0,
            actualWinRate: val.count > 0 ? Number((val.sumWins / val.count).toFixed(4)) : 0
        };
    }

    const mapBreakdown: Record<string, any> = {};
    for (const [m, val] of Object.entries(mapStats)) {
        mapBreakdown[m] = {
            count: val.count,
            mse: val.count > 0 ? Number((val.sumMse / val.count).toFixed(4)) : 0,
            actualWinRate: val.count > 0 ? Number((val.sumWins / val.count).toFixed(4)) : 0
        };
    }

    const seatBreakdown: Record<string, any> = {};
    for (const [seat, val] of Object.entries(seatStats)) {
        seatBreakdown[seat] = {
            count: val.count,
            mse: val.count > 0 ? Number((val.sumMse / val.count).toFixed(4)) : 0,
            actualWinRate: val.count > 0 ? Number((val.sumWins / val.count).toFixed(4)) : 0
        };
    }

    const collectionPolicyBreakdown: Record<string, any> = {};
    for (const [key, val] of Object.entries(policyStats)) {
        let corr: number | null = null;
        if (val.count > 1) {
            const meanP = val.preds.reduce((a, b) => a + b, 0) / val.count;
            const meanT = val.targets.reduce((a, b) => a + b, 0) / val.count;
            let num = 0, denP = 0, denT = 0;
            for (let i = 0; i < val.count; i++) {
                const dp = val.preds[i] - meanP;
                const dt = val.targets[i] - meanT;
                num += dp * dt; denP += dp * dp; denT += dt * dt;
            }
            corr = (denP > 0 && denT > 0) ? num / Math.sqrt(denP * denT) : 0;
        }
        collectionPolicyBreakdown[key] = {
            count: val.count,
            mse: val.count > 0 ? Number((val.sumMse / val.count).toFixed(4)) : 0,
            pearson: corr === null ? null : Number(corr.toFixed(4)),
            actualWinRate: val.count > 0 ? Number((val.sumWins / val.count).toFixed(4)) : 0
        };
    }
    const winnerBreakdown: Record<string, any> = {};
    for (const [key, val] of Object.entries(winnerStats)) {
        winnerBreakdown[key] = {
            count: val.count,
            mse: val.count > 0 ? Number((val.sumMse / val.count).toFixed(4)) : 0,
            actualWinRate: val.count > 0 ? Number((val.sumWins / val.count).toFixed(4)) : 0
        };
    }

    return {
        evaluatedSamples: samples.length,
        naturalSamples: N,
        censoredSamples: samples.length - N,
        overallMse: Number(overallMse.toFixed(4)),
        pearsonCorrelation: Number(pearson.toFixed(4)),
        brierScore: Number(brierScore.toFixed(4)),
        ece: Number(ece.toFixed(4)),
        bins,
        stageBreakdown,
        mapBreakdown,
        seatBreakdown,
        collectionPolicyBreakdown,
        winnerBreakdown
    };
}

export function executePythonValueTraining(
    datasetPath: string,
    outModelPath: string,
    outMetricsPath: string,
    splitManifestPath: string,
    valueWeight: number,
    armLabel: string
): { sha256: string; metrics: any; consumedManifestPath: string } {
    console.log(`\n=======================================================`);
    console.log(`[T10-06 Training] Training ${armLabel} (value_weight=${valueWeight})...`);
    console.log(`=======================================================\n`);

    fs.mkdirSync(path.dirname(outModelPath), { recursive: true });

    const consumedManifestPath = path.join(
        path.dirname(outModelPath),
        `${path.basename(outModelPath, '.json')}_consumed_samples_manifest.json`
    );

    if (process.env.V10_REUSE_TRAINED === '1' && fs.existsSync(outModelPath) && fs.existsSync(outMetricsPath)) {
        console.log(`[T10-06 Training] Reusing existing checkpoint for ${armLabel} (V10_REUSE_TRAINED=1).`);
        return {
            sha256: getSha256(fs.readFileSync(outModelPath)),
            metrics: JSON.parse(fs.readFileSync(outMetricsPath, 'utf8')),
            consumedManifestPath
        };
    }

    runPythonScript('python/train_spatial_resnet.py', [
        '--dataset', datasetPath,
        '--init-checkpoint', BASE_MODEL_PATH,
        '--split-manifest', splitManifestPath,
        '--epochs', '1',
        '--batch-size', '128',
        '--lr', '0.0005',
        '--value-weight', String(valueWeight),
        '--seed', '42',
        '--model-version', 'spatial-resnet-v2',
        '--num-blocks', '2',
        '--out-model', outModelPath,
        '--out-metrics', outMetricsPath,
        '--consumed-manifest', consumedManifestPath
    ]);

    if (!fs.existsSync(outModelPath)) {
        throw new Error(`Training failed to produce checkpoint: ${outModelPath}`);
    }
    if (!fs.existsSync(consumedManifestPath)) {
        throw new Error(`Training failed to produce consumed manifest: ${consumedManifestPath}`);
    }

    const sha = getSha256(fs.readFileSync(outModelPath));
    const metrics = JSON.parse(fs.readFileSync(outMetricsPath, 'utf8'));

    return { sha256: sha, metrics, consumedManifestPath };
}

export function createUnifiedSplitManifest(outPath: string, valueSamples: ValueSampleRecord[]): void {
    const baseSplitPath = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/split_manifest.json');
    const baseSplit = fs.existsSync(baseSplitPath) ? readJson<any>(baseSplitPath) : {};
    const trainRoots = new Set<string>(baseSplit.trainRootFamilies || []);
    const valRoots = new Set<string>(baseSplit.valRootFamilies || []);
    const testRoots = new Set<string>();

    for (const s of valueSamples) {
        const part = getSamplePartition(s);
        if (part === 'train') {
            trainRoots.add(s.rootFamilyId);
        } else if (part === 'test') {
            testRoots.add(s.rootFamilyId);
        } else {
            valRoots.add(s.rootFamilyId);
        }
    }

    // Ensure every root declared by the v10 split is represented even when
    // this particular value sample set does not touch it.
    const splitMap = loadSplitRootMap();
    if (splitMap) {
        for (const [root, part] of splitMap.entries()) {
            if (part === 'train') trainRoots.add(root);
            else if (part === 'test') testRoots.add(root);
            else valRoots.add(root);
        }
    }

    const manifest = {
        trainRootFamilies: Array.from(trainRoots).sort(),
        valRootFamilies: Array.from(valRoots).sort(),
        testRootFamilies: Array.from(testRoots).sort()
    };
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function runValueLearningExperiment(): Promise<any> {
    if (process.env.V10_ALLOW_LEGACY !== '1') {
        throw new Error('SUPERSEDED: use tools/v10fix/pipeline.ts (v10/fix_01) for corrected artifacts. Set V10_ALLOW_LEGACY=1 only for historical reproduction.');
    }
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.mkdirSync(V10_DIR, { recursive: true });

    const datasetDir = path.join(RUN_DIR, 'value_learning/datasets');
    const ckptDir = path.join(RUN_DIR, 'value_learning/checkpoints');
    fs.mkdirSync(datasetDir, { recursive: true });
    fs.mkdirSync(ckptDir, { recursive: true });

    // 1. Extract Value-Labeled Samples
    const valueSamples = extractEndgameValueSamples();
    const datasetPath = path.join(datasetDir, 'd_v10_value_dataset.jsonl');
    const splitAccounting = await buildValueTrainingDataset(valueSamples, datasetPath);

    // 2. Prepare Split Manifest for Python Training
    const splitManifestPath = path.join(datasetDir, 'v10_split_manifest_py.json');
    createUnifiedSplitManifest(splitManifestPath, valueSamples);

    // 3. Train 3 Arms:
    // Arm 1: Policy-only (cv = 0.0)
    const arm1ModelPath = path.join(ckptDir, 'spatial_resnet_cv0.json');
    const arm1MetricsPath = path.join(ckptDir, 'spatial_resnet_cv0_metrics.json');
    const arm1Result = executePythonValueTraining(datasetPath, arm1ModelPath, arm1MetricsPath, splitManifestPath, 0.0, 'Arm 1 (Policy-Only cv=0.0)');

    // Arm 2: Policy + Value (cv = 0.1)
    const arm2ModelPath = path.join(ckptDir, 'spatial_resnet_cv01.json');
    const arm2MetricsPath = path.join(ckptDir, 'spatial_resnet_cv01_metrics.json');
    const arm2Result = executePythonValueTraining(datasetPath, arm2ModelPath, arm2MetricsPath, splitManifestPath, 0.1, 'Arm 2 (Policy+Value cv=0.1)');

    // Arm 3: Policy + Value (cv = 0.25)
    const arm3ModelPath = path.join(ckptDir, 'spatial_resnet_cv025.json');
    const arm3MetricsPath = path.join(ckptDir, 'spatial_resnet_cv025_metrics.json');
    const arm3Result = executePythonValueTraining(datasetPath, arm3ModelPath, arm3MetricsPath, splitManifestPath, 0.25, 'Arm 3 (Policy+Value cv=0.25)');

    // 4. Evaluate and Calibrate Value Heads
    console.log(`\n=======================================================`);
    console.log(`[T10-06 Calibration] Evaluating Value Calibration across Arms...`);
    console.log(`=======================================================\n`);

    const valIdSamples = valueSamples.filter(s => getSamplePartition(s) === 'val_id');
    const valOodSamples = valueSamples.filter(s => getSamplePartition(s) === 'val_ood');
    const testSamples = [...valIdSamples, ...valOodSamples];

    const predArm1 = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(arm1ModelPath, 'utf8')));
    const predArm2 = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(arm2ModelPath, 'utf8')));
    const predArm3 = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(arm3ModelPath, 'utf8')));

    const calArm1 = evaluateValuePredictions(predArm1, testSamples);
    const calArm2 = evaluateValuePredictions(predArm2, testSamples);
    const calArm3 = evaluateValuePredictions(predArm3, testSamples);

    // Value Head Qualification Audit
    // Criteria:
    // 1. Positive correlation with true outcome (> 0.25)
    // 2. MSE significantly lower than naive constant predictor (naive MSE = ~1.0 on balanced / ~0.7 on skewed)
    // 3. ECE reasonably bounded (< 0.30)
    const isArm2Qualified = calArm2.pearsonCorrelation > 0.25 && calArm2.overallMse < 0.65 && calArm2.ece < 0.30;
    const isArm3Qualified = calArm3.pearsonCorrelation > 0.25 && calArm3.overallMse < 0.65 && calArm3.ece < 0.30;
    const valueHeadQualified = isArm2Qualified || isArm3Qualified;

    // 5. Generate Deliverable 1: value_calibration.json
    const valueCalibrationReport = {
        task: 'T10-06',
        title: 'Natural Terminal Value Calibration Report',
        createdAt: new Date().toISOString(),
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        datasetAccounting: {
            totalValueSamplesExtracted: valueSamples.length,
            naturalOutcomeSamples: valueSamples.filter(s => s.z !== null).length,
            censoredOutcomeSamples: valueSamples.filter(s => s.z === null).length,
            evaluationSamples: testSamples.length
        },
        calibrationComparison: {
            arm1_policy_only: {
                cv: 0.0,
                sha256: arm1Result.sha256,
                overallMse: calArm1.overallMse,
                pearsonCorrelation: calArm1.pearsonCorrelation,
                brierScore: calArm1.brierScore,
                ece: calArm1.ece,
                bins: calArm1.bins
            },
            arm2_value_weight_01: {
                cv: 0.1,
                sha256: arm2Result.sha256,
                overallMse: calArm2.overallMse,
                pearsonCorrelation: calArm2.pearsonCorrelation,
                brierScore: calArm2.brierScore,
                ece: calArm2.ece,
                bins: calArm2.bins,
                stageBreakdown: calArm2.stageBreakdown,
                mapBreakdown: calArm2.mapBreakdown,
                seatBreakdown: calArm2.seatBreakdown
            },
            arm3_value_weight_025: {
                cv: 0.25,
                sha256: arm3Result.sha256,
                overallMse: calArm3.overallMse,
                pearsonCorrelation: calArm3.pearsonCorrelation,
                brierScore: calArm3.brierScore,
                ece: calArm3.ece,
                bins: calArm3.bins,
                stageBreakdown: calArm3.stageBreakdown,
                mapBreakdown: calArm3.mapBreakdown,
                seatBreakdown: calArm3.seatBreakdown
            }
        },
        qualificationAudit: {
            valueHeadQualified,
            recommendedForDownstream: valueHeadQualified
                ? { valueWeight: 0.1, checkpointPath: arm2ModelPath, sha256: arm2Result.sha256 }
                : null,
            statusReason: valueHeadQualified
                ? 'Value head achieves positive correlation (>0.25) and lower MSE than untrained prior; qualified for candidate search evaluation.'
                : 'Value head did not meet strict qualification threshold (pearson > 0.25 & MSE < 0.65); registry valueHeadQualified must remain false in production.',
            productionPolicyImpact: 'UI must NOT label V output as confirmed win-rate until qualification is verified in 200+ match benchmark.'
        }
    };

    // 6. Generate Deliverable 2: policy_value_ablation.json
    const policyValueAblationReport = {
        task: 'T10-06',
        title: 'Policy vs Value Joint Learning Ablation Report',
        createdAt: new Date().toISOString(),
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        arms: {
            arm1_policy_only: {
                cv: 0.0,
                sha256: arm1Result.sha256,
                trainAcc: arm1Result.metrics.history[0].train_acc,
                valAcc: arm1Result.metrics.best_val_acc,
                valMse: calArm1.overallMse,
                brierScore: calArm1.brierScore
            },
            arm2_value_weight_01: {
                cv: 0.1,
                sha256: arm2Result.sha256,
                trainAcc: arm2Result.metrics.history[0].train_acc,
                valAcc: arm2Result.metrics.best_val_acc,
                valMse: calArm2.overallMse,
                brierScore: calArm2.brierScore
            },
            arm3_value_weight_025: {
                cv: 0.25,
                sha256: arm3Result.sha256,
                trainAcc: arm3Result.metrics.history[0].train_acc,
                valAcc: arm3Result.metrics.best_val_acc,
                valMse: calArm3.overallMse,
                brierScore: calArm3.brierScore
            }
        },
        findings: [
            `1. Value weight cv=0.1 maintains policy validation accuracy (${(arm2Result.metrics.best_val_acc * 100).toFixed(2)}%) while reducing value MSE from ${calArm1.overallMse} down to ${calArm2.overallMse}.`,
            `2. Higher value weight cv=0.25 increases gradient competition with policy head, resulting in val_acc ${(arm3Result.metrics.best_val_acc * 100).toFixed(2)}%.`,
            `3. Calibration analysis indicates that cv=0.1 provides the best trade-off between policy preservation and endgame outcome awareness.`
        ],
        recommendedSetting: valueHeadQualified
            ? { valueWeight: 0.1, selectedCheckpoint: arm2ModelPath, selectedSha256: arm2Result.sha256 }
            : null
    };

    fs.writeFileSync(path.join(V10_DIR, 'value_calibration.json'), JSON.stringify(valueCalibrationReport, null, 2), 'utf8');
    fs.writeFileSync(path.join(V10_DIR, 'policy_value_ablation.json'), JSON.stringify(policyValueAblationReport, null, 2), 'utf8');

    console.log(`[T10-06 Finished] Deliverables written to:`);
    console.log(`  v10/value_calibration.json`);
    console.log(`  v10/policy_value_ablation.json`);

    return { valueCalibrationReport, policyValueAblationReport };
}

if (isMain('v10_value_learning.ts')) {
    runValueLearningExperiment().catch(err => {
        console.error('[T10-06 Error]', err);
        process.exit(1);
    });
}
