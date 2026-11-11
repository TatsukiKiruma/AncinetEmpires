import type { GameEngine } from '../../game/engine';
import type { Action } from '../../game/types';
import { encodeAction } from '../../game/env';

/** 在独立实例和克隆引擎上预热，工厂再次创建正式实例以隔离队列和随机流。 */
export function warmedPolicy<T extends { getAction(engine: GameEngine, player: number, legal: Action[]): Action }>(engine: GameEngine, create: (warmup: boolean) => T): T {
    const clone = engine.clone(), policy = create(true);
    // 同时走过根决策与队列快返，让只读比较也在正式计时前完成JIT预热。
    for (let i = 0; i < 3 && !clone.isTerminal(); i++) {
        const player = clone.getState().currentPlayer;
        const legal = clone.getLegalActions(player).filter(a => a.type !== 'surrender').sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0);
        if (!legal.length) break;
        clone.step(policy.getAction(clone, player, legal));
    }
    return create(false);
}
