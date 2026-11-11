import type { GameState } from '../../game/types';

/** 权威顺位按玩家ID递增。自动跳过无行动的己方时，轮回可以直接落到下一敌席。 */
export function crossedSelfTurn(before: Pick<GameState, 'currentPlayer' | 'turn'>, after: Pick<GameState, 'currentPlayer' | 'turn'>, self: number): boolean {
    if (after.currentPlayer === self && (before.currentPlayer !== self || after.turn !== before.turn)) return true;
    if (after.turn > before.turn + 1) return true;
    if (after.turn > before.turn) return self > before.currentPlayer || self < after.currentPlayer;
    return after.turn === before.turn && before.currentPlayer < self && self < after.currentPlayer;
}
