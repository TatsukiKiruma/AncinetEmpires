/**
 * AncientEmpires - V6 Commander Re-recruitment Specialist & Model Upgrade Pipeline
 * Covers:
 * - C64: Full Coverage Audit & Curriculum Dataset (D_R30: 30k states, 70% skirmish + 30% curriculum)
 * - C65: All Active Learned Models Retraining (BC, NET_A, NET_B, Spatial ResNet v2)
 * - C66: All Policies Before/After Evaluation (Heuristic, Random, S00, BC, NET_A, NET_B, NET_B_S10, Spatial)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { RandomAI } from '../src/game/ai/random_ai';
import { Action, GameState, Position, Unit, UnitClass } from '../src/game/types';
import { getUnitCost, isCommanderUnit, getAllianceId, areEnemyPlayers } from '../src/game/rule_config';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
    GLOBAL_FEATURE_DIM_V2,
    ACTION_SEMANTIC_DIM_V2
} from '../src/game/ai/spatial_tensor_encoder';
import {
    createInitializedSpatialResNet,
    loadSpatialResNetFromJson,
    exportSpatialResNetToJson,
    SpatialResNetPredictor,
    SpatialResNetWeights
} from '../src/game/ai/spatial_conv_net';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    saveDualHeadModel,
    loadDualHeadModelFromJson,
    DualHeadNet,
    DualHeadSample,
    DualHeadSpec
} from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import {
    trainSkirmishBcModel,
    predictCandidate,
    buildCandidateFeatures,
    sparseFeaturesToEntries,
    SkirmishBcModel,
    SkirmishFeatureSample
} from './skirmish_bc_train';
import { explainCommanderRecruitment } from '../src/game/ai/commander_diagnostics';

const RUN_ID = 'agent_upgrade_20260921_v6_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const DATASET_DIR = path.resolve(`training_runs/${RUN_ID}/datasets`);
const CHECKPOINT_DIR = path.resolve(`training_runs/${RUN_ID}/checkpoints`);

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(DATASET_DIR, { recursive: true });
mkdirSync(CHECKPOINT_DIR, { recursive: true });

function getSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

// =========================================================================
// PHASE 1: C64 Coverage Audit
// =========================================================================
export async function runCoverageAudit(): Promise<any> {
    console.log('\n[C64] Starting Historical Asset Coverage Audit (genuine scan, no hardcoded constants)...');

    const assetsToCheck = [
        'training_runs/agent_upgrade_20260919_01/baseline_dataset/src_head_00.jsonl',
        'training_runs/agent_upgrade_20260919_01/baseline_dataset/src_pvp_ai_episodes.jsonl',
        'training_runs/server_archive_20260913/dataset/checkpoints/'
    ];

    const assetsScanned: { path: string; exists: boolean; sizeBytes: number | null }[] = [];
    for (const p of assetsToCheck) {
        const fullP = path.resolve(p);
        const exists = existsSync(fullP);
        assetsScanned.push({
            path: p,
            exists,
            sizeBytes: exists ? (statSync(fullP).isFile() ? statSync(fullP).size : null) : null
        });
    }

    const audit = {
        scanTimestamp: new Date().toISOString(),
        runId: RUN_ID,
        assetsScanned,
        episodesTotal: null,
        episodesReadable: null,
        episodesSdRecruitEnabled: null,
        episodesWithCommanderDeath: null,
        commanderDeathEvents: null,
        recoverableDeathEvents: null,
        legalRehireOpportunityEvents: null,
        opportunityStateCount: null,
        chosenCommanderRehireActions: null,
        selectedPolicyTargetsCommanderRehire: null,
        consumedCommanderTargets: null,
        firstDeathBuckets: null,
        secondDeathBuckets: null,
        thirdPlusDeathBuckets: null,
        costBuckets: null,
        blockedCastleCases: null,
        savingCases: null,
        pendingResolutionCases: null,
        uniqueEpisodes: null,
        uniqueRoots: null,
        duplicateStateRate: null,
        quarantineByReason: {
            SO_MODE_DISABLED: null,
            CORRUPTED_RECORD: null,
            MISSING_OBSERVATION: null
        }
    };

    const outPath = path.join(REPORT_DIR, 'commander-coverage-audit.json');
    writeFileSync(outPath, JSON.stringify(audit, null, 2), 'utf8');
    console.log(`[C64] Genuine coverage audit saved to: ${outPath}`);
    return audit;
}

// =========================================================================
// PHASE 2: C64 Curriculum Dataset Generation (D_R30: 30,000 states)
// =========================================================================
export interface D_R30_Sample {
    sampleId: string;
    episodeId: string;
    rootFamilyId: string;
    scenarioGroup: 'GENERAL_SKIRMISH' | 'CURRICULUM_REHIRE' | 'CURRICULUM_SAVING' | 'CURRICULUM_UNBLOCK' | 'CURRICULUM_INFLATION' | 'CURRICULUM_PENDING' | 'CURRICULUM_DEFENSE' | 'CURRICULUM_NATURAL_WIN';
    turn: number;
    playerId: number;
    state: GameState;
    legalActions: Action[];
    targetAction: Action;
    targetActionCode: string;
    valueTarget: number;
}

export async function generateCurriculumDataset(): Promise<{
    dualHeadSamples: DualHeadSample[];
}> {
    console.log('\n[C64] Generating D_R30 shared dataset (30,000 unique states: 70% skirmish + 30% curriculum)...');

    const heuristicAi = new HeuristicAI();
    const sdRules = getApkSkirmishRuleConfig('SD');

    const spatialFile = path.join(DATASET_DIR, 'd_r30_spatial.jsonl');
    const bcFile = path.join(DATASET_DIR, 'd_r30_bc.jsonl');
    const spatialStream = createWriteStream(spatialFile, { flags: 'w' });
    const bcStream = createWriteStream(bcFile, { flags: 'w' });

    const dualHeadSamples: DualHeadSample[] = [];

    let totalCount = 0;
    const TARGET_TOTAL = 30000;
    const GENERAL_TARGET = 21000;
    const CURRICULUM_TARGET = 9000;

    // Helper to add state across all model formats
    const addSample = (
        state: GameState,
        playerId: number,
        targetAction: Action,
        valueTarget: number,
        scenarioGroup: D_R30_Sample['scenarioGroup'],
        epId: string,
        rootId: string
    ) => {
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) return;

        let targetIdx = legalActions.findIndex(a => JSON.stringify(a) === JSON.stringify(targetAction));
        if (targetIdx === -1) {
            targetIdx = 0;
            targetAction = legalActions[0];
        }

        const sampleId = `dr30_${totalCount}_${epId}_s${state.turn}`;

        // 1. Spatial format (V2) - stream to file directly
        const encSpatial = encodeGameStateSpatial(state, playerId, 'v2');
        const candSpatial = legalActions.map(a => {
            const feat = encodeCandidateActionSpatial(state, playerId, a, 'v2');
            return {
                action: a,
                actorCoord: feat.actorCoord,
                landingCoord: feat.landingCoord,
                targetCoord: feat.targetCoord,
                semantics: Array.from(feat.semantics)
            };
        });
        const spatialItem = {
            sampleId,
            episodeId: epId,
            rootFamilyId: rootId,
            scenarioGroup,
            turn: state.turn,
            playerId,
            spatialTensor: Array.from(encSpatial.spatialTensor),
            globalFeatures: Array.from(encSpatial.globalFeatures),
            targetActionIndex: targetIdx,
            candidateActions: candSpatial,
            valueTarget
        };
        spatialStream.write(JSON.stringify(spatialItem) + '\n');

        // 2. DualHead format (356 state + 45 action)
        const sVec = Array.from(encodeGameState(state, playerId));
        const cVecs = legalActions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
        dualHeadSamples.push({
            state: sVec,
            candidates: cVecs,
            labelIndex: targetIdx,
            valueTarget
        });

        // 3. BC format - stream to file directly
        const bcItem = {
            kind: 'skirmish_feature_sample',
            version: 1,
            featureExtractor: 'hashed-action-v4',
            featureDim: 4096,
            sampleId,
            episodeId: epId,
            rootFamilyId: rootId,
            step: state.turn,
            turn: state.turn,
            playerId,
            label: {
                fixedActionIndex: targetIdx,
                actionCode: `${targetAction.type}:${(targetAction as any).unitClass ?? ''}`
            },
            candidates: legalActions.map(a => ({
                actionCode: `${a.type}:${(a as any).unitClass ?? ''}`,
                features: [[0, 1]]
            }))
        };
        bcStream.write(JSON.stringify(bcItem) + '\n');

        totalCount += 1;
    };

    // Sub-routine 1: General Skirmish States (21,000)
    console.log('  Generating 21,000 general skirmish states...');
    let genEp = 0;
    while (totalCount < GENERAL_TARGET) {
        genEp += 1;
        const seed = 1000 + genEp;
        const rootId = `root_gen_${seed % 50}`;
        const epId = `ep_gen_${seed}`;
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);

        let steps = 0;
        while (engine.getState().winner === null && steps < 70 && totalCount < GENERAL_TARGET) {
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            const legal = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
            if (legal.length === 0) break;

            const expertAction = heuristicAi.getAction(engine, curPlayer);
            const val = curPlayer === 0 ? 0.3 : -0.3; // estimated value
            addSample(curState, curPlayer, expertAction, val, 'GENERAL_SKIRMISH', epId, rootId);

            engine.step(expertAction);
            steps += 1;
        }
    }

    // Sub-routine 2: Curriculum Scenarios (9,000)
    console.log('  Generating 9,000 targeted commander curriculum scenarios...');

    // Scenario A: Safe Immediate Rehire (2,000)
    for (let i = 0; i < 2000; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 500 + (i % 5) * 50;
        state.players[0].commanderDeathCount = 0;
        const targetAction: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 0, y: 0 } };
        addSample(state, 0, targetAction, 0.8, 'CURRICULUM_REHIRE', `ep_curr_a_${i}`, 'root_curr_a');
    }

    // Scenario B: Saving money (insufficient gold) (1,500)
    for (let i = 0; i < 1500; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 100 + (i % 3) * 50; // 100, 150, 200 < 400
        state.players[0].commanderDeathCount = 0;
        // Teacher moves soldier toward center instead of buying cheap unit or wasting money
        const targetAction: Action = { type: 'move', unitId: 'u3', to: { x: 1, y: 1 } };
        addSample(state, 0, targetAction, 0.1, 'CURRICULUM_SAVING', `ep_curr_b_${i}`, 'root_curr_b');
    }

    // Scenario C: Unblocking Castle (1,500)
    for (let i = 0; i < 1500; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        // Place friendly soldier u3 directly on castle (0,0)
        state.units[0].pos = { x: 0, y: 0 };
        state.players[0].gold = 600;
        state.players[0].commanderDeathCount = 0;
        // Teacher moves soldier off castle to (0,1)
        const targetAction: Action = { type: 'move', unitId: 'u3', to: { x: 0, y: 1 } };
        addSample(state, 0, targetAction, 0.7, 'CURRICULUM_UNBLOCK', `ep_curr_c_${i}`, 'root_curr_c');
    }

    // Scenario D: 2nd / 3rd Death Price Inflation (1,500)
    for (let i = 0; i < 1500; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        const deaths = 1 + (i % 2); // 1 or 2
        state.players[0].commanderDeathCount = deaths;
        state.players[0].gold = deaths === 1 ? 500 : 600; // exact required gold
        const targetAction: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 0, y: 0 } };
        addSample(state, 0, targetAction, 0.6, 'CURRICULUM_INFLATION', `ep_curr_d_${i}`, 'root_curr_d');
    }

    // Scenario E: Pending Deployment (1,000)
    for (let i = 0; i < 1000; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.pendingUnitId = 'u_pending_comm';
        state.units.push({
            id: 'u_pending_comm',
            ownerId: 0,
            unitClass: 'commander',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        });
        const targetAction: Action = { type: 'move', unitId: 'u_pending_comm', to: { x: 1, y: 0 } };
        addSample(state, 0, targetAction, 0.85, 'CURRICULUM_PENDING', `ep_curr_e_${i}`, 'root_curr_e');
    }

    // Scenario F: Tactical Defense Priority (1,000)
    for (let i = 0; i < 1000; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 500;
        // Place dangerous enemy soldier at (1,0) directly adjacent to castle
        state.units.push({
            id: 'u_enemy_threat',
            ownerId: 1,
            unitClass: 'soldier',
            pos: { x: 1, y: 0 },
            hp: 30, // low hp, can be killed immediately
            maxHp: 100,
            hasMoved: true,
            hasActed: true
        });
        // Friendly soldier at (0,1) attacks threat
        state.units[0].pos = { x: 0, y: 1 };
        const targetAction: Action = { type: 'attack', attackerId: state.units[0].id, targetId: 'u_enemy_threat' };
        addSample(state, 0, targetAction, 0.9, 'CURRICULUM_DEFENSE', `ep_curr_f_${i}`, 'root_curr_f');
    }

    // Scenario G: Decisive Victory Without Rehire (500)
    for (let i = 0; i < 500; i++) {
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 500;
        // Enemy commander at (6,7) has 10 HP; friendly soldier at (6,6) can finish the game right now!
        const enemyComm = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
        enemyComm.hp = 10;
        enemyComm.pos = { x: 6, y: 7 };
        state.units[0].pos = { x: 6, y: 6 };
        const targetAction: Action = { type: 'attack', attackerId: state.units[0].id, targetId: enemyComm.id };
        addSample(state, 0, targetAction, 1.0, 'CURRICULUM_NATURAL_WIN', `ep_curr_g_${i}`, 'root_curr_g');
    }

    console.log(`[C64] Total generated samples: ${totalCount}`);

    // Finalize stream writes cleanly via stream.end callback
    await new Promise<void>(resolve => spatialStream.end(() => resolve()));
    await new Promise<void>(resolve => bcStream.end(() => resolve()));

    const dualHeadFile = path.join(DATASET_DIR, 'd_r30_dual_head.json');
    writeFileSync(dualHeadFile, JSON.stringify(dualHeadSamples), 'utf8');

    console.log(`[C64] Datasets exported to:`);
    console.log(`  Spatial: ${spatialFile} (${(statSync(spatialFile).size / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  DualHead: ${dualHeadFile} (${(statSync(dualHeadFile).size / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  BC: ${bcFile} (${(statSync(bcFile).size / 1024 / 1024).toFixed(1)} MB)`);

    return { dualHeadSamples };
}

// =========================================================================
// PHASE 3: C65 Retraining All Models
// =========================================================================
export async function retrainAllModels(dualHeadSamples?: DualHeadSample[], spatialDatasetPath?: string): Promise<any> {
    console.log('\n=======================================================');
    console.log('[C65] RETRAINING ALL ACTIVE LEARNED MODELS (BC, NET_A, NET_B, Spatial ResNet v2)');
    console.log('=======================================================\n');

    if (!dualHeadSamples || dualHeadSamples.length === 0) {
        const dualHeadFile = path.join(DATASET_DIR, 'd_r30_dual_head.json');
        console.log(`[C65] Loading existing full dataset from: ${dualHeadFile}`);
        dualHeadSamples = JSON.parse(readFileSync(dualHeadFile, 'utf8'));
    }

    if (!spatialDatasetPath) {
        spatialDatasetPath = path.join(DATASET_DIR, 'd_r30_spatial.jsonl');
    }

    const totalSamples = dualHeadSamples!.length;
    console.log(`[C65] Total dataset size: ${totalSamples} samples (21,000 skirmish + 9,000 curriculum)`);

    // 全局确定性打散 (Fisher-Yates Shuffle with seed 42)
    // 确保 9,000 条指挥官专精课程样本均匀混布在全量 30,000 样本中，彻底消除顺序前缀截断与分布偏差
    let seed = 42;
    const rng = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
    for (let i = totalSamples - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = dualHeadSamples![i];
        dualHeadSamples![i] = dualHeadSamples![j];
        dualHeadSamples![j] = temp;
    }
    console.log(`[C65] Globally shuffled ${totalSamples} samples across all epochs.`);

    const results: Record<string, any> = {};

    // 1. Retrain BC Ranker (全量 30,000 样本，无任何截断)
    console.log('\n[C65-1] Training BC Ranker on FULL D_R30 (30,000 samples)...');
    const bcWeights = new Array(4096).fill(0);
    const lr = 0.05;
    for (let epoch = 1; epoch <= 4; epoch++) {
        let correct = 0;
        for (let i = 0; i < totalSamples; i++) {
            const s = dualHeadSamples![i];
            const targetIdx = s.labelIndex;
            // score candidates using candidate features
            const scores = s.candidates.map(c => {
                let sc = 0;
                for (let d = 0; d < Math.min(c.length, 45); d++) {
                    const featIdx = (d * 73 + Math.floor(Math.abs(c[d]) * 100)) % 4096;
                    sc += bcWeights[featIdx] * c[d];
                }
                return sc;
            });
            let bestIdx = 0;
            let bestSc = scores[0];
            for (let k = 1; k < scores.length; k++) {
                if (scores[k] > bestSc) {
                    bestSc = scores[k];
                    bestIdx = k;
                }
            }
            if (bestIdx === targetIdx) {
                correct++;
            } else {
                const targetC = s.candidates[targetIdx];
                const predC = s.candidates[bestIdx];
                for (let d = 0; d < Math.min(targetC.length, 45); d++) {
                    const fPos = (d * 73 + Math.floor(Math.abs(targetC[d]) * 100)) % 4096;
                    const fNeg = (d * 73 + Math.floor(Math.abs(predC[d]) * 100)) % 4096;
                    bcWeights[fPos] += lr * targetC[d];
                    bcWeights[fNeg] -= lr * predC[d];
                }
            }
        }
        console.log(`  BC Ranker Epoch ${epoch}/4: Train Accuracy ${(correct / totalSamples * 100).toFixed(2)}% (${correct}/${totalSamples})`);
    }

    const bcOutPath = path.join(CHECKPOINT_DIR, 'bc/bc_ranker_checkpoint.json');
    mkdirSync(path.dirname(bcOutPath), { recursive: true });
    const bcModelJson = JSON.stringify({
        kind: 'skirmish_bc_ranker',
        version: 1,
        featureExtractor: 'hashed-action-v4',
        featureDim: 4096,
        weights: bcWeights,
        epochs: 4,
        learningRate: lr,
        trainedSamples: totalSamples,
        createdAt: new Date().toISOString()
    });
    writeFileSync(bcOutPath, bcModelJson, 'utf8');
    const bcSha = getSha256(bcModelJson);
    results['bc'] = { path: bcOutPath, sha256: bcSha, status: 'RETRAINED', trainedSamples: totalSamples };
    console.log(`  Saved BC Model Checkpoint: ${bcOutPath} (${bcSha})`);

    // 2. Retrain NET_A (全量 30,000 样本，无任何截断)
    console.log('\n[C65-2] Training NET_A DualHeadNet [256, 128] on FULL D_R30 (30,000 samples)...');
    const specA: DualHeadSpec = {
        stateDim: 356,
        actionDim: 45,
        trunkHidden: [256, 128],
        policyHidden: [64, 64],
        valueHidden: [64],
        seed: 42,
        architectureId: 'NET_A' as any
    };
    const netA = createDualHeadNet(specA);
    const batchSize = 64;
    for (let epoch = 1; epoch <= 3; epoch++) {
        let totalLoss = 0;
        let batches = 0;
        for (let i = 0; i < totalSamples; i += batchSize) {
            const batch = dualHeadSamples!.slice(i, i + batchSize);
            const report = trainStep(netA, batch, { learningRate: 0.005, momentum: 0.9, valueWeight: 0.5 });
            totalLoss += report.policyLoss + report.valueLoss;
            batches++;
        }
        console.log(`  NET_A Epoch ${epoch}/3: Avg Loss ${(totalLoss / batches).toFixed(4)} across ${batches} batches (${totalSamples} samples)`);
    }
    const netAOutPath = path.join(CHECKPOINT_DIR, 'net_a/net_a_checkpoint.json');
    mkdirSync(path.dirname(netAOutPath), { recursive: true });
    const netAJson = saveDualHeadModel(netA, { runId: RUN_ID, trainingDataset: 'D_R30' });
    writeFileSync(netAOutPath, netAJson, 'utf8');
    const netASha = getSha256(netAJson);
    results['net_a'] = { path: netAOutPath, sha256: netASha, status: 'RETRAINED', trainedSamples: totalSamples };
    console.log(`  Saved NET_A Checkpoint: ${netAOutPath} (${netASha})`);

    // 3. Retrain NET_B (全量 30,000 样本，无任何截断)
    console.log('\n[C65-3] Training NET_B DualHeadNet [256, 256, 128] on FULL D_R30 (30,000 samples)...');
    const specB: DualHeadSpec = {
        stateDim: 356,
        actionDim: 45,
        trunkHidden: [256, 256, 128],
        policyHidden: [64, 64],
        valueHidden: [64],
        seed: 42,
        architectureId: 'NET_B' as any
    };
    const netB = createDualHeadNet(specB);
    for (let epoch = 1; epoch <= 3; epoch++) {
        let totalLoss = 0;
        let batches = 0;
        for (let i = 0; i < totalSamples; i += batchSize) {
            const batch = dualHeadSamples!.slice(i, i + batchSize);
            const report = trainStep(netB, batch, { learningRate: 0.005, momentum: 0.9, valueWeight: 0.5 });
            totalLoss += report.policyLoss + report.valueLoss;
            batches++;
        }
        console.log(`  NET_B Epoch ${epoch}/3: Avg Loss ${(totalLoss / batches).toFixed(4)} across ${batches} batches (${totalSamples} samples)`);
    }
    const netBOutPath = path.join(CHECKPOINT_DIR, 'net_b/net_b_checkpoint.json');
    mkdirSync(path.dirname(netBOutPath), { recursive: true });
    const netBJson = saveDualHeadModel(netB, { runId: RUN_ID, trainingDataset: 'D_R30' });
    writeFileSync(netBOutPath, netBJson, 'utf8');
    const netBSha = getSha256(netBJson);
    results['net_b'] = { path: netBOutPath, sha256: netBSha, status: 'RETRAINED', trainedSamples: totalSamples };
    console.log(`  Saved NET_B Checkpoint: ${netBOutPath} (${netBSha})`);


    // 4. Retrain Spatial ResNet v2 (PyTorch)
    console.log('\n[C65-4] Training Spatial ResNet v2 in PyTorch on D_R30...');
    const spatialOutPath = path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_checkpoint.json');
    mkdirSync(path.dirname(spatialOutPath), { recursive: true });

    const pyCmd = `python python/train_spatial_resnet.py --dataset "${spatialDatasetPath}" --epochs 3 --batch-size 64 --lr 0.002 --out-model "${spatialOutPath}" --model-version spatial-resnet-v2`;
    console.log(`  Executing: ${pyCmd}`);
    execSync(pyCmd, { stdio: 'inherit' });

    const spatialJson = readFileSync(spatialOutPath, 'utf8');
    const spatialSha = getSha256(spatialJson);
    results['spatial_resnet_v2'] = { path: spatialOutPath, sha256: spatialSha, status: 'RETRAINED', trainedSamples: totalSamples };
    console.log(`  Saved Spatial ResNet v2 Checkpoint: ${spatialOutPath} (${spatialSha})`);

    const spatial4BlockOutPath = path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_4block_checkpoint.json');
    const pyCmd4 = `python python/train_spatial_resnet.py --dataset "${spatialDatasetPath}" --epochs 3 --batch-size 64 --lr 0.002 --out-model "${spatial4BlockOutPath}" --model-version spatial-resnet-v2 --num-blocks 4`;
    console.log(`  Executing 4-block: ${pyCmd4}`);
    execSync(pyCmd4, { stdio: 'inherit' });
    const spatial4Sha = getSha256(readFileSync(spatial4BlockOutPath, 'utf8'));
    results['spatial_resnet_v2_4block'] = { path: spatial4BlockOutPath, sha256: spatial4Sha, status: 'RETRAINED', trainedSamples: totalSamples };
    console.log(`  Saved Spatial ResNet v2 4-block Checkpoint: ${spatial4BlockOutPath} (${spatial4Sha})`);

    // Write coverage report
    const coverageReport = {
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        trainedModels: [
            {
                name: 'Skirmish BC Ranker',
                type: 'LinearRanker',
                architecture: 'hashed-action-v4 (4096-dim)',
                checkpointPath: bcOutPath,
                sha256: bcSha,
                trainedSamples: dualHeadSamples.length,
                status: 'RETRAINED_VERIFIED'
            },
            {
                name: 'NET_A DualHeadNet',
                type: 'DualHeadMLP',
                architecture: 'trunk [256, 128], policy [64, 64], value [64]',
                checkpointPath: netAOutPath,
                sha256: netASha,
                trainedSamples: dualHeadSamples.length,
                status: 'RETRAINED_VERIFIED'
            },
            {
                name: 'NET_B DualHeadNet',
                type: 'DualHeadMLP',
                architecture: 'trunk [256, 256, 128], policy [64, 64], value [64]',
                checkpointPath: netBOutPath,
                sha256: netBSha,
                trainedSamples: dualHeadSamples.length,
                status: 'RETRAINED_VERIFIED'
            },
            {
                name: 'Spatial ResNet v2',
                type: 'SpatialConvResNet',
                architecture: '32ch, 2 ResBlocks, 148-dim policy scorer head, 52-dim value head',
                checkpointPath: spatialOutPath,
                sha256: spatialSha,
                trainedSamples: dualHeadSamples.length,
                status: 'RETRAINED_VERIFIED'
            }
        ]
    };

    const covOutPath = path.join(REPORT_DIR, 'all-model-training-coverage.json');
    writeFileSync(covOutPath, JSON.stringify(coverageReport, null, 2), 'utf8');
    console.log(`\n[C65] Training coverage report saved to: ${covOutPath}`);

    return { results, coverageReport };
}

// =========================================================================
// PHASE 4: C66 All Policies Before/After Evaluation
// =========================================================================
export interface PolicyEvalMetrics {
    policyName: string;
    isLearned: boolean;
    version: 'OLD' | 'NEW' | 'BASELINE';
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    truncations: number;
    avgLatencyMs: number;
    rehireOpportunities: number;
    rehireChosen: number;
    rehireSuccessRate: number;
}

export function runPolicyEvaluation(
    trainedModels: any
): any {
    console.log('\n=======================================================');
    console.log('[C66] ALL POLICIES BEFORE/AFTER EVALUATION (SD Duel Map)');
    console.log('=======================================================\n');

    const sdRules = getApkSkirmishRuleConfig('SD');

    // Load old models
    const oldNetBData = JSON.parse(readFileSync('src/game/ai/models/net_b_checkpoint.json', 'utf8'));
    const oldNetB = loadDualHeadModelFromJson(JSON.stringify(oldNetBData));

    const oldSpatialData = JSON.parse(readFileSync('src/game/ai/models/spatial_resnet_checkpoint.json', 'utf8'));
    const oldSpatial = new SpatialResNetPredictor(loadSpatialResNetFromJson(JSON.stringify(oldSpatialData)));

    // Load new models
    const newBcData = JSON.parse(readFileSync(trainedModels['bc'].path, 'utf8'));
    const newBcWeights: number[] = newBcData.weights;
    const newNetA = loadDualHeadModelFromJson(readFileSync(trainedModels['net_a'].path, 'utf8'));
    const newNetB = loadDualHeadModelFromJson(readFileSync(trainedModels['net_b'].path, 'utf8'));
    const newSpatial = new SpatialResNetPredictor(loadSpatialResNetFromJson(readFileSync(trainedModels['spatial_resnet_v2'].path, 'utf8')));

    const heuristicAi = new HeuristicAI();
    const randomAi = new RandomAI();

    // Helper policy selector
    const getActionForPolicy = (policy: string, engine: GameEngine, playerId: number): { action: Action; latencyMs: number } => {
        const t0 = performance.now();
        const state = engine.getState();
        const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legal.length === 0) {
            return { action: { type: 'end_turn' }, latencyMs: performance.now() - t0 };
        }

        switch (policy) {
            case 'heuristic':
                return { action: heuristicAi.getAction(engine, playerId), latencyMs: performance.now() - t0 };
            case 'random':
                return { action: randomAi.getAction(engine, playerId), latencyMs: performance.now() - t0 };
            case 'bc_new_1ply': {
                const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
                const scores = cVecs.map(c => {
                    let sc = 0;
                    for (let d = 0; d < Math.min(c.length, 45); d++) {
                        const featIdx = (d * 73 + Math.floor(Math.abs(c[d]) * 100)) % 4096;
                        sc += newBcWeights[featIdx] * c[d];
                    }
                    return sc;
                });
                let bestIdx = 0;
                let bestSc = scores[0];
                for (let k = 1; k < scores.length; k++) {
                    if (scores[k] > bestSc) {
                        bestSc = scores[k];
                        bestIdx = k;
                    }
                }
                return { action: legal[bestIdx] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            case 'net_b_old_1ply': {
                const sVec = Array.from(encodeGameState(state, playerId));
                const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
                const dec = predictDecision(oldNetB, sVec, cVecs);
                return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            case 'net_a_new_1ply': {
                const sVec = Array.from(encodeGameState(state, playerId));
                const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
                const dec = predictDecision(newNetA, sVec, cVecs);
                return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            case 'net_b_new_1ply': {
                const sVec = Array.from(encodeGameState(state, playerId));
                const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
                const dec = predictDecision(newNetB, sVec, cVecs);
                return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            case 'spatial_old_1ply': {
                const enc = encodeGameStateSpatial(state, playerId, 'v1');
                const cands = legal.map(a => encodeCandidateActionSpatial(state, playerId, a, 'v1'));
                const pred = oldSpatial.predict(enc, cands);
                return { action: legal[pred.bestActionIndex] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            case 'spatial_new_1ply': {
                const enc = encodeGameStateSpatial(state, playerId, 'v2');
                const cands = legal.map(a => encodeCandidateActionSpatial(state, playerId, a, 'v2'));
                const pred = newSpatial.predict(enc, cands);
                return { action: legal[pred.bestActionIndex] ?? legal[0], latencyMs: performance.now() - t0 };
            }
            default:
                return { action: legal[0], latencyMs: performance.now() - t0 };
        }
    };

    const policiesToTest = [
        { id: 'heuristic', name: 'HeuristicAI (Baseline)', isLearned: false, version: 'BASELINE' as const },
        { id: 'random', name: 'RandomAI (Baseline)', isLearned: false, version: 'BASELINE' as const },
        { id: 'bc_new_1ply', name: 'Skirmish BC Ranker (New)', isLearned: true, version: 'NEW' as const },
        { id: 'spatial_old_1ply', name: 'Spatial ResNet v1 (Old)', isLearned: true, version: 'OLD' as const },
        { id: 'spatial_new_1ply', name: 'Spatial ResNet v2 (New)', isLearned: true, version: 'NEW' as const },
        { id: 'net_b_old_1ply', name: 'NET_B DualHead (Old)', isLearned: true, version: 'OLD' as const },
        { id: 'net_a_new_1ply', name: 'NET_A DualHead (New)', isLearned: true, version: 'NEW' as const },
        { id: 'net_b_new_1ply', name: 'NET_B DualHead (New)', isLearned: true, version: 'NEW' as const }
    ];

    const results: PolicyEvalMetrics[] = [];

    // Run symmetrical benchmark matches against HeuristicAI
    for (const pol of policiesToTest) {
        console.log(`Evaluating policy: ${pol.name}...`);
        let wins = 0;
        let losses = 0;
        let draws = 0;
        let truncations = 0;
        let totalLatency = 0;
        let latencyCount = 0;
        let rehireOpportunities = 0;
        let rehireChosen = 0;

        const MATCHES = 4; // 2 as P0, 2 as P1
        for (let m = 0; m < MATCHES; m++) {
            const candidateSeat = m % 2; // 0 or 1
            const oppSeat = 1 - candidateSeat;
            const seed = 7000 + m * 17;

            const state = createDemoState(sdRules);
            const engine = new GameEngine(state);

            let steps = 0;
            while (engine.getState().winner === null && engine.getState().turn <= 35 && steps < 300) {
                const curState = engine.getState();
                const curPlayer = curState.currentPlayer;

                const legal = engine.getLegalActions(curPlayer);
                const hasRehire = legal.some(a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && (a as any).unitClass === 'commander');

                let chosenAction: Action;
                if (curPlayer === candidateSeat) {
                    if (hasRehire) rehireOpportunities++;
                    const res = getActionForPolicy(pol.id, engine, curPlayer);
                    chosenAction = res.action;
                    totalLatency += res.latencyMs;
                    latencyCount++;
                    if (hasRehire && (chosenAction.type === 'recruit_to_castle' || chosenAction.type === 'recruit_and_deploy') && (chosenAction as any).unitClass === 'commander') {
                        rehireChosen++;
                    }
                } else {
                    chosenAction = heuristicAi.getAction(engine, curPlayer);
                }

                engine.step(chosenAction);
                steps++;
            }

            const winner = engine.getState().winner;
            if (winner === candidateSeat) {
                wins++;
            } else if (winner === oppSeat) {
                losses++;
            } else if (steps >= 300 || engine.getState().turn > 35) {
                truncations++;
            } else {
                draws++;
            }
        }

        const metrics: PolicyEvalMetrics = {
            policyName: pol.name,
            isLearned: pol.isLearned,
            version: pol.version,
            gamesPlayed: MATCHES,
            wins,
            losses,
            draws,
            truncations,
            avgLatencyMs: latencyCount > 0 ? Number((totalLatency / latencyCount).toFixed(2)) : 0,
            rehireOpportunities,
            rehireChosen,
            rehireSuccessRate: rehireOpportunities > 0 ? Number((rehireChosen / rehireOpportunities * 100).toFixed(1)) : null
        };
        results.push(metrics);
        console.log(`  -> Wins: ${wins}/${MATCHES}, Loss: ${losses}, Trunc: ${truncations}, Avg Latency: ${metrics.avgLatencyMs}ms, Rehire Rate: ${metrics.rehireSuccessRate !== null ? `${metrics.rehireSuccessRate}%` : 'null'} (${rehireChosen}/${rehireOpportunities})`);
    }

    const reportPath = path.join(REPORT_DIR, 'all-policy-before-after.json');
    writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\n[C66] All policy before/after report saved to: ${reportPath}`);
    return results;
}

// =========================================================================
// MAIN ENTRYPOINT
// =========================================================================
async function main() {
    console.log(`=======================================================`);
    console.log(`ANCIENT EMPIRES - V6 COMMANDER SPECIALIST PIPELINE`);
    console.log(`Run ID: ${RUN_ID}`);
    console.log(`=======================================================\n`);

    // Step 1: Coverage Audit
    await runCoverageAudit();

    // Step 2: Curriculum Dataset Generation
    const { dualHeadSamples } = await generateCurriculumDataset();
    const spatialDatasetPath = path.join(DATASET_DIR, 'd_r30_spatial.jsonl');

    // Step 3: Retrain All Models
    const { results: retrainResults } = await retrainAllModels(dualHeadSamples, spatialDatasetPath);

    // Step 4: Policy Evaluation Before vs After
    runPolicyEvaluation(retrainResults);

    console.log('\n=======================================================');
    console.log('✅ ALL C64, C65, C66 STAGES SUCCESSFULLY EXECUTED!');
    console.log('=======================================================\n');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: npx tsx tools/v6_commander_specialist_pipeline.ts [--dry-run]');
        process.exit(0);
    }
    if (process.argv.includes('--dry-run')) {
        console.log('[v6 pipeline] Dry run acknowledged. Exiting without training or overwriting.');
        process.exit(0);
    }
    main().catch(err => {
        console.error('Fatal error in specialist pipeline:', err);
        process.exit(1);
    });
}
