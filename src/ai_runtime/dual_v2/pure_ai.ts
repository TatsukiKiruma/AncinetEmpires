import type { GameEngine } from '../../game/engine';
import type { Action } from '../../game/types';
import { encodeDualObservation } from './encoder';
import { decodeFactoredAction } from './factored_actions';
import { POINTER_DIM } from './contract';
import type { DualStreamModel } from './model_runtime';
import { ReachabilityContext } from './reachability';
import { tacticalActionPriors, decodeTacticalGroups } from './tactical_prior';

/** 直接使用合法候选的策略分数；相同分数保留权威候选顺序。 */
export class DualStreamPureAI {
    constructor(private readonly model: DualStreamModel, private readonly options: { tactical?: boolean; headBias?: readonly number[] } = {}) {}

    getAction(engine: GameEngine, playerId: number): Action {
        const state = engine.getState();
        if (state.currentPlayer !== playerId || engine.isTerminal()) throw Error('纯策略只能为当前行动玩家选择动作');
        const legal = engine.getLegalActions(playerId).filter(action => action.type !== 'surrender');
        if (!legal.length) throw Error('当前局面没有非投降合法动作');
        if (legal.length === 1) return legal[0];
        const context = this.options.tactical ? new ReachabilityContext(state) : undefined;
        const observation = encodeDualObservation(state, legal, context);
        const output = this.model.forward(observation);
        if (context) {
            const { index } = decodeTacticalGroups(output.logits, observation.actions.pointers, tacticalActionPriors(state, legal, context), this.options.headBias);
            return legal[observation.actions.sourceIndices[index]];
        }
        let best = 0;
        for (let i = 1; i < output.logits.length; i++) if (output.logits[i] > output.logits[best]) best = i;
        return decodeFactoredAction(state, observation.entityIndexMap, observation.actions.pointers.subarray(best * POINTER_DIM, (best + 1) * POINTER_DIM));
    }
}
