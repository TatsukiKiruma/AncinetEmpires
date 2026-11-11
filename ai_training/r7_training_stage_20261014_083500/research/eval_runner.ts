import fs from 'fs';
import path from 'path';
import { GameEngine } from '../env/src_game_frozen/engine';
import { createApkSkirmishGameState } from '../env/src_game_frozen/apk_skirmish';
import { getApkSkirmishMapManifestEntry } from '../env/src_game_frozen/apk_manifest';
import { parseAppApkSkirmishMap } from '../env/src_game_frozen/apk_skirmish_map_assets';
import { encodeAction } from '../env/src_game_frozen/env';
import { HeuristicAI } from '../env/src_game_frozen/ai/heuristic_ai';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../env/src_game_frozen/ai/spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionsSpatialForSchema,
    SPATIAL_TENSOR_CHANNELS_V19,
    ENCODER_SCHEMA_ID_V19
} from '../env/src_game_frozen/ai/spatial_tensor_encoder';
import { Mulberry32PRNG } from './prng';
import { computeGameplayStateKey, computeStateHash } from './state_hash';
import { createB100Policy } from '../../v17/teachers/b100_policy';
import type { Action, GameState } from '../env/src_game_frozen/types';

export type PolicyType = 'heuristic' | 'neural_model' | 'b100_q' | 'b100_r';

export interface PolicyConfig {
    type: PolicyType;
    id: string;
    modelJsonPath?: string;
    b100Variant?: 'B100-Q' | 'B100-R';
    b100Depth?: number;
}

export interface MatchStepRecord {
    stepIndex: number;
    player: number;
    actionEncoded: string;
    actionType: string;
    legalCount: number;
    durationMs: number;
}

export interface MatchResult {
    gameIndex: number;
    slotIndex: number;
    mapName: string;
    pairRound: number;
    matchSeed: number;
    seat0PolicyId: string;
    seat1PolicyId: string;
    candidateSeat: number; // 模型所在的座位 0 或 1
    totalSteps: number;
    winner: number | null; // engine.getWinner()
    outcomeCategory: 'natural_win' | 'natural_loss' | 'rule_draw' | 'step_truncated' | 'cycle_truncated' | 'timeout_truncated' | 'error';
    truncationReason?: string;
    errorMessage?: string;
    elapsedWallSeconds: number;
    replayTrace?: MatchStepRecord[];
    initialStateHash: string;
    finalStateHash: string;
}

export interface PanelReport {
    panelName: string;
    candidatePolicyId: string;
    opponentPolicyId: string;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    stepTruncations: number;
    cycleTruncations: number;
    timeoutTruncations: number;
    totalTruncations: number;
    errors: number;
    naturalWinRate: number; // wins / totalGames
    seat0Wins: number;
    seat1Wins: number;
    totalElapsedWallSeconds: number;
    results: MatchResult[];
}

/**
 * 策略接口：完全隔离的决策函数
 */
export type PolicyFunction = (
    isolatedState: GameState,
    legalActions: Action[],
    playerId: number,
    prng: Mulberry32PRNG
) => Action;

/**
 * 创建策略实例函数
 */
export function buildPolicy(cfg: PolicyConfig, initialSeed: number): PolicyFunction {
    if (cfg.type === 'heuristic') {
        return (state, legalActions, playerId, prng) => {
            const ai = new HeuristicAI(() => prng.next());
            const tempEngine = new GameEngine(state);
            return ai.getAction(tempEngine, playerId, legalActions);
        };
    }

    if (cfg.type === 'neural_model') {
        if (!cfg.modelJsonPath || !fs.existsSync(cfg.modelJsonPath)) {
            throw new Error(`Model weights file not found: ${cfg.modelJsonPath}`);
        }
        const jsonContent = fs.readFileSync(cfg.modelJsonPath, 'utf8');
        const weights = loadSpatialResNetFromJson(jsonContent);
        const predictor = new SpatialResNetPredictor(weights);
        const inCh = weights.stem.inChannels;
        const schemaId = inCh === 26 ? 'spatial26_global20_actionSemantics53_v15' : ENCODER_SCHEMA_ID_V19;

        return (state, legalActions, playerId, _prng) => {
            const encState = encodeGameStateSpatial(state, playerId, 'v2', {
                channels: inCh
            });
            const actionFeats = encodeCandidateActionsSpatialForSchema(
                state,
                playerId,
                legalActions,
                'v2',
                schemaId as any
            );
            const predResult = predictor.predict(encState, actionFeats);
            let bestIdx = 0;
            let bestLogit = -Infinity;
            for (let i = 0; i < predResult.actionLogits.length; i++) {
                if (predResult.actionLogits[i] > bestLogit) {
                    bestLogit = predResult.actionLogits[i];
                    bestIdx = i;
                }
            }
            return legalActions[bestIdx];
        };
    }

    if (cfg.type === 'b100_q' || cfg.type === 'b100_r') {
        const variant = cfg.b100Variant ?? (cfg.type === 'b100_q' ? 'B100-Q' : 'B100-R');
        let handle: any = null;
        return (state, legalActions, playerId, _prng) => {
            if (!handle) {
                handle = createB100Policy({
                    variant,
                    rootSeed: initialSeed,
                    seat: playerId,
                    querySeed: initialSeed
                });
            }
            return handle.policy({
                state,
                playerId,
                allowed: legalActions,
                seat: playerId,
                seed: initialSeed
            });
        };
    }

    throw new Error(`Unsupported policy type: ${cfg.type}`);
}

/**
 * 加载官方双人地图游戏初态
 */
export function createSkirmishMatchState(mapName: string): GameState {
    const map = parseAppApkSkirmishMap(mapName);
    return createApkSkirmishGameState(map, {
        mode: 'SD',
        mapName,
        setup: {
            initialGold: 300,
            unitLimit: 30,
            levelCap: 3
        },
        applyInitialTurnStart: true // 首回合开局仅结算一次
    });
}

/**
 * 运行单局严格对战
 */
export function runMatch(
    gameIndex: number,
    slotIndex: number,
    mapName: string,
    pairRound: number,
    matchSeed: number,
    candidateSeat: number,
    candidateCfg: PolicyConfig,
    opponentCfg: PolicyConfig,
    maxSteps: number = 3000,
    maxWallSeconds: number = 300,
    saveTrace: boolean = true
): MatchResult {
    const seat0Cfg = candidateSeat === 0 ? candidateCfg : opponentCfg;
    const seat1Cfg = candidateSeat === 1 ? candidateCfg : opponentCfg;

    const seat0Prng = new Mulberry32PRNG(matchSeed + 10);
    const seat1Prng = new Mulberry32PRNG(matchSeed + 20);

    const seat0Policy = buildPolicy(seat0Cfg, matchSeed + 10);
    const seat1Policy = buildPolicy(seat1Cfg, matchSeed + 20);

    const initialState = createSkirmishMatchState(mapName);
    const initialStateHash = computeStateHash(initialState);
    const engine = new GameEngine(initialState);

    const seenGameplayKeys = new Map<string, number>();
    const trace: MatchStepRecord[] = [];
    const startTime = Date.now();

    let stepCount = 0;
    let outcomeCategory: MatchResult['outcomeCategory'] | null = null;
    let truncationReason: string | undefined = undefined;
    let errorMessage: string | undefined = undefined;

    while (!engine.isTerminal()) {
        const curPlayer = engine.getState().currentPlayer;
        const legalActions = engine.getLegalActions(curPlayer);

        // 检查非终局空动作集：规则异常，严禁当作平局！
        if (legalActions.length === 0) {
            outcomeCategory = 'error';
            errorMessage = `Deadlock: non-terminal state has 0 legal actions for player ${curPlayer}`;
            break;
        }

        // 步数截断保护
        if (stepCount >= maxSteps) {
            outcomeCategory = 'step_truncated';
            truncationReason = `Exceeded maxSteps limit (${maxSteps})`;
            break;
        }

        // 墙钟超时保护
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec >= maxWallSeconds) {
            outcomeCategory = 'timeout_truncated';
            truncationReason = `Exceeded maxWallSeconds limit (${maxWallSeconds}s)`;
            break;
        }

        // 三折重复保护性截断（使用修复后的 gameplay state key）
        const gameplayKey = computeGameplayStateKey(engine.getState());
        const count = (seenGameplayKeys.get(gameplayKey) ?? 0) + 1;
        seenGameplayKeys.set(gameplayKey, count);
        if (count >= 3) {
            outcomeCategory = 'cycle_truncated';
            truncationReason = `Threefold state repetition detected (cycle protection)`;
            break;
        }

        // 策略隔离输入：深拷贝保证策略无法污染真实裁判
        const isolatedState: GameState = JSON.parse(JSON.stringify(engine.getState()));
        const policyFn = curPlayer === 0 ? seat0Policy : seat1Policy;
        const prng = curPlayer === 0 ? seat0Prng : seat1Prng;

        const stepT0 = Date.now();
        let chosenAction: Action;
        try {
            chosenAction = policyFn(isolatedState, legalActions, curPlayer, prng);
        } catch (err: any) {
            outcomeCategory = 'error';
            errorMessage = `Policy exception for player ${curPlayer}: ${err?.message ?? String(err)}`;
            break;
        }
        const stepDuration = Date.now() - stepT0;

        // 动作严格合法性校验 (Strict Membership Check)
        const chosenEncoded = encodeAction(chosenAction);
        const isLegal = legalActions.some(a => encodeAction(a) === chosenEncoded);
        if (!isLegal) {
            outcomeCategory = 'error';
            errorMessage = `Policy returned illegal action: ${JSON.stringify(chosenAction)}`;
            break;
        }

        // 推进裁判引擎
        try {
            engine.step(chosenAction);
        } catch (err: any) {
            outcomeCategory = 'error';
            errorMessage = `Engine step failed: ${err?.message ?? String(err)}`;
            break;
        }

        if (saveTrace) {
            trace.push({
                stepIndex: stepCount,
                player: curPlayer,
                actionEncoded: chosenEncoded,
                actionType: chosenAction.type,
                legalCount: legalActions.length,
                durationMs: stepDuration
            });
        }

        stepCount++;
    }

    const elapsedWallSeconds = (Date.now() - startTime) / 1000;
    const finalState = engine.getState();
    const finalStateHash = computeStateHash(finalState);
    const winner = engine.getWinner();

    // 如果没有截断且没有错误，判定自然终局
    if (outcomeCategory === null) {
        if (engine.isTerminal()) {
            if (winner === -1) {
                outcomeCategory = 'rule_draw';
            } else if (winner === candidateSeat) {
                outcomeCategory = 'natural_win';
            } else if (winner !== null && winner !== candidateSeat) {
                outcomeCategory = 'natural_loss';
            } else {
                outcomeCategory = 'error';
                errorMessage = `Engine isTerminal is true but winner is null`;
            }
        } else {
            outcomeCategory = 'error';
            errorMessage = 'Match loop terminated unexpectedly without reaching terminal state';
        }
    }

    return {
        gameIndex,
        slotIndex,
        mapName,
        pairRound,
        matchSeed,
        seat0PolicyId: seat0Cfg.id,
        seat1PolicyId: seat1Cfg.id,
        candidateSeat,
        totalSteps: stepCount,
        winner,
        outcomeCategory,
        truncationReason,
        errorMessage,
        elapsedWallSeconds,
        replayTrace: saveTrace ? trace : undefined,
        initialStateHash,
        finalStateHash
    };
}

/**
 * 运行完整的 20 局面板（基于预定义的 manifest）
 */
export function runPanelEvaluation(
    manifestPath: string,
    candidateCfg: PolicyConfig,
    opponentCfg: PolicyConfig,
    onProgress?: (idx: number, total: number, res: MatchResult) => void
): PanelReport {
    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const games = manifestRaw.games as any[];

    const results: MatchResult[] = [];
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let stepTruncations = 0;
    let cycleTruncations = 0;
    let timeoutTruncations = 0;
    let errors = 0;
    let seat0Wins = 0;
    let seat1Wins = 0;
    let totalWallSec = 0;

    for (let i = 0; i < games.length; i++) {
        const g = games[i];
        const res = runMatch(
            g.gameIndex,
            g.slotIndex,
            g.mapName,
            g.pairRound,
            g.matchSeed,
            g.candidateSeat,
            candidateCfg,
            opponentCfg,
            g.maxSteps,
            g.maxWallSeconds,
            true
        );
        results.push(res);
        totalWallSec += res.elapsedWallSeconds;

        if (res.outcomeCategory === 'natural_win') {
            wins++;
            if (res.candidateSeat === 0) seat0Wins++;
            else seat1Wins++;
        } else if (res.outcomeCategory === 'natural_loss') {
            losses++;
        } else if (res.outcomeCategory === 'rule_draw') {
            draws++;
        } else if (res.outcomeCategory === 'step_truncated') {
            stepTruncations++;
        } else if (res.outcomeCategory === 'cycle_truncated') {
            cycleTruncations++;
        } else if (res.outcomeCategory === 'timeout_truncated') {
            timeoutTruncations++;
        } else if (res.outcomeCategory === 'error') {
            errors++;
        }

        if (onProgress) {
            onProgress(i + 1, games.length, res);
        }
    }

    const totalTruncations = stepTruncations + cycleTruncations + timeoutTruncations;
    const naturalWinRate = games.length > 0 ? wins / games.length : 0;

    return {
        panelName: manifestRaw.manifestName,
        candidatePolicyId: candidateCfg.id,
        opponentPolicyId: opponentCfg.id,
        totalGames: games.length,
        wins,
        losses,
        draws,
        stepTruncations,
        cycleTruncations,
        timeoutTruncations,
        totalTruncations,
        errors,
        naturalWinRate,
        seat0Wins,
        seat1Wins,
        totalElapsedWallSeconds: totalWallSec,
        results
    };
}
