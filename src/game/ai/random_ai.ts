import { Action } from '../types';
import { GameEngine } from '../engine';

export type Rng = () => number;

export class RandomAI {
    private rng: Rng;

    constructor(rng?: Rng) {
        this.rng = rng ?? Math.random;
    }

    public getAction(
        engine: GameEngine,
        playerId: number,
        preparedActions?: readonly Action[]
    ): Action {
        const actions = preparedActions ?? engine.getLegalActions(playerId);
        
        // 确保不会出错
        if (actions.length === 0) {
           return { type: 'end_turn' };
        }

        // 随机选择动作，但避免把投降当作普通推进动作。
        const nonEndActions = actions.filter(a => a.type !== 'end_turn' && a.type !== 'surrender');
        if (nonEndActions.length > 0 && this.rng() < 0.9) {
            const idx = Math.floor(this.rng() * nonEndActions.length);
            return nonEndActions[idx];
        }

        const fallbackActions = actions.filter(a => a.type !== 'surrender');
        const selectableActions = fallbackActions.length > 0 ? fallbackActions : actions;
        const idx = Math.floor(this.rng() * selectableActions.length);
        return selectableActions[idx];
    }
}
