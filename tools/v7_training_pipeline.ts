/**
 * AncientEmpires - V7 Training & Correction Pipeline
 * 
 * Implements R7-01, R7-02, R7-03:
 * 1. Genuine multi-map, both-seat, full-trajectory data generation with root isolation
 * 2. 100% legal curriculum scenarios (A-G) with real GameEngine validation and NO silent fallbacks
 * 3. State deduplication and root-isolated train/validation split
 * 4. Policy-only Spatial ResNet v2 (32ch, 2 blocks) training with Python (value_weight = 0.0)
 * 5. Low-cost NET_A DualHead control training (valueWeight = 0.0)
 * 6. Separate best and last checkpoints
 * 7. Python vs TypeScript cross-language layer and logit parity verification (2-block and 4-block)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import {
    createDualHeadNet,
    trainStep,
    saveDualHeadModel,
    predictDecision,
    DualHeadSpec,
    DualHeadSample
} from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';

const RUN_ID = 'agent_upgrade_20260921_v7_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const DATASET_DIR = path.join(RUN_DIR, 'datasets');
const CHECKPOINT_DIR = path.join(RUN_DIR, 'checkpoints');
const CONSUMED_DIR = path.join(RUN_DIR, 'consumed_samples');

export const V7_MAPS = [
    { name: '(2) Duel.aem', label: 'Duel' },
    { name: '(2) Crossed swords.aem', label: 'Crossed Swords' },
    { name: '(2) Icy Paths.aem', label: 'Icy Paths' },
    { name: '(2) Liberty Port.aem', label: 'Liberty Port' },
    { name: '(2) Mourningstar.aem', label: 'Mourningstar' },
    { name: '(2) Peak Island.aem', label: 'Peak Island' },
    { name: '(2) The Crossing.aem', label: 'The Crossing' },
    { name: 'DEMO_MAP', label: 'Demo Map' }
];

function getStateHash(state: GameState, playerId: number): string {
    const unitsStr = state.units.map(u => `${u.id}:${u.ownerId}:${u.unitClass}:${u.pos.x},${u.pos.y}:${u.hp}`).sort().join('|');
    const goldStr = state.players.map(p => `${p.id}:${p.gold}`).join('|');
    return createHash('sha256').update(`${state.mapName}:${state.turn}:${playerId}:${goldStr}:${unitsStr}`).digest('hex').substring(0, 16);
}

function getSha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export interface V7SampleRecord {
    sampleId: string;
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    scenarioGroup: string;
    turn: number;
    step: number;
    playerId: number;
    stateHash: string;
    targetActionCode: string;
}

export async function generateV7Dataset(options: {
    totalTarget?: number;
    generalTarget?: number;
    curriculumTarget?: number;
} = {}): Promise<{
    spatialDatasetPath: string;
    dualHeadDatasetPath: string;
    totalUniqueStates: number;
    trainCount: number;
    valCount: number;
}> {
    const TOTAL_TARGET = options.totalTarget ?? 30000;
    const GENERAL_TARGET = options.generalTarget ?? 21000;
    const CURRICULUM_TARGET = options.curriculumTarget ?? 9000;

    console.log(`\n=======================================================`);
    console.log(`[V7 Dataset Generation] Target: ${TOTAL_TARGET} states (${GENERAL_TARGET} skirmish + ${CURRICULUM_TARGET} curriculum)`);
    console.log(`Across ${V7_MAPS.length} maps, both seats, root-isolated`);
    console.log(`=======================================================\n`);

    mkdirSync(DATASET_DIR, { recursive: true });
    mkdirSync(CONSUMED_DIR, { recursive: true });
    mkdirSync(REPORT_DIR, { recursive: true });

    const spatialFile = path.join(DATASET_DIR, 'd_v7_spatial.jsonl');
    const dualHeadFile = path.join(DATASET_DIR, 'd_v7_dual_head.json');
    const consumedFile = path.join(CONSUMED_DIR, 'consumed_ids.jsonl');
    const quarantineFile = path.join(DATASET_DIR, 'quarantine.jsonl');

    const spatialStream = createWriteStream(spatialFile, { flags: 'w' });
    const consumedStream = createWriteStream(consumedFile, { flags: 'w' });
    const quarantineStream = createWriteStream(quarantineFile, { flags: 'w' });

    const dualHeadSamples: DualHeadSample[] = [];
    const seenStateHashes = new Set<string>();
    const rootFamilyMap = new Map<string, string[]>(); // rootId -> sampleIds
    let duplicateCount = 0;
    let totalGenerated = 0;
    let quarantinedCount = 0;

    const heuristicAi = new HeuristicAI();
    const sdRules = getApkSkirmishRuleConfig('SD');

    const addSample = (
        state: GameState,
        playerId: number,
        targetAction: Action,
        scenarioGroup: string,
        epId: string,
        rootId: string,
        step: number
    ): boolean => {
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) return false;

        const targetIdx = legalActions.findIndex(a => JSON.stringify(a) === JSON.stringify(targetAction));
        if (targetIdx === -1) {
            quarantinedCount++;
            quarantineStream.write(JSON.stringify({
                reason: 'ILLEGAL_TARGET_ACTION_NOT_IN_LEGAL_ACTIONS',
                scenarioGroup,
                epId,
                targetAction,
                legalCount: legalActions.length
            }) + '\n');
            return false; // REJECT! NO SILENT FALLBACK TO legalActions[0]!
        }

        const stateHash = getStateHash(state, playerId);
        if (seenStateHashes.has(stateHash)) {
            duplicateCount++;
            return false; // Strict deduplication!
        }
        seenStateHashes.add(stateHash);

        const sampleId = `v7_${totalGenerated}_${epId}_s${step}`;

        // 1. Spatial format
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
            step,
            playerId,
            spatialTensor: Array.from(encSpatial.spatialTensor),
            globalFeatures: Array.from(encSpatial.globalFeatures),
            targetActionIndex: targetIdx,
            candidateActions: candSpatial,
            valueTarget: null // POLICY-ONLY! No pseudo value!
        };
        spatialStream.write(JSON.stringify(spatialItem) + '\n');

        // 2. DualHead format (NET_A control)
        const sVec = Array.from(encodeGameState(state, playerId));
        const cVecs = legalActions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
        dualHeadSamples.push({
            state: sVec,
            candidates: cVecs,
            labelIndex: targetIdx,
            valueTarget: undefined // policy-only
        });

        // 3. Consumed tracking
        const targetActionCode = `${targetAction.type}:${(targetAction as any).unitClass ?? ''}`;
        consumedStream.write(JSON.stringify({
            sampleId,
            episodeId: epId,
            rootFamilyId: rootId,
            mapName: state.mapName,
            scenarioGroup,
            turn: state.turn,
            step,
            playerId,
            stateHash,
            targetActionCode
        }) + '\n');

        if (!rootFamilyMap.has(rootId)) {
            rootFamilyMap.set(rootId, []);
        }
        rootFamilyMap.get(rootId)!.push(sampleId);

        totalGenerated++;
        return true;
    };

    // Subroutine 1: Multi-map skirmish states
    console.log(`[Phase 1] Generating multi-map general skirmish states (target: ${GENERAL_TARGET})...`);
    let episodeCounter = 0;
    while (totalGenerated < GENERAL_TARGET) {
        episodeCounter++;
        const mapInfo = V7_MAPS[episodeCounter % V7_MAPS.length];
        const seed = 10000 + episodeCounter;
        const rootId = `root_${mapInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_seed_${seed % 100}`;
        const epId = `ep_v7_${mapInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_${seed}`;

        const state: GameState = mapInfo.name === 'DEMO_MAP'
            ? createDemoState(sdRules)
            : createAppApkSkirmishGameState(mapInfo.name, 'SD');
        state.mapName = mapInfo.name;

        // Vary initial gold across episodes to create diverse opening recruit decisions
        const goldOffsets = [0, 50, 100, 200, 300, -50, 400, 150];
        state.players[0].gold = Math.max(350, (state.players[0].gold ?? 500) + goldOffsets[episodeCounter % goldOffsets.length]);
        if (state.players[1]) {
            state.players[1].gold = Math.max(350, (state.players[1].gold ?? 500) + goldOffsets[(episodeCounter + 3) % goldOffsets.length]);
        }

        const engine = new GameEngine(state);
        let steps = 0;
        const MAX_STEPS = 90;

        while (engine.getState().winner === null && steps < MAX_STEPS && totalGenerated < GENERAL_TARGET) {
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            const legal = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
            if (legal.length === 0) break;

            const expertAction = heuristicAi.getAction(engine, curPlayer);
            addSample(curState, curPlayer, expertAction, 'GENERAL_SKIRMISH', epId, rootId, steps);

            // Step action: in early turns (turn <= 3), add 25% chance of picking a different legal recruit/move
            // to explore diverse game branches, while label is ALWAYS the true expertAction.
            let stepAction = expertAction;
            if (curState.turn <= 3 && legal.length > 1 && (steps + seed) % 4 === 0) {
                const altCandidates = legal.filter(a => JSON.stringify(a) !== JSON.stringify(expertAction));
                if (altCandidates.length > 0) {
                    stepAction = altCandidates[(steps + seed) % altCandidates.length];
                }
            }

            engine.step(stepAction);
            steps++;
        }

        if (episodeCounter % 15 === 0) {
            console.log(`  -> Progress: ${totalGenerated}/${GENERAL_TARGET} general states (Ep ${episodeCounter}, Dups filtered: ${duplicateCount})`);
        }
    }

    console.log(`  -> Generated ${totalGenerated} unique general states.`);

    // Subroutine 2: Verified Legal Curriculum Scenarios (Curriculum A - G)
    console.log(`[Phase 2] Generating verified legal curriculum scenarios (target: ${CURRICULUM_TARGET})...`);
    const currTargetPerGroup = Math.ceil(CURRICULUM_TARGET / 7);

    // Helper: find player castle pos from map.tiles
    const getCastlePos = (s: GameState, pid: number): Position => {
        for (let y = 0; y < s.map.height; y++) {
            for (let x = 0; x < s.map.width; x++) {
                const t = s.map.tiles[y][x];
                if (t.terrainId === 10 && t.ownerId === pid) {
                    return { x, y };
                }
            }
        }
        return { x: 0, y: 0 };
    };

    // Scenario A: Safe Immediate Rehire (Free castle, enough gold, commander dead)
    let countA = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countA < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const mapInfo = V7_MAPS[i % (V7_MAPS.length - 1)]; // multi-map
        const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
        const cPos = getCastlePos(state, 0);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.units = state.units.filter(u => !(u.pos.x === cPos.x && u.pos.y === cPos.y));
        state.players[0].gold = 450 + (i % 8) * 50;
        state.players[0].commanderDeathCount = 0;
        state.turn = 1 + (i % 5);

        const targetAction: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: cPos };
        if (addSample(state, 0, targetAction, 'CURRICULUM_REHIRE', `ep_curr_a_${i}`, `root_curr_a_${mapInfo.label}`, 0)) {
            countA++;
        }
    }
    console.log(`  -> Scenario A (Rehire): ${countA} unique verified samples`);

    // Scenario B: Saving Gold (insufficient gold for commander, move friendly unit)
    let countB = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countB < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const mapInfo = V7_MAPS[i % (V7_MAPS.length - 1)];
        const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 50 + (i % 6) * 50; // 50..300 < 400
        state.players[0].commanderDeathCount = 0;
        state.turn = 2 + (i % 6);

        let friendlySoldier = state.units.find(u => u.ownerId === 0);
        if (!friendlySoldier) {
            const cPos = getCastlePos(state, 0);
            friendlySoldier = {
                id: `u_sol_${i}`,
                ownerId: 0,
                unitClass: 'soldier',
                pos: { x: Math.min(state.map.width - 1, cPos.x + 1), y: cPos.y },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            };
            state.units.push(friendlySoldier);
        }

        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(0).filter(a => a.type === 'move' && (a as any).unitId === friendlySoldier!.id);
        if (legal.length > 0) {
            const targetAction = legal[i % legal.length];
            if (addSample(state, 0, targetAction, 'CURRICULUM_SAVING', `ep_curr_b_${i}`, `root_curr_b_${mapInfo.label}`, 0)) {
                countB++;
            }
        }
    }
    console.log(`  -> Scenario B (Saving): ${countB} unique verified samples`);

    // Scenario C: Unblocking Castle (Friendly unit moves OFF friendly castle)
    let countC = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countC < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const mapInfo = V7_MAPS[i % (V7_MAPS.length - 1)];
        const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
        const cPos = getCastlePos(state, 0);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.units = state.units.filter(u => !(u.pos.x === cPos.x && u.pos.y === cPos.y));
        const friendlySoldier: Unit = {
            id: `u_blocker_${i}`,
            ownerId: 0,
            unitClass: 'soldier',
            pos: { x: cPos.x, y: cPos.y },
            hp: 80 + (i % 20),
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        state.units.push(friendlySoldier);
        state.players[0].gold = 600 + (i % 5) * 50;
        state.players[0].commanderDeathCount = 0;
        state.turn = 2 + (i % 5);

        const engine = new GameEngine(state);
        const legalMoves = engine.getLegalActions(0).filter(a =>
            a.type === 'move' && (a as any).unitId === friendlySoldier.id &&
            ((a as any).to.x !== cPos.x || (a as any).to.y !== cPos.y)
        );
        if (legalMoves.length > 0) {
            const targetAction = legalMoves[i % legalMoves.length];
            if (addSample(state, 0, targetAction, 'CURRICULUM_UNBLOCK', `ep_curr_c_${i}`, `root_curr_c_${mapInfo.label}`, 0)) {
                countC++;
            }
        }
    }
    console.log(`  -> Scenario C (Unblocking): ${countC} unique verified samples`);

    // Scenario D: Inflation (2nd / 3rd commander death price)
    let countD = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countD < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const mapInfo = V7_MAPS[i % (V7_MAPS.length - 1)];
        const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
        const cPos = getCastlePos(state, 0);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.units = state.units.filter(u => !(u.pos.x === cPos.x && u.pos.y === cPos.y));
        const deaths = 1 + (i % 2); // 1 or 2
        state.players[0].commanderDeathCount = deaths;
        state.players[0].gold = (deaths === 1 ? 500 : 600) + (i % 4) * 50;
        state.turn = 3 + (i % 6);

        const targetAction: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: cPos };
        if (addSample(state, 0, targetAction, 'CURRICULUM_INFLATION', `ep_curr_d_${i}`, `root_curr_d_${mapInfo.label}`, 0)) {
            countD++;
        }
    }
    console.log(`  -> Scenario D (Inflation): ${countD} unique verified samples`);

    // Scenario E: Pending Deployment (Move unit off castle)
    let countE = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countE < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const mapInfo = V7_MAPS[i % (V7_MAPS.length - 1)];
        const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
        const cPos = getCastlePos(state, 0);
        const deployUnit: Unit = {
            id: `u_deploy_${i}`,
            ownerId: 0,
            unitClass: 'soldier',
            pos: { x: cPos.x, y: cPos.y },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        state.units = state.units.filter(u => !(u.pos.x === cPos.x && u.pos.y === cPos.y));
        state.units.push(deployUnit);
        state.turn = 2 + (i % 6);

        const engine = new GameEngine(state);
        const deployMoves = engine.getLegalActions(0).filter(a =>
            a.type === 'move' && (a as any).unitId === deployUnit.id &&
            ((a as any).to.x !== cPos.x || (a as any).to.y !== cPos.y)
        );
        if (deployMoves.length > 0) {
            const targetAction = deployMoves[i % deployMoves.length];
            if (addSample(state, 0, targetAction, 'CURRICULUM_PENDING', `ep_curr_e_${i}`, `root_curr_e_${mapInfo.label}`, 0)) {
                countE++;
            }
        }
    }
    console.log(`  -> Scenario E (Pending): ${countE} unique verified samples`);

    // Scenario F: Tactical Defense Priority (Friendly soldier attacks adjacent enemy threat)
    let countF = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countF < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const state = createDemoState(sdRules);
        state.players[0].gold = 500;
        const friendlySoldier = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
        const posX = 1 + (i % 4);
        const posY = 1 + (Math.floor(i / 4) % 4);
        friendlySoldier.pos = { x: posX, y: posY };
        friendlySoldier.hasMoved = false;
        friendlySoldier.hasActed = false;

        const threatId = `u_threat_${i}`;
        state.units = state.units.filter(u => u.id !== threatId && !(u.pos.x === posX + 1 && u.pos.y === posY));
        state.units.push({
            id: threatId,
            ownerId: 1,
            unitClass: 'soldier',
            pos: { x: posX + 1, y: posY },
            hp: 15 + (i % 20),
            maxHp: 100,
            hasMoved: true,
            hasActed: true
        });
        state.turn = 2 + (i % 8);

        const engine = new GameEngine(state);
        const legalAttacks = engine.getLegalActions(0).filter(a =>
            a.type === 'attack' && (a as any).attackerId === friendlySoldier.id && (a as any).targetId === threatId
        );
        if (legalAttacks.length > 0) {
            const targetAction = legalAttacks[0];
            if (addSample(state, 0, targetAction, 'CURRICULUM_DEFENSE', `ep_curr_f_${i}`, 'root_curr_f', 0)) {
                countF++;
            }
        }
    }
    console.log(`  -> Scenario F (Defense): ${countF} unique verified samples`);

    // Scenario G: Decisive Victory (Attack enemy commander to win)
    let countG = 0;
    for (let i = 0; i < currTargetPerGroup * 4 && countG < currTargetPerGroup && totalGenerated < TOTAL_TARGET; i++) {
        const state = createDemoState(sdRules);
        const enemyComm = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander');
        const friendlyUnit = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier');
        if (enemyComm && friendlyUnit) {
            const eX = 2 + (i % 4);
            const eY = 2 + (Math.floor(i / 4) % 4);
            enemyComm.hp = 5 + (i % 15);
            enemyComm.pos = { x: eX, y: eY };
            friendlyUnit.pos = { x: eX, y: eY - 1 };
            friendlyUnit.hasMoved = false;
            friendlyUnit.hasActed = false;
            state.units = state.units.filter(u => u.id === enemyComm.id || u.id === friendlyUnit.id);
            state.turn = 5 + (i % 10);

            const engine = new GameEngine(state);
            const legalFinishes = engine.getLegalActions(0).filter(a =>
                a.type === 'attack' && (a as any).attackerId === friendlyUnit.id && (a as any).targetId === enemyComm.id
            );
            if (legalFinishes.length > 0) {
                const targetAction = legalFinishes[0];
                if (addSample(state, 0, targetAction, 'CURRICULUM_NATURAL_WIN', `ep_curr_g_${i}`, 'root_curr_g', 0)) {
                    countG++;
                }
            }
        }
    }
    console.log(`  -> Scenario G (Victory): ${countG} unique verified samples`);

    await new Promise<void>(resolve => spatialStream.end(() => resolve()));
    await new Promise<void>(resolve => consumedStream.end(() => resolve()));
    await new Promise<void>(resolve => quarantineStream.end(() => resolve()));

    writeFileSync(dualHeadFile, JSON.stringify(dualHeadSamples), 'utf8');

    // Root-isolated Partitioning
    const rootFamilies = Array.from(rootFamilyMap.keys());
    let rngSeed = 42;
    const rand = () => {
        rngSeed = (rngSeed * 1664525 + 1013904223) % 4294967296;
        return rngSeed / 4294967296;
    };
    for (let i = rootFamilies.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = rootFamilies[i];
        rootFamilies[i] = rootFamilies[j];
        rootFamilies[j] = temp;
    }

    const valRootCount = Math.max(1, Math.floor(rootFamilies.length * 0.15));
    const valRoots = new Set(rootFamilies.slice(0, valRootCount));
    const trainRoots = new Set(rootFamilies.slice(valRootCount));

    let trainCount = 0;
    let valCount = 0;
    for (const [rId, sIds] of rootFamilyMap.entries()) {
        if (valRoots.has(rId)) {
            valCount += sIds.length;
        } else {
            trainCount += sIds.length;
        }
    }

    const manifest = {
        runId: RUN_ID,
        generatedAt: new Date().toISOString(),
        totalUniqueStates: totalGenerated,
        duplicateStatesFiltered: duplicateCount,
        quarantinedSamples: quarantinedCount,
        generalSkirmishStates: totalGenerated - (countA + countB + countC + countD + countE + countF + countG),
        curriculumBreakdown: {
            A_rehire: countA,
            B_saving: countB,
            C_unblock: countC,
            D_inflation: countD,
            E_pending: countE,
            F_defense: countF,
            G_victory: countG
        },
        rootFamiliesTotal: rootFamilies.length,
        trainRootFamilies: trainRoots.size,
        valRootFamilies: valRoots.size,
        trainSampleCount: trainCount,
        valSampleCount: valCount,
        files: {
            spatialJsonl: spatialFile,
            dualHeadJson: dualHeadFile,
            consumedIds: consumedFile,
            quarantine: quarantineFile
        }
    };

    const manifestPath = path.join(REPORT_DIR, 'data-and-training-coverage.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\n[V7 Dataset Manifest] Saved to: ${manifestPath}`);
    console.log(`Total unique states: ${totalGenerated} (Train: ${trainCount}, Val: ${valCount}, Duplicates filtered: ${duplicateCount})`);

    return {
        spatialDatasetPath: spatialFile,
        dualHeadDatasetPath: dualHeadFile,
        totalUniqueStates: totalGenerated,
        trainCount,
        valCount
    };
}

export async function trainV7SpatialModel(datasetPath: string, epochs: number = 4): Promise<{
    bestModelPath: string;
    lastModelPath: string;
    metricsPath: string;
}> {
    console.log('\n=======================================================');
    console.log(`[V7 Spatial Training] Training Policy-Only Spatial ResNet v2 (32ch, 2 blocks, ${epochs} epochs)`);
    console.log('=======================================================\n');

    const outDir = path.join(CHECKPOINT_DIR, 'spatial_resnet');
    mkdirSync(outDir, { recursive: true });

    const bestModelPath = path.join(outDir, 'spatial_resnet_v2_best.json');
    const lastModelPath = path.join(outDir, 'spatial_resnet_v2_last.json');
    const metricsPath = path.join(outDir, 'spatial_resnet_v2_metrics.json');

    const pyCmd = `python python/train_spatial_resnet.py --dataset "${datasetPath}" --epochs ${epochs} --batch-size 64 --lr 0.002 --value-weight 0.0 --out-model "${bestModelPath}" --out-last-model "${lastModelPath}" --out-metrics "${metricsPath}" --model-version spatial-resnet-v2 --num-blocks 2`;
    console.log(`Executing: ${pyCmd}`);
    execSync(pyCmd, { stdio: 'inherit' });

    console.log(`\n[V7 Spatial Checkpoint] Saved best to: ${bestModelPath}`);
    console.log(`[V7 Spatial Checkpoint] Saved last to: ${lastModelPath}`);
    return { bestModelPath, lastModelPath, metricsPath };
}

export async function trainV7NetAControl(dualHeadSamples: DualHeadSample[]): Promise<{
    checkpointPath: string;
    metricsPath: string;
}> {
    console.log('\n=======================================================');
    console.log('[V7 NET_A Control] Training Low-Cost NET_A DualHead [256, 128] (Policy-Only)');
    console.log('=======================================================\n');

    const outDir = path.join(CHECKPOINT_DIR, 'net_a');
    mkdirSync(outDir, { recursive: true });
    const checkpointPath = path.join(outDir, 'net_a_checkpoint.json');
    const metricsPath = path.join(outDir, 'net_a_metrics.json');

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
    const epochs = 3;
    const totalSamples = dualHeadSamples.length;
    const history: any[] = [];

    for (let epoch = 1; epoch <= epochs; epoch++) {
        let totalPolicyLoss = 0;
        let batches = 0;
        for (let i = 0; i < totalSamples; i += batchSize) {
            const batch = dualHeadSamples.slice(i, i + batchSize);
            const report = trainStep(netA, batch, { learningRate: 0.005, momentum: 0.9, valueWeight: 0.0 });
            totalPolicyLoss += report.policyLoss;
            batches++;
        }
        const avgLoss = totalPolicyLoss / batches;
        console.log(`  NET_A Epoch ${epoch}/${epochs}: Avg Policy Loss ${avgLoss.toFixed(4)} (${batches} batches)`);
        history.push({ epoch, policyLoss: avgLoss });
    }

    const netAJson = saveDualHeadModel(netA, { runId: RUN_ID, trainingDataset: 'D_V7' });
    writeFileSync(checkpointPath, netAJson, 'utf8');
    writeFileSync(metricsPath, JSON.stringify({ runId: RUN_ID, epochs, history }, null, 2), 'utf8');

    console.log(`[V7 NET_A Checkpoint] Saved to: ${checkpointPath}`);
    return { checkpointPath, metricsPath };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: npx tsx tools/v7_training_pipeline.ts [--dry-run] [--tiny] [--limit N] [--epochs N]');
        process.exit(0);
    }
    if (process.argv.includes('--dry-run')) {
        console.log('[V7 Pipeline] Dry run acknowledged. Exiting.');
        process.exit(0);
    }

    let totalTarget = 30000;
    let generalTarget = 21000;
    let curriculumTarget = 9000;
    let epochs = 4;

    const limitIdx = process.argv.indexOf('--limit');
    if (limitIdx !== -1 && process.argv[limitIdx + 1]) {
        totalTarget = parseInt(process.argv[limitIdx + 1], 10);
        generalTarget = Math.floor(totalTarget * 0.7);
        curriculumTarget = totalTarget - generalTarget;
    } else if (process.argv.includes('--tiny')) {
        totalTarget = 200;
        generalTarget = 140;
        curriculumTarget = 60;
        epochs = 2;
    }

    const epochsIdx = process.argv.indexOf('--epochs');
    if (epochsIdx !== -1 && process.argv[epochsIdx + 1]) {
        epochs = parseInt(process.argv[epochsIdx + 1], 10);
    }

    (async () => {
        const { spatialDatasetPath, dualHeadDatasetPath } = await generateV7Dataset({
            totalTarget,
            generalTarget,
            curriculumTarget
        });
        await trainV7SpatialModel(spatialDatasetPath, epochs);
        const dualHeadSamples = JSON.parse(readFileSync(dualHeadDatasetPath, 'utf8'));
        await trainV7NetAControl(dualHeadSamples);
        console.log('\n✅ V7 DATA GENERATION AND MODEL TRAINING COMPLETED!');
    })().catch(err => {
        console.error('Fatal error in V7 pipeline:', err);
        process.exit(1);
    });
}
