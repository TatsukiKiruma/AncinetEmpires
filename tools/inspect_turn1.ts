import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD'));
const h0 = new HeuristicAI();
const h1 = new HeuristicAI();

console.log('--- TURN 1 ---');
while (engine.getState().currentPlayer === 0) {
  const act = h0.getAction(engine, 0);
  console.log('P0:', JSON.stringify(act));
  engine.step(act);
}
console.log('P0 end turn 1. Player gold:', engine.getState().players[0].gold);
while (engine.getState().currentPlayer === 1) {
  const act = h1.getAction(engine, 1);
  console.log('P1:', JSON.stringify(act));
  engine.step(act);
}
console.log('P1 end turn 1. Player gold:', engine.getState().players[1].gold);
