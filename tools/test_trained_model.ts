import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { TrainedNeuralModelAI } from '../src/game/ai/trained_neural_model_ai';

const mapName = process.argv[2] || '(2) Liberty Port.aem';
const p0IsModel = process.argv[3] !== 'heuristic';

console.log(`Testing TrainedNeuralModelAI on ${mapName} (P0: ${p0IsModel ? 'Model' : 'Heuristic'})...`);
const engine = new GameEngine(createAppApkSkirmishGameState(mapName, 'SD'));
const modelAI = new TrainedNeuralModelAI();
const heu = new HeuristicAI();

let steps = 0;
let lastTurn = -1;
const t0 = Date.now();

while (engine.getState().winner === null && steps < 500 && engine.getState().turn <= 50) {
  const s = engine.getState();
  if (s.turn !== lastTurn) {
    lastTurn = s.turn;
    const u0 = s.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
    const u1 = s.units.filter(u => u.ownerId === 1 && u.hp > 0).length;
    console.log(`[T${s.turn}] gold=${s.players[0].gold}/${s.players[1].gold} units=${u0}/${u1} steps=${steps} (${Date.now() - t0}ms)`);
  }
  const isModel = (p0IsModel && s.currentPlayer === 0) || (!p0IsModel && s.currentPlayer === 1);
  const act = isModel ? modelAI.getAction(engine, s.currentPlayer) : heu.getAction(engine, s.currentPlayer);
  engine.step(act);
  steps++;
}
const st = engine.getState();
const modelWon = (p0IsModel && st.winner === 0) || (!p0IsModel && st.winner === 1);
console.log(`Finished: winner=P${st.winner} (${modelWon ? 'MODEL WON!' : 'Heuristic won'}) in ${st.turn} turns, ${steps} steps (${Date.now() - t0}ms)`);
