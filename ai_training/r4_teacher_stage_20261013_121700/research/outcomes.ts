import { GameState } from '../env/src/game/types';
import { getAllianceId } from '../env/src/game/rule_config';

export type EpisodeTerminationReason =
    | 'natural_win'
    | 'natural_draw'
    | 'truncated_ply_limit'
    | 'truncated_step_limit'
    | 'truncated_repeated_state'
    | 'truncated_wall_seconds'
    | 'error_illegal_action'
    | 'error_worker_timeout'
    | 'error_exception';

export interface MatchOutcome {
    terminationReason: EpisodeTerminationReason;
    isNaturalTerminal: boolean;
    isTruncated: boolean;
    isError: boolean;
    winner: number | null; // 规则返回的 winner（通常为获胜的联盟 ID 或 -1 平局）
    winnerAlliance: number | null;
    totalAtomicActions: number;
    totalHandoffs: number;
    totalRounds: number;
    wallDurationMs: number;
    finalStateHash: string;
    details?: string;
}

/**
 * 根据观察者联盟 ID 和终局结果计算样本的真实价值标签
 * 严禁给非自然终局或代理结束赋 ±1 胜负标签！
 */
export function computeValueTarget(
    outcome: MatchOutcome,
    observerAllianceId: number
): 1.0 | 0.0 | -1.0 | null {
    if (!outcome.isNaturalTerminal) {
        return null;
    }
    if (outcome.terminationReason === 'natural_draw' || outcome.winner === -1) {
        return 0.0;
    }
    if (outcome.winnerAlliance === observerAllianceId) {
        return 1.0;
    }
    return -1.0;
}

/**
 * 从当前 GameEngine 状态提取自然终局信息
 */
export function inspectTerminalState(state: GameState): {
    isTerminal: boolean;
    terminationReason: EpisodeTerminationReason | null;
    winnerAlliance: number | null;
} {
    const winner = state.winner;
    if (winner === null) {
        return { isTerminal: false, terminationReason: null, winnerAlliance: null };
    }
    if (winner === -1) {
        return { isTerminal: true, terminationReason: 'natural_draw', winnerAlliance: -1 };
    }
    // winner 为获胜玩家的联盟 ID
    return {
        isTerminal: true,
        terminationReason: 'natural_win',
        winnerAlliance: winner
    };
}
