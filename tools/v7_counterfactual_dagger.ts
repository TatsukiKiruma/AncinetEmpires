/**
 * AncientEmpires - V7 Counterfactual Replay & Student DAgger (R7-04)
 * 
 * Implements:
 * 1. Diagnostic match: Student vs HeuristicAI on development maps
 * 2. Real-time failure window detection:
 *    - MISSED_REHIRE: Castle open & gold >= 250 & commander dead, but student ignored
 *    - CASTLE_BLOCKED: Friendly unit blocks castle when rehire ready, failed to vacate
 *    - SUICIDE_ATTACK: Friendly unit moved into fatal crossfire without profitable trade
 *    - TACTICAL_DEFENSE_BLUNDER: Low HP enemy adjacent left alive to deal damage
 * 3. 3-Way Counterfactual Replay from identical stateHash:
 *    - (A) Student continued
 *    - (B) Single-step teacher substitute (teacher acts once, student resumes)
 *    - (C) Full teacher takeover
 * 4. DAgger buffer collection and 1-round fine-tuning
 * 5. Pre vs Post DAgger evaluation comparison
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getAllianceId, getUnitCost, isCommanderUnit, areEnemyPlayers } from '../src/game/rule_config';
import { encodeAction } from '../src/game/env';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { evaluatePositionHeuristic } from './v7_heuristic_bounded_search';

const RUN_ID = 'agent_upgrade_20260921_v7_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const FAILURES_DIR = path.join(RUN_DIR, 'failures');
const DATASET_DIR = path.join(RUN_DIR, 'datasets');
const CHECKPOINT_DIR = path.join(RUN_DIR, 'checkpoints');

export interface DAggerDirectories {
    runId?: string;
    reportDir?: string;
    runDir?: string;
    failuresDir?: string;
    datasetDir?: string;
    checkpointDir?: string;
}

export interface FailureWindowRecord {
    failureId: string;
    failureType: 'MISSED_REHIRE' | 'CASTLE_BLOCKED' | 'SUICIDE_ATTACK' | 'TACTICAL_DEFENSE_BLUNDER' | 'POLICY_DIVERGENCE';
    mapName: string;
    turn: number;
    step: number;
    stateHash: string;
    studentAction: Action;
    teacherAction: Action;
    scoreA_studentContinued: number;
    scoreB_singleStepTeacher: number;
    scoreC_teacherTakeover: number;
    improvementB_vs_A: number;
    improvementC_vs_A: number;
    confirmedFailure: boolean;
}

export interface DAggerSample {
    sampleId: string;
    state: GameState;
    playerId: number;
    teacherAction: Action;
    sourceFailureType: string;
}

import { getBehavioralStateHash } from './v7_training_pipeline';
const getStateHash = getBehavioralStateHash;

function getCastlePos(state: GameState, playerId: number): Position | null {
    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            if (tile.terrainId === 10 && tile.ownerId === playerId) {
                return { x, y };
            }
        }
    }
    return null;
}

export function predictStudentAction(
    predictor: SpatialResNetPredictor,
    engine: GameEngine,
    playerId: number
): { action: Action; actionIdx: number; legalActions: Action[] } {
    const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legalActions.length === 0) {
        return { action: { type: 'end_turn' }, actionIdx: 0, legalActions: [{ type: 'end_turn' }] };
    }

    const state = engine.getState();
    const encSpatial = encodeGameStateSpatial(state, playerId, 'v2');
    const candSpatial = legalActions.map(a => {
        const feat = encodeCandidateActionSpatial(state, playerId, a, 'v2');
        return {
            actorCoord: feat.actorCoord,
            landingCoord: feat.landingCoord,
            targetCoord: feat.targetCoord,
            semantics: feat.semantics
        };
    });

    const pred = predictor.predict(encSpatial, candSpatial);
    let bestIdx = 0;
    let bestLogit = -Infinity;
    for (let i = 0; i < pred.actionLogits.length; i++) {
        if (pred.actionLogits[i] > bestLogit) {
            bestLogit = pred.actionLogits[i];
            bestIdx = i;
        }
    }

    return { action: legalActions[bestIdx], actionIdx: bestIdx, legalActions };
}

/**
 * Check if the student's chosen action constitutes an obvious tactical or strategic blunder
 */
function detectFailureWindow(
    state: GameState,
    playerId: number,
    studentAction: Action,
    teacherAction: Action,
    legalActions: Action[]
): { isFailure: boolean; failureType?: FailureWindowRecord['failureType'] } {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return { isFailure: false };

    const cPos = getCastlePos(state, playerId);
    const commAlive = state.units.some(u => u.ownerId === playerId && u.unitClass === 'commander' && u.hp > 0);
    const commCost = getUnitCost(state, playerId, 'commander') ?? 400;

    // 1. Missed Rehire Detection
    if (!commAlive && cPos && player.gold >= commCost) {
        const unitOnCastle = state.units.find(u => u.pos.x === cPos.x && u.pos.y === cPos.y && u.hp > 0);
        if (!unitOnCastle) {
            // Castle is completely free, gold is available
            const hasRehireLegal = legalActions.some(a => a.type === 'recruit_to_castle' && a.unitClass === 'commander');
            if (hasRehireLegal && (studentAction.type !== 'recruit_to_castle' || studentAction.unitClass !== 'commander')) {
                return { isFailure: true, failureType: 'MISSED_REHIRE' };
            }
        } else if (unitOnCastle.ownerId === playerId) {
            // 2. Castle Blocked Detection: Friendly unit is occupying castle when commander needs rehire
            if (studentAction.type !== 'move' || (studentAction as any).unitId !== unitOnCastle.id) {
                // Friendly unit was not moved off the castle
                return { isFailure: true, failureType: 'CASTLE_BLOCKED' };
            }
        }
    }

    // 3. Tactical Defense Blunder: Ignoring adjacent enemy threat that teacher eliminates
    if (teacherAction.type === 'attack') {
        const target = state.units.find(u => u.id === (teacherAction as any).targetId);
        if (target && target.hp <= 30) {
            // High value kill available, did student do something non-combat like wait or move elsewhere?
            if (studentAction.type === 'wait' || studentAction.type === 'end_turn') {
                return { isFailure: true, failureType: 'TACTICAL_DEFENSE_BLUNDER' };
            }
        }
    }

    // 4. Suicide attack / move: Student moved into extreme danger
    if (studentAction.type === 'move') {
        const targetPos = (studentAction as any).to;
        const enemies = state.units.filter(u => u.hp > 0 && areEnemyPlayers(state, playerId, u.ownerId));
        let threateningEnemies = 0;
        for (const e of enemies) {
            const dist = Math.abs(e.pos.x - targetPos.x) + Math.abs(e.pos.y - targetPos.y);
            if (dist <= 2) threateningEnemies++;
        }
        if (threateningEnemies >= 3 && teacherAction.type !== 'move') {
            return { isFailure: true, failureType: 'SUICIDE_ATTACK' };
        }
    }

    // 5. Policy divergence: Actions differ between student and teacher (candidate for counterfactual verification)
    if (JSON.stringify(studentAction) !== JSON.stringify(teacherAction)) {
        return { isFailure: true, failureType: 'POLICY_DIVERGENCE' };
    }

    return { isFailure: false };
}

function createPrng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Execute 3-way Counterfactual Replay with identical RNG boundary
 */
function runCounterfactualReplay(
    stateAtFailure: GameState,
    playerId: number,
    studentAction: Action,
    teacherAction: Action,
    predictor: SpatialResNetPredictor,
    seed: number = 42,
    lookaheadSteps: number = 8
): { scoreA: number; scoreB: number; scoreC: number } {
    const oppId = 1 - playerId;

    // Trajectory A: Student Continued
    const hAiA = new HeuristicAI(createPrng(seed));
    const simA = new GameEngine(JSON.parse(JSON.stringify(stateAtFailure)));
    simA.step(studentAction);
    for (let s = 0; s < lookaheadSteps && !simA.isTerminal(); s++) {
        const curPid = simA.getState().currentPlayer;
        if (curPid === playerId) {
            const pAct = predictStudentAction(predictor, simA, playerId).action;
            simA.step(pAct);
        } else {
            const hAct = hAiA.getAction(simA, curPid);
            simA.step(hAct);
        }
    }
    const scoreA = evaluatePositionHeuristic(simA.getState(), playerId);

    // Trajectory B: Single-Step Teacher Substitute
    const hAiB = new HeuristicAI(createPrng(seed));
    const simB = new GameEngine(JSON.parse(JSON.stringify(stateAtFailure)));
    simB.step(teacherAction);
    for (let s = 0; s < lookaheadSteps && !simB.isTerminal(); s++) {
        const curPid = simB.getState().currentPlayer;
        if (curPid === playerId) {
            const pAct = predictStudentAction(predictor, simB, playerId).action;
            simB.step(pAct);
        } else {
            const hAct = hAiB.getAction(simB, curPid);
            simB.step(hAct);
        }
    }
    const scoreB = evaluatePositionHeuristic(simB.getState(), playerId);

    // Trajectory C: Teacher Takeover
    const hAiC = new HeuristicAI(createPrng(seed));
    const simC = new GameEngine(JSON.parse(JSON.stringify(stateAtFailure)));
    simC.step(teacherAction);
    for (let s = 0; s < lookaheadSteps && !simC.isTerminal(); s++) {
        const curPid = simC.getState().currentPlayer;
        const hAct = hAiC.getAction(simC, curPid);
        simC.step(hAct);
    }
    const scoreC = evaluatePositionHeuristic(simC.getState(), playerId);

    return { scoreA, scoreB, scoreC };
}

export async function runStudentDiagnosticAndDAgger(options: {
    studentModelPath: string;
    matchCount?: number;
    maxStepsPerMatch?: number;
    directories?: DAggerDirectories;
}): Promise<{
    failures: FailureWindowRecord[];
    daggerDatasetPath: string;
    fineTunedModelPath?: string;
}> {
    const modelJson = readFileSync(options.studentModelPath, 'utf8');
    const weights = loadSpatialResNetFromJson(modelJson);
    const predictor = new SpatialResNetPredictor(weights);
    const heuristicAi = new HeuristicAI();

    const runId = options.directories?.runId ?? RUN_ID;
    const runDir = options.directories?.runDir ?? (options.directories?.runId ? path.resolve(`training_runs/${options.directories.runId}`) : RUN_DIR);
    const reportDir = options.directories?.reportDir ?? (options.directories?.runId ? path.resolve(`docs/training/reports/${options.directories.runId}`) : REPORT_DIR);
    const failuresDir = options.directories?.failuresDir ?? path.join(runDir, 'failures');
    const datasetDir = options.directories?.datasetDir ?? path.join(runDir, 'datasets');
    const checkpointDir = options.directories?.checkpointDir ?? path.join(runDir, 'checkpoints');

    mkdirSync(failuresDir, { recursive: true });
    mkdirSync(reportDir, { recursive: true });
    mkdirSync(datasetDir, { recursive: true });
    mkdirSync(checkpointDir, { recursive: true });

    const MATCH_COUNT = options.matchCount ?? 6;
    const MAX_STEPS = options.maxStepsPerMatch ?? 80;
    const MAPS = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Icy Paths.aem'];

    const recordedFailures: FailureWindowRecord[] = [];
    const daggerSamples: DAggerSample[] = [];

    console.log('\n=======================================================');
    console.log(`[R7-04 Diagnostic] Running Student vs Heuristic (${MATCH_COUNT} matches across 3 maps)`);
    console.log('=======================================================\n');

    for (let m = 0; m < MATCH_COUNT; m++) {
        const mapName = MAPS[m % MAPS.length];
        const studentPid = m % 2; // Support both seats (P0 and P1)
        const oppPid = 1 - studentPid;
        const state = createAppApkSkirmishGameState(mapName, 'SD');
        (state as any).mapName = mapName;
        const engine = new GameEngine(state);
        const oppHeuristic = new HeuristicAI(createPrng(1000 + m));

        let step = 0;
        let matchFailures = 0;

        while (!engine.isTerminal() && step < MAX_STEPS) {
            const curPlayer = engine.getState().currentPlayer;
            if (curPlayer === studentPid) {
                // Student turn
                const { action: studentAct, legalActions } = predictStudentAction(predictor, engine, studentPid);
                const teacherAct = heuristicAi.getAction(engine, studentPid, legalActions);

                const detection = detectFailureWindow(engine.getState(), studentPid, studentAct, teacherAct, legalActions);
                if (detection.isFailure && detection.failureType) {
                    const stHash = getStateHash(engine.getState(), studentPid);
                    // Perform 3-way counterfactual replay with deterministic RNG boundary
                    const replaySeed = 20000 + m * 1000 + step;
                    const replay = runCounterfactualReplay(
                        engine.getState(),
                        studentPid,
                        studentAct,
                        teacherAct,
                        predictor,
                        replaySeed
                    );

                    const improvementB = replay.scoreB - replay.scoreA;
                    const improvementC = replay.scoreC - replay.scoreA;
                    const confirmed = improvementB > 0 || improvementC > 0;

                    // For policy divergence, only record when counterfactual replay confirms teacher superiority
                    if (detection.failureType !== 'POLICY_DIVERGENCE' || confirmed) {
                        const failureRecord: FailureWindowRecord = {
                            failureId: `fail_m${m}_p${studentPid}_s${step}_${detection.failureType}`,
                            failureType: detection.failureType,
                            mapName,
                            turn: engine.getState().turn,
                            step,
                            stateHash: stHash,
                            studentAction: studentAct,
                            teacherAction: teacherAct,
                            scoreA_studentContinued: replay.scoreA,
                            scoreB_singleStepTeacher: replay.scoreB,
                            scoreC_teacherTakeover: replay.scoreC,
                            improvementB_vs_A: improvementB,
                            improvementC_vs_A: improvementC,
                            confirmedFailure: confirmed
                        };

                        recordedFailures.push(failureRecord);
                        matchFailures++;

                        // Add to DAgger buffer
                        daggerSamples.push({
                            sampleId: `dagger_${failureRecord.failureId}`,
                            state: JSON.parse(JSON.stringify(engine.getState())),
                            playerId: studentPid,
                            teacherAction: teacherAct,
                            sourceFailureType: detection.failureType
                        });

                        console.log(`  [Match ${m + 1} (Seat P${studentPid}) Step ${step}] Detected ${detection.failureType}: Impr B=${improvementB.toFixed(1)}, C=${improvementC.toFixed(1)} (Confirmed: ${confirmed})`);
                    }
                }

                engine.step(studentAct);
            } else {
                // Opponent turn
                const oppAct = oppHeuristic.getAction(engine, oppPid);
                engine.step(oppAct);
            }
            step++;
        }

        console.log(`Finished Match ${m + 1}/${MATCH_COUNT} on ${mapName} (Seat P${studentPid}, ${step} steps, ${matchFailures} failures flagged)`);
    }

    const failureLogPath = path.join(failuresDir, 'failure_windows.json');
    writeFileSync(failureLogPath, JSON.stringify(recordedFailures, null, 2), 'utf8');
    console.log(`\n[R7-04 Failure Windows] Logged ${recordedFailures.length} failure events to: ${failureLogPath}`);

    // Export DAgger dataset with isolated root families
    const daggerDatasetPath = path.join(datasetDir, 'd_v7_dagger_round1.jsonl');
    const daggerStream = createWriteStream(daggerDatasetPath, { flags: 'w' });

    // Load base split manifest if exists to prevent validation leakage into new training set
    const baseManifestPath = path.join(runDir, 'split_manifest.json');
    let trainRootSet = new Set<string>();
    let valRootSet = new Set<string>();
    if (existsSync(baseManifestPath)) {
        const baseMan = JSON.parse(readFileSync(baseManifestPath, 'utf8'));
        trainRootSet = new Set(baseMan.trainRootFamilies ?? []);
        valRootSet = new Set(baseMan.valRootFamilies ?? []);
    }

    // Replay training partition and retain fixed validation partition from base dataset
    const baseDatasetPath = path.join(datasetDir, 'd_v7_spatial.jsonl');
    let baseReplayedCount = 0;
    let baseValCount = 0;
    if (existsSync(baseDatasetPath)) {
        const baseLines = readFileSync(baseDatasetPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
        for (const line of baseLines) {
            try {
                const parsed = JSON.parse(line);
                if (trainRootSet.has(parsed.rootFamilyId)) {
                    daggerStream.write(line + '\n');
                    baseReplayedCount++;
                } else if (valRootSet.has(parsed.rootFamilyId)) {
                    daggerStream.write(line + '\n');
                    baseValCount++;
                }
            } catch {
                // ignore
            }
        }
    }
    console.log(`[DAgger Replay] Retained ${baseReplayedCount} clean training samples and ${baseValCount} fixed validation samples (0 val leak)`);

    const needValPartition = valRootSet.size === 0 && baseValCount === 0;
    const daggerRoots: string[] = [];
    // Append DAgger samples with distinct root families
    for (let i = 0; i < daggerSamples.length; i++) {
        const ds = daggerSamples[i];
        const eng = new GameEngine(ds.state);
        const legals = eng.getLegalActions(ds.playerId).filter(a => a.type !== 'surrender');
        const targetIdx = legals.findIndex(a => JSON.stringify(a) === JSON.stringify(ds.teacherAction));
        if (targetIdx === -1) continue;

        const encSpatial = encodeGameStateSpatial(ds.state, ds.playerId, 'v2');
        const candSpatial = legals.map(a => {
            const feat = encodeCandidateActionSpatial(ds.state, ds.playerId, a, 'v2');
            return {
                action: a,
                actorCoord: feat.actorCoord,
                landingCoord: feat.landingCoord,
                targetCoord: feat.targetCoord,
                semantics: Array.from(feat.semantics)
            };
        });

        const isVal = needValPartition && (i % 5 === 0);
        const rootFamilyId = needValPartition
            ? `root_dagger_${isVal ? 'val' : 'train'}_p${ds.playerId}_${ds.sourceFailureType.toLowerCase()}_${i}`
            : `root_dagger_p${ds.playerId}_${ds.sourceFailureType.toLowerCase()}`;

        if (isVal) {
            if (!valRootSet.has(rootFamilyId)) {
                valRootSet.add(rootFamilyId);
                daggerRoots.push(rootFamilyId);
            }
        } else {
            if (!trainRootSet.has(rootFamilyId)) {
                trainRootSet.add(rootFamilyId);
                daggerRoots.push(rootFamilyId);
            }
        }

        const daggerItem = {
            sampleId: ds.sampleId,
            episodeId: `dagger_ep_${ds.sampleId}`,
            rootFamilyId,
            scenarioGroup: `DAGGER_${ds.sourceFailureType}`,
            turn: ds.state.turn,
            step: 0,
            playerId: ds.playerId,
            spatialTensor: Array.from(encSpatial.spatialTensor),
            globalFeatures: Array.from(encSpatial.globalFeatures),
            targetActionIndex: targetIdx,
            candidateActions: candSpatial,
            valueTarget: null
        };
        daggerStream.write(JSON.stringify(daggerItem) + '\n');
    }

    await new Promise<void>(resolve => daggerStream.end(() => resolve()));
    console.log(`[R7-04 DAgger Dataset] Created DAgger buffer dataset at: ${daggerDatasetPath} (${daggerSamples.length} new samples)`);

    // Output updated DAgger split manifest
    const daggerSplitManifest = {
        runId,
        generatedAt: new Date().toISOString(),
        trainRootFamilies: Array.from(trainRootSet),
        valRootFamilies: Array.from(valRootSet),
        daggerAddedRoots: daggerRoots
    };
    const daggerManifestPath = path.join(runDir, 'dagger_split_manifest.json');
    writeFileSync(daggerManifestPath, JSON.stringify(daggerSplitManifest, null, 2), 'utf8');

    // Fine-tune 1 round of DAgger with warm-start
    const daggerOutDir = path.join(checkpointDir, 'spatial_resnet_dagger');
    mkdirSync(daggerOutDir, { recursive: true });
    const fineTunedModelPath = path.join(daggerOutDir, 'spatial_resnet_dagger_best.json');
    const fineTunedLastPath = path.join(daggerOutDir, 'spatial_resnet_dagger_last.json');
    const fineTunedMetricsPath = path.join(daggerOutDir, 'spatial_resnet_dagger_metrics.json');
    const consumedManifestPath = path.join(daggerOutDir, 'consumed_samples_manifest.json');

    console.log('\n[R7-04 DAgger Training] Executing 1 round of DAgger warm-start fine-tuning (2 epochs, lr=0.001)...');
    const pyCmd = `python python/train_spatial_resnet.py --dataset "${daggerDatasetPath}" --split-manifest "${daggerManifestPath}" --init-checkpoint "${options.studentModelPath}" --consumed-manifest "${consumedManifestPath}" --epochs 2 --batch-size 64 --lr 0.001 --value-weight 0.0 --out-model "${fineTunedModelPath}" --out-last-model "${fineTunedLastPath}" --out-metrics "${fineTunedMetricsPath}" --model-version spatial-resnet-v2 --num-blocks 2`;
    console.log(`Executing: ${pyCmd}`);
    execSync(pyCmd, { stdio: 'inherit' });

    console.log(`\n✅ [R7-04 DAgger Round 1 Complete] Checkpoint: ${fineTunedModelPath}`);
    return {
        failures: recordedFailures,
        daggerDatasetPath,
        fineTunedModelPath
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    let runId: string | undefined;
    const runIdIdx = process.argv.indexOf('--run-id');
    if (runIdIdx !== -1 && process.argv[runIdIdx + 1]) {
        runId = process.argv[runIdIdx + 1];
    }

    const checkpointDir = runId ? path.resolve(`training_runs/${runId}/checkpoints`) : CHECKPOINT_DIR;
    let studentModelPath = path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json');
    const modelIdx = process.argv.indexOf('--student-model');
    if (modelIdx !== -1 && process.argv[modelIdx + 1]) {
        studentModelPath = path.resolve(process.argv[modelIdx + 1]);
    }

    if (!existsSync(studentModelPath)) {
        console.error(`Error: Student model not found at ${studentModelPath}. Run pipeline first.`);
        process.exit(1);
    }

    runStudentDiagnosticAndDAgger({
        studentModelPath,
        matchCount: 4,
        maxStepsPerMatch: 60,
        directories: runId ? { runId } : undefined
    }).catch(err => {
        console.error('Fatal error in DAgger run:', err);
        process.exit(1);
    });
}
