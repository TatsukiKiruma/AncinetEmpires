import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';
import { isCommanderUnit } from '../src/game/rule_config';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const heu = new HeuristicAI();

let step = 0;
while (engine.getState().winner === null && engine.getState().turn <= 15) {
  const s = engine.getState();
  const pid = s.currentPlayer;
  if (s.turn >= 9 && pid === 0) {
    console.log(`\n--- Turn ${s.turn} P0 (Model) Actions ---`);
  }
  let action: any;
  if (pid === 0) {
    const res = getSpatialAiActionSync(engine, 0, { policy: 'spatial_v2_experimental', allowInteractiveFallback: false });
    action = res.action;
    if (s.turn >= 9) {
      console.log(`  Model Action: ${JSON.stringify(action)} (value: ${res.source})`);
    }
  } else {
    action = heu.getAction(engine, 1);
    if (s.turn >= 9) {
      console.log(`  Heuristic Action: ${JSON.stringify(action)}`);
    }
  }
  engine.step(action);
  step++;
}
