import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const engine = new GameEngine(createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD'));
const h0 = new HeuristicAI();
const h1 = new HeuristicAI();

let steps = 0;
while (engine.getState().winner === null && steps < 1200 && engine.getState().turn <= 30) {
  const s = engine.getState();
  if (s.turn <= 10 && steps % 10 === 0) {
    const p0U = s.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
    const p1U = s.units.filter(u => u.ownerId === 1 && u.hp > 0).length;
    console.log(`[T${s.turn}] P0 gold=${s.players[0].gold} units=${p0U} | P1 gold=${s.players[1].gold} units=${p1U}`);
  }
  const ai = s.currentPlayer === 0 ? h0 : h1;
  const act = ai.getAction(engine, s.currentPlayer);
  engine.step(act);
  steps++;
}
const end = engine.getState();
console.log(`Peak Island finished at Turn ${end.turn}, winner=P${end.winner}`);
