import { Action } from '../types';
import { GameEngine } from '../engine';

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
                    
                    const oldEnemyCount = engine.getState().units.filter(u => u.ownerId !== playerId).length;
                    const newEnemyCount = sim.getState().units.filter(u => u.ownerId !== playerId).length;
                    
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
                case 'recruit':
                    score = 200;
                    break;
                case 'move':
                    score = 10 + this.rng() * 10;
                    break;
                case 'wait':
                    score = 0; 
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
