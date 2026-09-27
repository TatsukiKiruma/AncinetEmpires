import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { TrainedNeuralModelAI } from '../src/game/ai/trained_neural_model_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const ai = new TrainedNeuralModelAI();
const heu = new HeuristicAI();

let step = 0;
while (engine.getState().winner === null && engine.getState().turn <= 12) {
  const s = engine.getState();
  const pid = s.currentPlayer;
  const isModel = pid === 0;
  const action = isModel ? ai.getAction(engine, 0) : heu.getAction(engine, 1);

  if (s.turn === 12 && isModel) {
    const comm0 = s.units.find(u => u.ownerId === 0 && u.unitClass === 'commander');
    const comm1 = s.units.find(u => u.ownerId === 1 && u.unitClass === 'commander');
    console.log(`[T12 State] Comm0 HP: ${comm0?.hp}, Comm1 HP: ${comm1?.hp}`);
    console.log('P0 units:', s.units.filter(u => u.ownerId === 0 && u.hp > 0).map(u => `${u.unitClass}(${u.hp}hp)`).join(', '));
    console.log('P1 units:', s.units.filter(u => u.ownerId === 1 && u.hp > 0).map(u => `${u.unitClass}(${u.hp}hp)`).join(', '));
  }
  engine.step(action);
  step++;
}
