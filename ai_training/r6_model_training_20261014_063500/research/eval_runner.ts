import fs from 'fs';
import path from 'path';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { createB100Policy, B100PolicyHandle } from '../../v17/teachers/b100_policy';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../../src/game/ai/shared_spatial_policy';
import { DeterministicPRNG, deriveSeed } from './prng';
import { computeStateHash, computeGameplayStateKey } from './state_hash';
import { encodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import type { Action, GameState } from '../../../src/game/types';

export type PolicyType = 'heuristic' | 'b100_q' | 'b100_r' | 'p1' | 'theta1' | 'custom_model';

export interface PolicyConfig {
    type: PolicyType;
    id: string;
    modelJsonPath?: string;
}

export interface MatchResult {
    gameIndex: number;
    mapName: string;
    seat0PolicyId: string;
    seat1PolicyId: string;
    seed: number;
    winnerAlliance: number | null;
    isTruncated: boolean;
    truncationReason: 'none' | 'repeated_state' | 'step_limit' | 'wall_clock_timeout' | 'error';
    totalSteps: number;
    totalHandoffs: number;
    elapsedWallSeconds: number;
    initialStateHash: string;
    finalStateHash: string;
    actionCodes: string[];
    errorDetails?: string;
}

export interface PanelEvaluationReport {
    timestamp: string;
    policyA: string;
    policyB: string;
    maps: string[];
    totalGames: number;
    winsA: number;
    winsB: number;
    draws: number;
    truncations: number;
    errors: number;
    winRateA: number;
    seat0WinsA: number;
    seat1WinsA: number;
    results: MatchResult[];
}

export class EvaluationRunner {
    private predictorCache = new Map<string, SpatialResNetPredictor>();

    constructor() {}

    private getPredictor(jsonPath: string): SpatialResNetPredictor {
        if (!this.predictorCache.has(jsonPath)) {
            const text = fs.readFileSync(jsonPath, 'utf8');
            const weights = loadSpatialResNetFromJson(text);
            const predictor = new SpatialResNetPredictor(weights);
            this.predictorCache.set(jsonPath, predictor);
        }
        return this.predictorCache.get(jsonPath)!;
    }

    private makePolicyExecutor(
        cfg: PolicyConfig,
        seat: number,
        baseSeed: number
    ): (engine: GameEngine, allowed: readonly Action[]) => Action {
        const streamSeed = deriveSeed(baseSeed, `policy_seat_${seat}`, seat);

        if (cfg.type === 'heuristic') {
            const prng = new DeterministicPRNG(streamSeed);
            const ai = new HeuristicAI(() => prng.next());
            return (engine, allowed) => ai.getAction(engine, seat, allowed);
        }

        if (cfg.type === 'b100_r') {
            const handle = createB100Policy({
                variant: 'B100-R',
                rootSeed: streamSeed,
                seat
            });
            return (engine, allowed) => handle.policy({
                state: engine.getState(),
                playerId: seat,
                allowed,
                seat,
                seed: streamSeed
            });
        }

        if (cfg.type === 'b100_q') {
            const handle = createB100Policy({
                variant: 'B100-Q',
                rootSeed: streamSeed,
                seat,
                querySeed: 0
            });
            return (engine, allowed) => handle.policy({
                state: engine.getState(),
                playerId: seat,
                allowed,
                seat,
                seed: streamSeed
            });
        }

        if (cfg.type === 'p1') {
            const p1Path = 'ai_training/v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json';
            const predictor = this.getPredictor(p1Path);
            return (engine, allowed) => {
                const res = predictSpatialAction(predictor, engine.getState(), seat, allowed);
                return res.action;
            };
        }

        if (cfg.type === 'theta1') {
            const theta1Path = 'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json';
            const predictor = this.getPredictor(theta1Path);
            return (engine, allowed) => {
                const res = predictSpatialAction(predictor, engine.getState(), seat, allowed);
                return res.action;
            };
        }

        if (cfg.type === 'custom_model' && cfg.modelJsonPath) {
            const predictor = this.getPredictor(cfg.modelJsonPath);
            return (engine, allowed) => {
                const res = predictSpatialAction(predictor, engine.getState(), seat, allowed);
                return res.action;
            };
        }

        throw new Error(`Unknown policy type: ${cfg.type}`);
    }

    public runSingleMatch(
        gameIndex: number,
        mapName: string,
        seat0Cfg: PolicyConfig,
        seat1Cfg: PolicyConfig,
        seed: number,
        options: { maxSteps?: number; maxWallSeconds?: number } = {}
    ): MatchResult {
        const maxSteps = options.maxSteps ?? 4000;
        const maxWallSeconds = options.maxWallSeconds ?? 400;

        const state = createAppApkSkirmishGameState(mapName, 'SD');
        const initialStateHash = computeStateHash(state);
        const engine = new GameEngine(state);

        const exec0 = this.makePolicyExecutor(seat0Cfg, 0, seed);
        const exec1 = this.makePolicyExecutor(seat1Cfg, 1, seed);

        const actionCodes: string[] = [];
        const seenStateCounts = new Map<string, number>();

        let step = 0;
        let handoffs = 0;
        let lastPlayer = engine.getState().currentPlayer;
        let truncationReason: MatchResult['truncationReason'] = 'none';
        let isTruncated = false;
        let errorDetails: string | undefined;

        const startTime = performance.now();

        try {
            while (!engine.isTerminal()) {
                const elapsedSec = (performance.now() - startTime) / 1000;
                if (elapsedSec > maxWallSeconds) {
                    isTruncated = true;
                    truncationReason = 'wall_clock_timeout';
                    break;
                }

                if (step >= maxSteps) {
                    isTruncated = true;
                    truncationReason = 'step_limit';
                    break;
                }

                const curState = engine.getState();
                const curPlayer = curState.currentPlayer;
                if (curPlayer !== lastPlayer) {
                    handoffs++;
                    lastPlayer = curPlayer;
                }

                // 3折重复局面检测
                const stateKey = computeGameplayStateKey(curState);
                const count = (seenStateCounts.get(stateKey) ?? 0) + 1;
                seenStateCounts.set(stateKey, count);
                if (count >= 3) {
                    isTruncated = true;
                    truncationReason = 'repeated_state';
                    break;
                }

                const legal = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
                if (legal.length === 0) {
                    // 无合法动作时按规则应自动推进或结束，若引擎未终止则强行 break
                    break;
                }

                const action = curPlayer === 0 ? exec0(engine, legal) : exec1(engine, legal);
                actionCodes.push(encodeAction(action));
                engine.step(action);
                step++;
            }
        } catch (err: any) {
            isTruncated = true;
            truncationReason = 'error';
            errorDetails = err?.message || String(err);
        }

        const elapsedWallSeconds = (performance.now() - startTime) / 1000;
        const finalState = engine.getState();
        const finalWinner = engine.getWinner();
        const winnerAlliance = finalWinner !== null ? getAllianceId(finalState, finalWinner) : null;
        const finalStateHash = computeStateHash(finalState);

        return {
            gameIndex,
            mapName,
            seat0PolicyId: seat0Cfg.id,
            seat1PolicyId: seat1Cfg.id,
            seed,
            winnerAlliance,
            isTruncated,
            truncationReason,
            totalSteps: step,
            totalHandoffs: handoffs,
            elapsedWallSeconds,
            initialStateHash,
            finalStateHash,
            actionCodes,
            errorDetails
        };
    }

    public runPairPanel(
        policyA: PolicyConfig,
        policyB: PolicyConfig,
        maps: string[],
        baseSeed: number,
        options: { maxSteps?: number; maxWallSeconds?: number } = {}
    ): PanelEvaluationReport {
        const results: MatchResult[] = [];
        let winsA = 0;
        let winsB = 0;
        let draws = 0;
        let truncations = 0;
        let errors = 0;
        let seat0WinsA = 0;
        let seat1WinsA = 0;

        let gameIdx = 0;
        for (let mIdx = 0; mIdx < maps.length; mIdx++) {
            const mapName = maps[mIdx];
            const mapSeed = baseSeed + mIdx * 100;

            // Game 1: A as Seat0 (Player 0), B as Seat1 (Player 1)
            const g1 = this.runSingleMatch(gameIdx++, mapName, policyA, policyB, mapSeed, options);
            results.push(g1);
            if (g1.isTruncated) {
                if (g1.truncationReason === 'error') errors++;
                else truncations++;
            } else if (g1.winnerAlliance === 0) {
                winsA++;
                seat0WinsA++;
            } else if (g1.winnerAlliance === 1) {
                winsB++;
            } else {
                draws++;
            }

            // Game 2: B as Seat0 (Player 0), A as Seat1 (Player 1)
            const g2 = this.runSingleMatch(gameIdx++, mapName, policyB, policyA, mapSeed + 1, options);
            results.push(g2);
            if (g2.isTruncated) {
                if (g2.truncationReason === 'error') errors++;
                else truncations++;
            } else if (g2.winnerAlliance === 1) {
                winsA++;
                seat1WinsA++;
            } else if (g2.winnerAlliance === 0) {
                winsB++;
            } else {
                draws++;
            }
        }

        const totalGames = results.length;
        const winRateA = totalGames > 0 ? winsA / totalGames : 0;

        return {
            timestamp: new Date().toISOString(),
            policyA: policyA.id,
            policyB: policyB.id,
            maps,
            totalGames,
            winsA,
            winsB,
            draws,
            truncations,
            errors,
            winRateA,
            seat0WinsA,
            seat1WinsA,
            results
        };
    }
}
