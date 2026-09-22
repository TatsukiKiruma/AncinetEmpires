import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { type SupportedAiPolicy, type AiActionResult } from './neural_ai_adapter';
import { runCancellableAiAction } from './cancellable_ai_runner';

export interface AutoGameOptions {
    delayMs?: number;
    p0Policy?: SupportedAiPolicy;
    p1Policy?: SupportedAiPolicy;
    deadlineMs?: number;
    maxSteps?: number;
    signal?: AbortSignal;
    onStep?: (engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void;
}

export async function playAutoGame(
    delayOrOptions: number | AutoGameOptions = 0,
    legacyOnStep?: (engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void
) {
    let delayMs = 0;
    let p0Policy: SupportedAiPolicy = 'heuristic';
    let p1Policy: SupportedAiPolicy = 'random';
    let deadlineMs = 1000;
    let maxSteps = 200;
    let signal: AbortSignal | undefined;
    let onStep: ((engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void) | undefined;

    if (typeof delayOrOptions === 'number') {
        delayMs = delayOrOptions;
        onStep = legacyOnStep;
    } else {
        delayMs = delayOrOptions.delayMs ?? 0;
        p0Policy = delayOrOptions.p0Policy ?? 'heuristic';
        p1Policy = delayOrOptions.p1Policy ?? 'random';
        deadlineMs = delayOrOptions.deadlineMs ?? 1000;
        maxSteps = delayOrOptions.maxSteps ?? 200;
        signal = delayOrOptions.signal;
        onStep = delayOrOptions.onStep ?? legacyOnStep;
    }

    const engine = new GameEngine(createDefaultAppGameState());
    const policies: Record<number, SupportedAiPolicy> = {
        0: p0Policy,
        1: p1Policy
    };

    let logs: string[] = [];
    let stepCount = 0;
    while (!engine.isTerminal() && stepCount < maxSteps) {
        if (signal?.aborted) {
            logs.push(`Step ${stepCount}: Auto game aborted by signal.`);
            break;
        }

        const cp = engine.getState().currentPlayer;
        const policy = policies[cp] ?? 'heuristic';
        const currentTurn = engine.getState().turn;
        const currentVersion = `${currentTurn}_${cp}_${stepCount}`;
        const aiResult = await runCancellableAiAction({
            policy,
            engine,
            playerId: cp,
            deadlineMs,
            signal,
            stateVersion: currentVersion,
            getCurrentStateVersion: () => `${engine.getState().turn}_${engine.getState().currentPlayer}_${stepCount}`
        });
        if (aiResult.status === 'CANCELLED' || aiResult.status === 'STALE') {
            logs.push(`Step ${stepCount}: AI decision was ${aiResult.status} (${aiResult.fallbackReason ?? 'aborted'}). Not applying action.`);
            break;
        }

        const action = aiResult.action;
        const result = engine.step(action);

        const nodeInfo = aiResult.nodesExpanded !== undefined ? `, 节点: ${aiResult.nodesExpanded}` : '';
        const fallbackInfo = aiResult.fallbackUsed ? ` [Fallback: ${aiResult.fallbackReason}]` : '';
        const logLine = `Step ${stepCount}: P${cp} [${aiResult.source}] 执行 ${action.type} (耗时: ${aiResult.latencyMs}ms${nodeInfo}${fallbackInfo}). ${result.info}`;
        logs.push(logLine);

        if (onStep) {
            onStep(engine.clone(), logLine, aiResult);
            if (delayMs > 0) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        stepCount++;
    }

    if (onStep) {
        onStep(engine, `Game Ended. Winner: ${engine.getWinner()}`);
    }

    return {
        winner: engine.getWinner(),
        logs,
        finalState: engine.getState()
    };
}
