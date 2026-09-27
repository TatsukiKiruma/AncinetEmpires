import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD'));
const h0 = new HeuristicAI();
const h1 = new HeuristicAI();

while (engine.getState().currentPlayer === 0) engine.step(h0.getAction(engine, 0));
while (engine.getState().currentPlayer === 1) engine.step(h1.getAction(engine, 1));

console.log('--- Turn 2 P0 on The Crossing ---');
console.log('P0 gold at start of Turn 2:', engine.getState().players[0].gold);
while (engine.getState().currentPlayer === 0) {
  const act = h0.getAction(engine, 0);
  console.log('Action:', JSON.stringify(act));
  engine.step(act);
}
console.log('P0 gold at end of Turn 2:', engine.getState().players[0].gold);
