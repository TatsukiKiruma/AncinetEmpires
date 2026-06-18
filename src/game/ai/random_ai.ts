import { Action } from '../types';
import { GameEngine } from '../engine';

export class RandomAI {
    public getAction(engine: GameEngine, playerId: number): Action {
        const actions = engine.getLegalActions(playerId);
        
        // 确保不会出错
        if (actions.length === 0) {
           return { type: 'end_turn' };
        }

        // 随机选择动作，但适当增加非end_turn动作的几率，避免总是秒过回合
        const nonEndActions = actions.filter(a => a.type !== 'end_turn');
        if (nonEndActions.length > 0 && Math.random() < 0.9) {
            const idx = Math.floor(Math.random() * nonEndActions.length);
            return nonEndActions[idx];
        }

        const idx = Math.floor(Math.random() * actions.length);
        return actions[idx];
    }
}
