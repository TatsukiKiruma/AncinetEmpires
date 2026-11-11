import type { GameState } from '../../src/game/types';
import type { PlayerOrder } from '../../src/ai_runtime/dual_v2/contract';
import { encodeOutcomeTarget } from '../../src/ai_runtime/dual_v2/player_order';

/** 联盟共享终局结果，但监督质量只分配给观测前态仍活跃的槽，与价值头mask一致。 */
export function activeOutcomeTarget(state: GameState, order: PlayerOrder, winner: number | null) {
    const outcome = encodeOutcomeTarget(state, order, winner !== null, winner);
    if (!outcome.valueMask) return outcome;
    let mass = 0;
    for (let i = 0; i < outcome.target.length; i++) { if (!order.active[i]) outcome.target[i] = 0; mass += outcome.target[i]; }
    if (!(mass > 0)) throw Error('自然终局在观测活跃槽中没有有效赢家，拒绝生成价值标签');
    for (let i = 0; i < outcome.target.length; i++) outcome.target[i] /= mass;
    return outcome;
}
