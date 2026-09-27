import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD'));
const h0 = new HeuristicAI();

console.log('--- Turn 1 P0 on The Crossing ---');
console.log('P0 gold at start:', engine.getState().players[0].gold);
const castles = [];
for (let y = 0; y < engine.getState().map.height; y++) {
  for (let x = 0; x < engine.getState().map.width; x++) {
    const t = engine.getState().map.tiles[y][x];
    if (t.ownerId === 0) console.log(`P0 Tile (${x},${y}): terrain=${t.terrainId}`);
  }
}
while (engine.getState().currentPlayer === 0) {
  const act = h0.getAction(engine, 0);
  console.log('Action:', JSON.stringify(act));
  engine.step(act);
}
console.log('P0 gold at end:', engine.getState().players[0].gold);
