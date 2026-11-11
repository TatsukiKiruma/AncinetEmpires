import { Action, GameState } from '../env/src/game/types';
import { encodeAction, decodeAction } from '../env/src/game/env';

export { encodeAction, decodeAction };

export interface ActionCandidate {
    action: Action;
    code: string;
    isEligible: boolean;
    searchCompleted?: boolean;
    qValue?: number | null;
}

export interface CandidateBatch {
    candidateCodes: string[];
    legalMask: boolean[];
    eligibleMask: boolean[];
    searchCompletedMask: boolean[];
    paddingMask: boolean[];
}

/**
 * 校验语义代码与动作是否相互转换一致
 */
export function verifyActionRoundtrip(action: Action): boolean {
    const code = encodeAction(action);
    const decoded = decodeAction(code);
    if (!decoded) return false;
    const reEncoded = encodeAction(decoded);
    return code === reEncoded;
}

/**
 * 构建合法动作及其候选掩码
 * @param legalActions 引擎返回的真实合法动作
 * @param allowSurrender 策略是否允许主动投降（默认 false）
 */
export function buildCandidateSet(
    legalActions: readonly Action[],
    allowSurrender: boolean = false
): {
    actions: Action[];
    candidateCodes: string[];
    eligibleMask: boolean[];
} {
    const actions: Action[] = [...legalActions];
    const candidateCodes: string[] = actions.map(encodeAction);
    let eligibleMask: boolean[] = actions.map(a => {
        if (a.type === 'surrender') {
            return allowSurrender;
        }
        return true;
    });

    // 若过滤后无可用动作（例如仅剩 surrender 且不可避免），允许唯一的合法动作以避免空集
    const eligibleCount = eligibleMask.filter(Boolean).length;
    if (eligibleCount === 0 && actions.length > 0) {
        eligibleMask = actions.map(() => true);
    }

    return {
        actions,
        candidateCodes,
        eligibleMask
    };
}
