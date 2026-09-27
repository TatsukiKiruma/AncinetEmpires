import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const maps = [
  '(2) Liberty Port.aem',
  '(2) Peak Island.aem',
  '(2) Icy Paths.aem',
  '(2) The Crossing.aem',
  '(2) Mourningstar.aem'
];

console.log('Testing simulation speed of 10 matches...');
const t0 = Date.now();
let totalSteps = 0;

for (let i = 0; i < 2; i++) {
  const mapName = maps[i % maps.length];
  const engine = new GameEngine(createAppApkSkirmishGameState(mapName, 'SD'));
  const h0 = new HeuristicAI();
  const h1 = new HeuristicAI();
  let steps = 0;
  let lastTurn = -1;
  const mt0 = Date.now();
  while (engine.getState().winner === null && steps < 1000 && engine.getState().turn <= 100) {
    const s = engine.getState();
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      if (s.turn % 5 === 0) {
        console.log(`  [Match ${i + 1}] Turn ${s.turn}, steps=${steps} (${Date.now() - mt0}ms)`);
      }
    }
    const ai = s.currentPlayer === 0 ? h0 : h1;
    const act = ai.getAction(engine, s.currentPlayer);
    engine.step(act);
    steps++;
  }
  totalSteps += steps;
  console.log(`Match ${i + 1} (${mapName}): winner=P${engine.getState().winner}, turns=${engine.getState().turn}, steps=${steps} (${Date.now() - mt0}ms)`);
}

const elapsed = Date.now() - t0;
console.log(`Finished 10 matches (${totalSteps} steps) in ${elapsed}ms (${(elapsed / 10).toFixed(0)}ms/match)`);
