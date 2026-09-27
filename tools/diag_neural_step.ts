import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const heu = new HeuristicAI();

console.log('Starting diag match on Liberty Port...');
for (let step = 0; step < 20; step++) {
  const s = engine.getState();
  if (s.winner !== null) {
    console.log(`Game over at step ${step}, winner: ${s.winner}`);
    break;
  }
  const t0 = Date.now();
  if (s.currentPlayer === 0) {
    const act = getSpatialAiActionSync(engine, 0, { policy: 'spatial_v2_experimental', allowInteractiveFallback: false });
    const ms = Date.now() - t0;
    console.log(`Step ${step} (T${s.turn} P0 Spatial): action=${act.action.type}, took ${ms}ms`);
    engine.step(act.action);
  } else {
    const act = heu.getAction(engine, 1);
    const ms = Date.now() - t0;
    console.log(`Step ${step} (T${s.turn} P1 Heuristic): action=${act.type}, took ${ms}ms`);
    engine.step(act);
  }
}
console.log('Done 20 steps.');
