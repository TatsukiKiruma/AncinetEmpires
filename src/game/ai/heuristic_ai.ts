import { Action } from '../types';
import { GameEngine } from '../engine';
import { areEnemyPlayers } from '../rule_config';

export type Rng = () => number;

export class HeuristicAI {
    private rng: Rng;

    constructor(rng?: Rng) {
        this.rng = rng ?? Math.random;
    }

    public getAction(engine: GameEngine, playerId: number): Action {
        const actions = engine.getLegalActions(playerId);
        
        if (actions.length === 0) return { type: 'end_turn' };

        let bestAction = actions[0];
        let maxScore = -Infinity;

        for (const action of actions) {
            let score = 0;
            switch(action.type) {
                case 'attack':
                    score = 1000;
                    const sim = engine.clone();
                    sim.step(action);
                    
                    const beforeState = engine.getState();
                    const afterState = sim.getState();
                    const oldEnemyCount = beforeState.units.filter(u => areEnemyPlayers(beforeState, playerId, u.ownerId)).length;
                    const newEnemyCount = afterState.units.filter(u => areEnemyPlayers(afterState, playerId, u.ownerId)).length;
                    
                    if (newEnemyCount < oldEnemyCount) {
                        score += 5000;
                    }
                    score += this.rng() * 100;
                    break;
                case 'capture':
                    score = 800;
                    break;
                case 'repair':
                    score = 750;
                    break;
                case 'recruit_to_castle':
                case 'recruit_and_deploy':
                    score = 200;
                    break;
                case 'move':
                    score = 10 + this.rng() * 10;
                    break;
                case 'wait':
                    score = 0; 
                    break;
                case 'surrender':
                    score = -10000;
                    break;
                case 'end_turn':
                    score = -100; 
                    break;
            }

            if (score > maxScore) {
                maxScore = score;
                bestAction = action;
            }
        }

        return bestAction;
    }
}
