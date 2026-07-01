import { Action } from '../types';
import { GameEngine } from '../engine';

export type Rng = () => number;

export class RandomAI {
    private rng: Rng;

    constructor(rng?: Rng) {
        this.rng = rng ?? Math.random;
    }

    public getAction(engine: GameEngine, playerId: number): Action {
        const actions = engine.getLegalActions(playerId);
        
        // 确保不会出错
        if (actions.length === 0) {
           return { type: 'end_turn' };
        }

        // 随机选择动作，但适当增加非end_turn动作的几率，避免总是秒过回合
        const nonEndActions = actions.filter(a => a.type !== 'end_turn');
        if (nonEndActions.length > 0 && this.rng() < 0.9) {
            const idx = Math.floor(this.rng() * nonEndActions.length);
            return nonEndActions[idx];
        }

        const idx = Math.floor(this.rng() * actions.length);
        return actions[idx];
    }
}
