import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';
import { getAiAction, type SupportedAiPolicy, type AiActionResult } from './neural_ai_adapter';

export interface AutoGameOptions {
    delayMs?: number;
    p0Policy?: SupportedAiPolicy;
    p1Policy?: SupportedAiPolicy;
    onStep?: (engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void;
}

export async function playAutoGame(
    delayOrOptions: number | AutoGameOptions = 0,
    legacyOnStep?: (engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void
) {
    let delayMs = 0;
    let p0Policy: SupportedAiPolicy = 'heuristic';
    let p1Policy: SupportedAiPolicy = 'random';
    let onStep: ((engine: GameEngine, turnInfo: string, meta?: AiActionResult) => void) | undefined;

    if (typeof delayOrOptions === 'number') {
        delayMs = delayOrOptions;
        onStep = legacyOnStep;
    } else {
        delayMs = delayOrOptions.delayMs ?? 0;
        p0Policy = delayOrOptions.p0Policy ?? 'heuristic';
        p1Policy = delayOrOptions.p1Policy ?? 'random';
        onStep = delayOrOptions.onStep ?? legacyOnStep;
    }

    const engine = new GameEngine(createDefaultAppGameState());
    const policies: Record<number, SupportedAiPolicy> = {
        0: p0Policy,
        1: p1Policy
    };

    let logs: string[] = [];
    let stepCount = 0;
    while (!engine.isTerminal() && stepCount < 200) {
        const cp = engine.getState().currentPlayer;
        const policy = policies[cp] ?? 'heuristic';
        const aiResult = getAiAction(policy, engine, cp);
        const action = aiResult.action;

        const result = engine.step(action);

        const nodeInfo = aiResult.nodesExpanded !== undefined ? `, 节点: ${aiResult.nodesExpanded}` : '';
        const logLine = `Step ${stepCount}: P${cp} [${aiResult.source}] 执行 ${action.type} (耗时: ${aiResult.latencyMs}ms${nodeInfo}). ${result.info}`;
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
