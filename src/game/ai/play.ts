import { GameEngine } from '../engine';
import { HeuristicAI } from './heuristic_ai';
import { RandomAI } from './random_ai';
import { createDemoState } from '../demo_map';

export async function playAutoGame(delayMs: number = 0, onStep?: (engine: GameEngine, turnInfo: string) => void) {
    const engine = new GameEngine(createDemoState());
    const ais = [new HeuristicAI(), new RandomAI()]; // P0 is Heuristic, P1 is Random
    
    let logs: string[] = [];
    let stepCount = 0;
    while (!engine.isTerminal() && stepCount < 200) {
        const cp = engine.getState().currentPlayer;
        const ai = ais[cp];
        const action = ai.getAction(engine, cp);
        
        const result = engine.step(action);
        
        const logLine = `Step ${stepCount}: P${cp} takes ${action.type}. ${result.info}`;
        logs.push(logLine);
        
        if (onStep) {
            onStep(engine.clone(), logLine);
            if (delayMs > 0) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
        
        stepCount++;
    }

    if (onStep) {
        onStep(engine, `Game Ended. Winner: ${engine.getWinner()}`);
    }

    return {
        winner: engine.getWinner(),
        logs,
        finalState: engine.getState()
    };
}
