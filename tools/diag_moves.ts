import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { TrainedNeuralModelAI } from '../src/game/ai/trained_neural_model_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const modelAI = new TrainedNeuralModelAI();
const heu = new HeuristicAI();

for (let turn = 1; turn <= 7; turn++) {
  console.log(`\n=== TURN ${turn} ===`);
  while (engine.getState().currentPlayer === 0 && engine.getState().winner === null) {
    const act = modelAI.getAction(engine, 0);
    console.log('[P0 Model Act]', JSON.stringify(act));
    engine.step(act);
  }
  while (engine.getState().currentPlayer === 1 && engine.getState().winner === null) {
    const act = heu.getAction(engine, 1);
    engine.step(act);
  }
  const s = engine.getState();
  const p0Units = s.units.filter(u => u.ownerId === 0 && u.hp > 0);
  const p1Units = s.units.filter(u => u.ownerId === 1 && u.hp > 0);
  console.log(`Turn ${turn} end: P0 Gold=${s.players[0].gold} Units=${p0Units.length} | P1 Gold=${s.players[1].gold} Units=${p1Units.length}`);
  for (const u of p0Units) {
    console.log(`  P0 ${u.unitClass} at (${u.pos.x},${u.pos.y}) hp=${u.hp}`);
  }
}
