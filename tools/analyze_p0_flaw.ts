import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

for (const map of ['(2) Liberty Port.aem', '(2) The Crossing.aem']) {
  console.log(`\n=== Analyzing Heuristic vs Heuristic on ${map} ===`);
  const engine = new GameEngine(createAppApkSkirmishGameState(map, 'SD'));
  const h0 = new HeuristicAI();
  const h1 = new HeuristicAI();

  for (let turn = 1; turn <= 6; turn++) {
    while (engine.getState().currentPlayer === 0) engine.step(h0.getAction(engine, 0));
    while (engine.getState().currentPlayer === 1) engine.step(h1.getAction(engine, 1));
    const s = engine.getState();
    const u0 = s.units.filter(u => u.ownerId === 0 && u.hp > 0);
    const u1 = s.units.filter(u => u.ownerId === 1 && u.hp > 0);
    const c0 = u0.find(u => u.unitClass === 'commander');
    const c1 = u1.find(u => u.unitClass === 'commander');
    console.log(`Turn ${turn}: P0 gold=${s.players[0].gold} units=${u0.length} commHP=${c0?.hp ?? 'DEAD'} | P1 gold=${s.players[1].gold} units=${u1.length} commHP=${c1?.hp ?? 'DEAD'}`);
  }
}
