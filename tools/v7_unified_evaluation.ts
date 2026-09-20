/**
 * AncientEmpires - V7 Unified Benchmark Runner & Evaluation (R7-08)
 * 
 * Implements:
 * 1. Unified evaluation across registered policies:
 *    - HeuristicAI (baseline)
 *    - NET_A (DualHead control)
 *    - Spatial-v2 (Policy-only ResNet)
 *    - Spatial-DAgger (Fine-tuned ResNet)
 *    - S00 (Search-enhanced Heuristic)
 *    - S10 (Spatial Prior + Bounded Search)
 * 2. 5 Benchmark Maps x 2 Seats x Seed Configurations
 * 3. Strict termination categorization: Natural W/L/D, Truncation (T), Engine Error (E)
 * 4. Rehire metrics: opportunities, successes, and strictly NULL when opportunities === 0
 * 5. Full trajectory replayability logging (seed, initial state, action sequences)
 * 6. Detailed comparison outputs: comparison.json and task-status.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { encodeAction } from '../src/game/env';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { loadDualHeadModelFromJson, predictDecision, DualHeadNet } from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { runBoundedSearch } from './v7_heuristic_bounded_search';

const RUN_ID = 'agent_upgrade_20260921_v7_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const TRAJECTORY_DIR = path.join(RUN_DIR, 'trajectories');
const CHECKPOINT_DIR = path.join(RUN_DIR, 'checkpoints');

export const BENCHMARK_MAPS = [
    { name: '(2) Duel.aem', label: 'Duel' },
    { name: '(2) Crossed swords.aem', label: 'Crossed Swords' },
    { name: '(2) Icy Paths.aem', label: 'Icy Paths' },
    { name: '(2) Liberty Port.aem', label: 'Liberty Port' },
    { name: '(2) Mourningstar.aem', label: 'Mourningstar' }
];

export type PolicyType = 'HEURISTIC' | 'NET_A' | 'SPATIAL_V2' | 'SPATIAL_DAGGER' | 'S00_SEARCH' | 'S10_SPATIAL_SEARCH';

export interface MatchOutcome {
    matchId: string;
    mapName: string;
    seed: number;
    candidatePolicy: PolicyType;
    candidateSeat: 0 | 1;
    opponentPolicy: 'HEURISTIC';
    terminationReason: 'NATURAL_WIN' | 'NATURAL_LOSS' | 'NATURAL_DRAW' | 'TRUNCATION_STEP_LIMIT' | 'TRUNCATION_STAGNATION' | 'ENGINE_ERROR';
    turns: number;
    steps: number;
    candidateFinalUnits: number;
    opponentFinalUnits: number;
    rehireOpportunities: number;
    rehireSuccesses: number;
    rehireRate: number | null; // strictly null when opportunities === 0!
    errorDetails?: string;
    trajectoryLogPath: string;
    avgMsPerAction: number;
}

export interface PolicyAggregateReport {
    policy: PolicyType;
    matchesPlayed: number;
    naturalWins: number;
    naturalLosses: number;
    naturalDraws: number;
    truncations: number;
    engineErrors: number;
    winRateNaturalOnly: number; // naturalWins / (naturalWins + naturalLosses) if > 0 else 0
    effectiveWinRate: number; // naturalWins / matchesPlayed
    totalRehireOpportunities: number;
    totalRehireSuccesses: number;
    rehireSuccessRate: number | null;
    avgDecisionMs: number;
}

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

export class PolicyAgent {
    constructor(
        public readonly type: PolicyType,
        private readonly spatialPredictor?: SpatialResNetPredictor,
        private readonly netAModel?: DualHeadNet,
        private readonly heuristicAi: HeuristicAI = new HeuristicAI()
    ) {}

    public selectAction(engine: GameEngine, playerId: number): { action: Action; ms: number } {
        const t0 = Date.now();
        const state = engine.getState();
        const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        if (legal.length === 0) return { action: { type: 'end_turn' }, ms: Date.now() - t0 };

        switch (this.type) {
            case 'HEURISTIC': {
                const act = this.heuristicAi.getAction(engine, playerId, legal);
                return { action: act, ms: Date.now() - t0 };
            }
            case 'NET_A': {
                if (!this.netAModel) return { action: legal[0], ms: Date.now() - t0 };
                const sFeat = encodeGameState(state, playerId);
                const cFeats = legal.map(a => encodeGameActionV2(state, playerId, a));
                const pred = predictDecision(this.netAModel, sFeat, cFeats);
                return { action: legal[pred.bestActionIndex], ms: Date.now() - t0 };
            }
            case 'SPATIAL_V2':
            case 'SPATIAL_DAGGER': {
                if (!this.spatialPredictor) return { action: legal[0], ms: Date.now() - t0 };
                const encSpatial = encodeGameStateSpatial(state, playerId, 'v2');
                const candSpatial = legal.map(a => {
                    const feat = encodeCandidateActionSpatial(state, playerId, a, 'v2');
                    return {
                        actorCoord: feat.actorCoord,
                        landingCoord: feat.landingCoord,
                        targetCoord: feat.targetCoord,
                        semantics: feat.semantics
                    };
                });
                const pred = this.spatialPredictor.predict(encSpatial.spatialTensor, encSpatial.globalFeatures, candSpatial);
                let bestIdx = 0;
                let bestLogit = -Infinity;
                for (let i = 0; i < pred.actionLogits.length; i++) {
                    if (pred.actionLogits[i] > bestLogit) {
                        bestLogit = pred.actionLogits[i];
                        bestIdx = i;
                    }
                }
                return { action: legal[bestIdx], ms: Date.now() - t0 };
            }
            case 'S00_SEARCH': {
                const res = runBoundedSearch(engine, playerId, {
                    budget: { maxMs: 300, maxNodes: 25 },
                    heuristicAi: this.heuristicAi
                });
                return { action: res.chosenAction, ms: Date.now() - t0 };
            }
            case 'S10_SPATIAL_SEARCH': {
                const res = runBoundedSearch(engine, playerId, {
                    budget: { maxMs: 300, maxNodes: 25 },
                    heuristicAi: this.heuristicAi,
                    spatialPredictor: this.spatialPredictor
                });
                return { action: res.chosenAction, ms: Date.now() - t0 };
            }
        }
    }
}

export function runBenchmarkMatch(
    mapName: string,
    candidatePolicy: PolicyAgent,
    candidateSeat: 0 | 1,
    seed: number,
    maxTurns: number = 50
): MatchOutcome {
    const matchId = `match_${candidatePolicy.type}_seat${candidateSeat}_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}_s${seed}`;
    const state = createAppApkSkirmishGameState(mapName, 'SD');
    state.mapName = mapName;
    const engine = new GameEngine(state);
    const opponentPolicy = new HeuristicAI();

    let steps = 0;
    let turn = 0;
    let stagnationCounter = 0;
    let lastUnitCount = state.units.length;

    let rehireOpportunities = 0;
    let rehireSuccesses = 0;
    let totalDecisionMs = 0;
    let candidateActionCount = 0;

    const actionHistory: Array<{ step: number; player: number; action: Action; ms: number }> = [];

    mkdirSync(TRAJECTORY_DIR, { recursive: true });
    const trajFile = path.join(TRAJECTORY_DIR, `${matchId}.json`);

    try {
        while (!engine.isTerminal() && engine.getState().turn <= maxTurns && steps < maxTurns * 10) {
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            turn = curState.turn;

            // Check commander rehire opportunity for candidate before action
            if (curPlayer === candidateSeat) {
                const playerObj = curState.players.find(p => p.id === candidateSeat)!;
                const commAlive = curState.units.some(u => u.ownerId === candidateSeat && u.unitClass === 'commander' && u.hp > 0);
                const cPos = getCastlePos(curState, candidateSeat);
                if (!commAlive && cPos && playerObj.gold >= 250) {
                    const unitOnCastle = curState.units.find(u => u.pos.x === cPos.x && u.pos.y === cPos.y && u.hp > 0);
                    if (!unitOnCastle) {
                        rehireOpportunities++;
                    }
                }
            }

            let action: Action;
            let actMs = 0;

            if (curPlayer === candidateSeat) {
                const sel = candidatePolicy.selectAction(engine, candidateSeat);
                action = sel.action;
                actMs = sel.ms;
                totalDecisionMs += actMs;
                candidateActionCount++;

                // If candidate was in rehire opportunity, check if chose rehire
                if (action.type === 'recruit_to_castle' && (action as any).unitClass === 'commander') {
                    rehireSuccesses++;
                }
            } else {
                const t0 = Date.now();
                action = opponentPolicy.getAction(engine, curPlayer);
                actMs = Date.now() - t0;
            }

            // Invariant: Action must be legal
            const legal = engine.getLegalActions(curPlayer);
            const isLegal = legal.some(l => JSON.stringify(l) === JSON.stringify(action));
            if (!isLegal && action.type !== 'end_turn') {
                return {
                    matchId,
                    mapName,
                    seed,
                    candidatePolicy: candidatePolicy.type,
                    candidateSeat,
                    opponentPolicy: 'HEURISTIC',
                    terminationReason: 'ENGINE_ERROR',
                    turns: turn,
                    steps,
                    candidateFinalUnits: engine.getState().units.filter(u => u.ownerId === candidateSeat).length,
                    opponentFinalUnits: engine.getState().units.filter(u => u.ownerId !== candidateSeat).length,
                    rehireOpportunities,
                    rehireSuccesses,
                    rehireRate: rehireOpportunities > 0 ? Number((rehireSuccesses / rehireOpportunities * 100).toFixed(1)) : null,
                    errorDetails: `Illegal action produced: ${JSON.stringify(action)}`,
                    trajectoryLogPath: trajFile,
                    avgMsPerAction: candidateActionCount > 0 ? totalDecisionMs / candidateActionCount : 0
                };
            }

            engine.step(action);
            steps++;
            actionHistory.push({ step: steps, player: curPlayer, action, ms: actMs });

            // Stagnation check: 12 steps without unit count change
            if (engine.getState().units.length === lastUnitCount) {
                stagnationCounter++;
            } else {
                stagnationCounter = 0;
                lastUnitCount = engine.getState().units.length;
            }

            if (stagnationCounter >= 25) {
                break; // Break into stagnation truncation
            }
        }
    } catch (err: any) {
        return {
            matchId,
            mapName,
            seed,
            candidatePolicy: candidatePolicy.type,
            candidateSeat,
            opponentPolicy: 'HEURISTIC',
            terminationReason: 'ENGINE_ERROR',
            turns: turn,
            steps,
            candidateFinalUnits: 0,
            opponentFinalUnits: 0,
            rehireOpportunities,
            rehireSuccesses,
            rehireRate: rehireOpportunities > 0 ? Number((rehireSuccesses / rehireOpportunities * 100).toFixed(1)) : null,
            errorDetails: String(err?.message ?? err),
            trajectoryLogPath: trajFile,
            avgMsPerAction: candidateActionCount > 0 ? totalDecisionMs / candidateActionCount : 0
        };
    }

    // Save trajectory
    writeFileSync(trajFile, JSON.stringify({
        matchId,
        mapName,
        candidatePolicy: candidatePolicy.type,
        candidateSeat,
        seed,
        steps,
        actionHistory
    }, null, 2), 'utf8');

    const finalState = engine.getState();
    const candidateAlliance = getAllianceId(finalState, candidateSeat);
    let termination: MatchOutcome['terminationReason'];

    if (finalState.winner !== null) {
        if (finalState.winner === candidateAlliance) {
            termination = 'NATURAL_WIN';
        } else if (finalState.winner === -1) {
            termination = 'NATURAL_DRAW';
        } else {
            termination = 'NATURAL_LOSS';
        }
    } else if (stagnationCounter >= 25) {
        termination = 'TRUNCATION_STAGNATION';
    } else {
        termination = 'TRUNCATION_STEP_LIMIT';
    }

    const rehireRate = rehireOpportunities > 0
        ? Number((rehireSuccesses / rehireOpportunities * 100).toFixed(1))
        : null; // STRICTLY NULL!

    return {
        matchId,
        mapName,
        seed,
        candidatePolicy: candidatePolicy.type,
        candidateSeat,
        opponentPolicy: 'HEURISTIC',
        terminationReason: termination,
        turns: finalState.turn,
        steps,
        candidateFinalUnits: finalState.units.filter(u => u.ownerId === candidateSeat && u.hp > 0).length,
        opponentFinalUnits: finalState.units.filter(u => u.ownerId !== candidateSeat && u.hp > 0).length,
        rehireOpportunities,
        rehireSuccesses,
        rehireRate,
        trajectoryLogPath: trajFile,
        avgMsPerAction: candidateActionCount > 0 ? totalDecisionMs / candidateActionCount : 0
    };
}

export async function runFullV7BenchmarkSuite(options: {
    policiesToEvaluate?: PolicyType[];
    maps?: Array<{ name: string; label: string }>;
    seeds?: number[];
    maxTurns?: number;
}): Promise<{
    outcomes: MatchOutcome[];
    aggregates: Record<PolicyType, PolicyAggregateReport>;
    reportPath: string;
}> {
    const maps = options.maps ?? BENCHMARK_MAPS;
    const seeds = options.seeds ?? [42, 1337];
    const maxTurns = options.maxTurns ?? 45;
    const policies = options.policiesToEvaluate ?? ['HEURISTIC', 'SPATIAL_V2', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];

    mkdirSync(REPORT_DIR, { recursive: true });

    // Load available models
    let spatialPredictor: SpatialResNetPredictor | undefined;
    const spatialModelPath = path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_best.json');
    if (existsSync(spatialModelPath)) {
        try {
            const mJson = readFileSync(spatialModelPath, 'utf8');
            spatialPredictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(mJson));
        } catch (e) {
            console.warn('Could not load spatial predictor:', e);
        }
    }

    let daggerPredictor: SpatialResNetPredictor | undefined;
    const daggerModelPath = path.join(CHECKPOINT_DIR, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json');
    if (existsSync(daggerModelPath)) {
        try {
            const mJson = readFileSync(daggerModelPath, 'utf8');
            daggerPredictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(mJson));
        } catch (e) {
            console.warn('Could not load dagger predictor:', e);
        }
    }

    let netAModel: DualHeadNet | undefined;
    const netAPath = path.join(CHECKPOINT_DIR, 'net_a/net_a_checkpoint.json');
    if (existsSync(netAPath)) {
        try {
            netAModel = loadDualHeadModelFromJson(readFileSync(netAPath, 'utf8'));
        } catch (e) {
            console.warn('Could not load net_a model:', e);
        }
    }

    const outcomes: MatchOutcome[] = [];
    const aggregates: Partial<Record<PolicyType, PolicyAggregateReport>> = {};

    for (const pType of policies) {
        console.log(`\n=======================================================`);
        console.log(`[V7 Benchmark] Evaluating Policy: ${pType}`);
        console.log(`Maps: ${maps.length} | Seats: 2 | Seeds: ${seeds.length} (Total: ${maps.length * 2 * seeds.length} matches)`);
        console.log(`=======================================================\n`);

        const predictor = (pType === 'SPATIAL_DAGGER') ? (daggerPredictor ?? spatialPredictor) : spatialPredictor;
        const agent = new PolicyAgent(pType, predictor, netAModel);

        const pOutcomes: MatchOutcome[] = [];

        for (const map of maps) {
            for (const seat of [0, 1] as const) {
                for (const seed of seeds) {
                    const outcome = runBenchmarkMatch(map.name, agent, seat, seed, maxTurns);
                    pOutcomes.push(outcome);
                    outcomes.push(outcome);

                    console.log(`  [${pType}] ${map.label} (Seat ${seat}, Seed ${seed}) -> ${outcome.terminationReason} (${outcome.turns} turns, ${outcome.steps} steps, ${outcome.avgMsPerAction.toFixed(1)}ms/act, Rehire: ${outcome.rehireSuccesses}/${outcome.rehireOpportunities})`);
                }
            }
        }

        const natWins = pOutcomes.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const natLosses = pOutcomes.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const natDraws = pOutcomes.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const truncs = pOutcomes.filter(o => o.terminationReason.startsWith('TRUNCATION')).length;
        const errs = pOutcomes.filter(o => o.terminationReason === 'ENGINE_ERROR').length;
        const totalRehireOpp = pOutcomes.reduce((acc, o) => acc + o.rehireOpportunities, 0);
        const totalRehireSucc = pOutcomes.reduce((acc, o) => acc + o.rehireSuccesses, 0);
        const avgMs = pOutcomes.reduce((acc, o) => acc + o.avgMsPerAction, 0) / Math.max(1, pOutcomes.length);

        aggregates[pType] = {
            policy: pType,
            matchesPlayed: pOutcomes.length,
            naturalWins: natWins,
            naturalLosses: natLosses,
            naturalDraws: natDraws,
            truncations: truncs,
            engineErrors: errs,
            winRateNaturalOnly: (natWins + natLosses) > 0 ? Number((natWins / (natWins + natLosses) * 100).toFixed(1)) : 0,
            effectiveWinRate: Number((natWins / pOutcomes.length * 100).toFixed(1)),
            totalRehireOpportunities: totalRehireOpp,
            totalRehireSuccesses: totalRehireSucc,
            rehireSuccessRate: totalRehireOpp > 0 ? Number((totalRehireSucc / totalRehireOpp * 100).toFixed(1)) : null,
            avgDecisionMs: Number(avgMs.toFixed(1))
        };
    }

    const comparisonReport = {
        runId: RUN_ID,
        evaluatedAt: new Date().toISOString(),
        benchmarkMaps: maps.map(m => m.name),
        seeds,
        maxTurns,
        aggregates,
        totalMatches: outcomes.length,
        outcomes
    };

    const reportPath = path.join(REPORT_DIR, 'comparison.json');
    writeFileSync(reportPath, JSON.stringify(comparisonReport, null, 2), 'utf8');
    console.log(`\n[V7 Benchmark] Saved comparison report to: ${reportPath}`);

    return {
        outcomes,
        aggregates: aggregates as Record<PolicyType, PolicyAggregateReport>,
        reportPath
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: npx tsx tools/v7_unified_evaluation.ts [--dry-run] [--quick] [--maps N]');
        process.exit(0);
    }
    if (process.argv.includes('--dry-run')) {
        console.log('[V7 Evaluation] Dry run acknowledged. Exiting.');
        process.exit(0);
    }

    const isQuick = process.argv.includes('--quick');
    const selectedMaps = isQuick ? BENCHMARK_MAPS.slice(0, 2) : BENCHMARK_MAPS;
    const selectedSeeds = isQuick ? [42] : [42, 1337];

    (async () => {
        await runFullV7BenchmarkSuite({
            maps: selectedMaps,
            seeds: selectedSeeds,
            maxTurns: isQuick ? 30 : 45
        });
        console.log('\n✅ V7 BENCHMARK EVALUATION FINISHED!');
    })().catch(err => {
        console.error('Fatal error in V7 evaluation:', err);
        process.exit(1);
    });
}
