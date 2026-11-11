import type { GameEngine } from '../../game/engine';
import { ReachabilityContext } from './reachability';
import { tacticalActionPriors } from './tactical_prior';
import { RetaliationGoalPaths } from './retaliation_paths';

/** 全部合法招募也参与完整战术排序；反扑与己方共享集火、夺城和守城规则。 */
export function retaliationFirst(engine: GameEngine) {
    const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    const context = new ReachabilityContext(state), goals = new RetaliationGoalPaths(state);
    context.paths.cost = goals.cost.bind(goals);
    return tacticalActionPriors(state, legal, context).map((p, i) => ({ action: legal[i], score: p.prior, immediate: p.immediate, forbidden: p.forbidden }))
        .filter(p => !p.forbidden).sort((a, b) => b.score - a.score)[0];
}
