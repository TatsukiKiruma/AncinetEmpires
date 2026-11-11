import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { computeStateHash } from './state_hash';
import { Policy } from './match_runner';

export type OpeningFamily = '0_handoff' | '4_handoff' | '8_handoff';

export interface OpeningStateResult {
    family: OpeningFamily;
    mapName: string;
    targetHandoffs: number;
    actualHandoffs: number;
    initialBoardHash: string;
    openingState: GameState;
    openingStateHash: string;
    openingActionCodes: string[];
    isTerminalDuringOpening: boolean;
}

/**
 * 真实换手开局生成器
 * 严格以玩家轮替 (currentPlayer 改变) 计数换手数，
 * 若策略产生非法动作必须显式抛出异常，严禁静默回退！
 */
export function generateRealHandoffOpening(
    mapName: string,
    family: OpeningFamily,
    baselinePolicy: Policy,
    stepSeed: number = 42
): OpeningStateResult {
    const rawState = createAppApkSkirmishGameState(mapName, 'SD');
    const initialBoardHash = computeStateHash(rawState);

    if (family === '0_handoff') {
        return {
            family,
            mapName,
            targetHandoffs: 0,
            actualHandoffs: 0,
            initialBoardHash,
            openingState: rawState,
            openingStateHash: initialBoardHash,
            openingActionCodes: [],
            isTerminalDuringOpening: false
        };
    }

    const targetHandoffs = family === '4_handoff' ? 4 : 8;
    const engine = new GameEngine(JSON.parse(JSON.stringify(rawState)));
    const openingActionCodes: string[] = [];

    let currentHandoffs = 0;
    let previousPlayer = engine.getState().currentPlayer;
    let atomicStepLimit = 500; // 安全上限，防止单一回合死循环
    let stepCount = 0;

    while (currentHandoffs < targetHandoffs && !engine.isTerminal() && stepCount < atomicStepLimit) {
        stepCount++;
        const curr = engine.getState();
        const currPlayer = curr.currentPlayer;

        const legal = engine.getLegalActions(currPlayer);
        if (legal.length === 0) {
            break;
        }

        const candidateCodes = legal.map(encodeAction);
        const chosenCode = baselinePolicy.chooseAction({
            engineClone: engine.clone(),
            observerPlayerId: currPlayer,
            legalActions: legal,
            candidateCodes,
            stateHash: computeStateHash(curr),
            stepIndex: stepCount
        });

        // 处理 Promise 或 string
        const chosenStr = typeof chosenCode === 'string' ? chosenCode : '';
        if (!chosenStr) {
            throw new Error(`[OpeningGenerator] Policy returned empty action code at step ${stepCount}`);
        }

        const matchedIdx = candidateCodes.indexOf(chosenStr);
        if (matchedIdx === -1) {
            throw new Error(
                `[OpeningGenerator] Illegal action chosen by baseline policy: "${chosenStr}". ` +
                `Legal actions count: ${candidateCodes.length}. Silent fallback is strictly forbidden.`
            );
        }

        const res = engine.step(legal[matchedIdx]);
        if (res.info.includes('非法动作')) {
            throw new Error(`[OpeningGenerator] Engine rejected action "${chosenStr}": ${res.info}`);
        }

        openingActionCodes.push(chosenStr);

        const nextPlayer = engine.getState().currentPlayer;
        if (nextPlayer !== previousPlayer) {
            currentHandoffs++;
            previousPlayer = nextPlayer;
        }
    }

    const finalOpeningState = engine.getState();
    const finalHash = computeStateHash(finalOpeningState);

    return {
        family,
        mapName,
        targetHandoffs,
        actualHandoffs: currentHandoffs,
        initialBoardHash,
        openingState: finalOpeningState,
        openingStateHash: finalHash,
        openingActionCodes,
        isTerminalDuringOpening: engine.isTerminal()
    };
}
