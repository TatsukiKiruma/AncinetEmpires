/** 中文：搜索与复核共用的确定性续弈器，负责规则边界、预算和结果分类。 */
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import type { SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { encodeAction } from '../../src/game/env';
import { areEnemyPlayers, getAllianceId, getCommanderUnit } from '../../src/game/rule_config';
import { classifyOutcome, type OutcomeKind } from '../../v13/tools/eval_v3_core';
import type { Action, GameState } from '../../src/game/types';

export interface TacticalSummary {
    ownCommanderHp: number | null;
    enemyCommanderHp: number | null;
    ownCommanderHpDelta: number;
    enemyCommanderHpDelta: number;
    ownUnitCount: number;
    enemyUnitCount: number;
    ownGold: number;
    enemyGold: number;
    turn: number;
}

export function tacticalOf(state: GameState, ownSeat: number, root: GameState): TacticalSummary {
    const enemy = state.players.find(p => areEnemyPlayers(state, ownSeat, p.id))?.id;
    const ownHp = getCommanderUnit(state, ownSeat)?.hp ?? null;
    const enemyHp = enemy === undefined ? null : getCommanderUnit(state, enemy)?.hp ?? null;
    const oldOwnHp = getCommanderUnit(root, ownSeat)?.hp ?? null;
    const oldEnemyHp = enemy === undefined ? null : getCommanderUnit(root, enemy)?.hp ?? null;
    return {
        ownCommanderHp: ownHp, enemyCommanderHp: enemyHp,
        ownCommanderHpDelta: ownHp !== null && oldOwnHp !== null ? ownHp - oldOwnHp : 0,
        enemyCommanderHpDelta: enemyHp !== null && oldEnemyHp !== null ? enemyHp - oldEnemyHp : 0,
        ownUnitCount: state.units.filter(u => u.ownerId === ownSeat).length,
        enemyUnitCount: state.units.filter(u => areEnemyPlayers(state, ownSeat, u.ownerId)).length,
        ownGold: state.players.find(p => p.id === ownSeat)?.gold ?? 0,
        enemyGold: state.players.filter(p => areEnemyPlayers(state, ownSeat, p.id)).reduce((n, p) => n + p.gold, 0),
        turn: state.turn,
    };
}

export interface ContinuationResult {
    outcomeKind: OutcomeKind;
    terminal: boolean;
    truncated: boolean;
    steps: number;
    error: string | null;
    finalTactical: TacticalSummary;
    wallTimeout: boolean;
    fullSequence: string[];
    appliedPrefix: string[];
    ms: number;
    /** 中文：第一次返回己方边界的实测局面，局部技能复核不读取最终胜负选分支。 */
    firstOwnBoundary: { stateJson: string; tactical: TacticalSummary; steps: number; terminal: boolean } | null;
}

export interface SimulationResult extends ContinuationResult {
    finalState: GameState;
    reachedBoundary: boolean;
    /** 中文：仅动作前缀的真实访问状态，供通过验证后的蒸馏使用。 */
    prefixStates: Array<{ stateJson: string; actionCode: string; legalActionCodes: string[] }>;
}

export interface SimulationOptions {
    ownPrefix?: readonly string[];
    stopAtOwnBoundary?: boolean;
    deadlineMs?: number;
    /** 中文：测试可注入时钟和己方策略，生产省略时保持网络argmax。 */
    now?: () => number;
    ownPolicy?: (engine: GameEngine, seat: number, legal: readonly Action[]) => Action;
}

/** 中文：从根开始连续消费H0流；无中途重置，不将预算结束当自然胜负。 */
export function simulateFromRoot(
    root: GameState,
    ownSeat: number,
    predictor: SpatialResNetPredictor,
    opponentRng: () => number,
    maxSteps: number,
    options: SimulationOptions = {},
): SimulationResult {
    const now = options.now ?? Date.now;
    const started = now();
    const deadline = options.deadlineMs ?? Infinity;
    const engine = new GameEngine(root);
    const prefix = options.ownPrefix ?? [];
    const seatAi = new Map<number, HeuristicAI>();
    const fullSequence: string[] = [];
    const appliedPrefix: string[] = [];
    const prefixStates: SimulationResult['prefixStates'] = [];
    let engineError: string | null = null;
    let policyError: string | null = null;
    let wallTimeout = false;
    let reachedBoundary = false;
    let sawOpponent = root.currentPlayer !== ownSeat;
    let leftInitialOwnTurn = sawOpponent;
    const initialTurn = root.turn;
    let firstOwnBoundary: ContinuationResult['firstOwnBoundary'] = null;

    while (!engine.isTerminal() && fullSequence.length < maxSteps) {
        if (now() >= deadline) { wallTimeout = true; break; }
        const state = engine.getState();
        const seat = state.currentPlayer;
        // 中文：对手被跳过时currentPlayer可能不变，turn变化仍标识新的己方回合。
        if (fullSequence.length > 0 && seat === ownSeat && (sawOpponent || state.turn !== initialTurn)) {
            if (!firstOwnBoundary) firstOwnBoundary = {
                stateJson: JSON.stringify(state), tactical: tacticalOf(state, ownSeat, root), steps: fullSequence.length, terminal: false,
            };
            if (options.stopAtOwnBoundary) { reachedBoundary = true; break; }
            leftInitialOwnTurn = true;
        }
        if (seat !== ownSeat) { sawOpponent = true; leftInitialOwnTurn = true; }
        let action: Action | null = null;
        let legal: Action[];
        try { legal = engine.getLegalActions(seat).filter(a => a.type !== 'surrender'); }
        catch (error) { engineError = String(error); break; }
        if (!legal.length) { policyError = `座位 ${seat} 无合法动作`; break; }
        const pendingPrefix = appliedPrefix.length < prefix.length;
        if (pendingPrefix && (seat !== ownSeat || leftInitialOwnTurn)) {
            policyError = '冻结的己方动作前缀跨越了根状态所在回合'; break;
        }
        try {
            if (pendingPrefix) action = legal.find(a => encodeAction(a) === prefix[appliedPrefix.length]) ?? null;
            else if (seat === ownSeat) action = options.ownPolicy
                ? options.ownPolicy(engine, seat, legal)
                : predictSpatialAction(predictor, state, seat, legal).action;
            else {
                if (!seatAi.has(seat)) seatAi.set(seat, new HeuristicAI(opponentRng));
                action = seatAi.get(seat)!.getAction(engine, seat, undefined);
            }
        } catch (error) { policyError = String(error); break; }
        if (!action || !legal.some(a => encodeAction(a) === encodeAction(action!))) {
            policyError = `座位 ${seat} 返回空动作或合法集外动作`; break;
        }
        // 中文：单次同步推理无法抢占，在它返回后再次检查截止时间。
        if (now() >= deadline) { wallTimeout = true; break; }
        const code = encodeAction(action);
        const stateJson = pendingPrefix ? JSON.stringify(state) : null;
        try {
            const result = engine.step(action);
            if (String(result.info ?? '').includes('非法动作')) {
                engineError = `引擎拒绝合法集中的动作：${code}`; break;
            }
        } catch (error) { engineError = String(error); break; }
        fullSequence.push(`P${seat}:${code}`);
        if (pendingPrefix) {
            appliedPrefix.push(code);
            prefixStates.push({ stateJson: stateJson!, actionCode: code, legalActionCodes: legal.map(encodeAction) });
        }
    }
    const finalState = engine.getState();
    // 中文：边界恰与步数上限重合时仍应识别完整回合；自然终局优先。
    if (!engine.isTerminal() && options.stopAtOwnBoundary && fullSequence.length > 0
        && finalState.currentPlayer === ownSeat && (sawOpponent || finalState.turn !== initialTurn)) reachedBoundary = true;
    if (!firstOwnBoundary && (reachedBoundary || engine.isTerminal())) firstOwnBoundary = {
        stateJson: JSON.stringify(finalState), tactical: tacticalOf(finalState, ownSeat, root),
        steps: fullSequence.length, terminal: engine.isTerminal(),
    };
    const error = policyError ?? engineError;
    const truncated = !engine.isTerminal() && !reachedBoundary && !error;
    const outcomeKind = classifyOutcome({
        engineError, policyError, cancelled: false, wallTimeout,
        winner: finalState.winner, winnerAlliance: finalState.winner,
        candidateAlliance: getAllianceId(finalState, ownSeat),
        steps: fullSequence.length, maxSteps, plies: 0, maxPlies: null,
    });
    return {
        outcomeKind, terminal: engine.isTerminal(), truncated, steps: fullSequence.length,
        error, finalTactical: tacticalOf(finalState, ownSeat, root), wallTimeout,
        fullSequence, appliedPrefix, ms: now() - started, firstOwnBoundary, finalState, reachedBoundary, prefixStates,
    };
}

/** 中文：兼容旧调用；正式独立验证由调用方传入原始根与冻结动作前缀。 */
export function continueToNaturalEnd(
    root: GameState, ownSeat: number, predictor: SpatialResNetPredictor,
    opponentRng: () => number, maxSteps: number, options: SimulationOptions = {},
): ContinuationResult {
    const { finalState, reachedBoundary, prefixStates, ...continuation } = simulateFromRoot(
        root, ownSeat, predictor, opponentRng, maxSteps, { ...options, stopAtOwnBoundary: false },
    );
    return continuation;
}
